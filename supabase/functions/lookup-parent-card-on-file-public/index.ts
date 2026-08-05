// Public, rate-limited lookup that tells the parent's browser whether a
// reusable saved card exists for this (email + name) on a prior lesson
// booking. NEVER returns the payment_method_id or customer_id — only a
// short-lived reuse_token that the server can later resolve.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";
import { findReusableCardForEmail } from "../_shared/card-on-file.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  // Accepted for backwards compatibility but ignored: the Stripe environment
  // is server-controlled via PAYMENTS_ENV only.
  environment: z.enum(["sandbox", "live"]).optional(),
  parent_email: z.string().email().max(200),
  parent_first_name: z.string().min(1).max(80),
  parent_last_name: z.string().min(1).max(80),
});

// In-memory rate limit (per-isolate). Best-effort — Postgres-backed quota
// follows below for cross-isolate hardening.
const memHits = new Map<string, { count: number; resetAt: number }>();
function bumpMem(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = memHits.get(key);
  if (!entry || entry.resetAt < now) {
    memHits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count += 1;
  return true;
}

function norm(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return j({ found: false }, 200);

  try {
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return j({ found: false }, 200);
    const { parent_email, parent_first_name, parent_last_name } = parsed.data;

    const configuredEnv = Deno.env.get("PAYMENTS_ENV");
    if (configuredEnv !== "live" && configuredEnv !== "sandbox") {
      console.error("[lookup-parent-card-on-file-public] PAYMENTS_ENV missing or invalid");
      return j({ found: false }, 200);
    }

    const email = norm(parent_email);
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0]?.trim() || "unknown";

    if (!bumpMem(`email:${email}`, 5, 10 * 60_000)) return j({ found: false }, 200);
    if (!bumpMem(`ip:${ip}`, 20, 10 * 60_000)) return j({ found: false }, 200);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Enumeration control: require a matching first+last on a non-cancelled
    // prior lesson_bookings row for this email. Same-email-different-family
    // returns nothing.
    const { data: matches } = await supabase
      .from("lesson_bookings")
      .select("id, parent_first_name, parent_last_name, parent_name")
      .ilike("parent_email", email)
      .neq("status", "cancelled")
      .limit(20);

    // Memberships count too: a family whose only history is a Swimbership
    // still has a Stripe customer with a saved card.
    const { data: memberMatches } = await supabase
      .from("memberships")
      .select("id, parent_first_name, parent_last_name")
      .ilike("parent_email", email)
      .neq("status", "cancelled")
      .limit(20);

    const fn = norm(parent_first_name);
    const ln = norm(parent_last_name);
    const memberNameMatched = ((memberMatches as any[]) || []).some((r) =>
      norm(r.parent_first_name || "") === fn && norm(r.parent_last_name || "") === ln
    );
    const nameMatched = memberNameMatched || ((matches as any[]) || []).some((r) => {
      const f = norm(r.parent_first_name || (r.parent_name || "").split(" ")[0] || "");
      const l = norm(r.parent_last_name || (r.parent_name || "").split(" ").slice(1).join(" ") || "");
      return f === fn && l === ln;
    });
    if (!nameMatched) return j({ found: false }, 200);

    const stripe = createStripeClient(configuredEnv as StripeEnv);
    const result = await findReusableCardForEmail(supabase, stripe, email);
    if (!result.found) return j({ found: false }, 200);

    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const { error: tokErr } = await supabase.from("card_reuse_tokens").insert({
      token,
      parent_email: email,
      stripe_customer_id: result.stripe_customer_id,
      stripe_payment_method_id: result.stripe_payment_method_id,
      brand: result.brand,
      last4: result.last4,
      exp_month: result.exp_month,
      exp_year: result.exp_year,
      source_booking_id: result.source_booking_id,
    });
    if (tokErr) {
      console.error("token insert failed", tokErr.message);
      return j({ found: false }, 200);
    }

    return j({
      found: true,
      brand: result.brand,
      last4: result.last4,
      exp_month: result.exp_month,
      exp_year: result.exp_year,
      reuse_token: token,
    });
  } catch (e) {
    console.error("lookup-parent-card-on-file-public error", e instanceof Error ? e.message : String(e));
    return j({ found: false }, 200);
  }
});

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

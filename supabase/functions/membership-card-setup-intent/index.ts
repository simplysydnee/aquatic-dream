// Admin-only: create a SetupIntent so the front desk can key a parent's new
// card into the admin dialog with Stripe Elements. Card data never touches
// our servers; we only ever see the resulting PaymentMethod id.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createStripeClient, type StripeEnv } from "../_shared/stripe.ts";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return json({ error: guard.error }, guard.status);

    const body = await req.json();
    const membershipId = String(body?.membership_id || "");
    if (!membershipId) return json({ error: "membership_id required" }, 400);

    const configuredEnv = Deno.env.get("PAYMENTS_ENV");
    if (configuredEnv !== "live" && configuredEnv !== "sandbox") {
      return json({ error: "Payments are not configured" }, 500);
    }
    const env: StripeEnv = configuredEnv;

    const { data: membership, error } = await supabaseAdmin
      .from("memberships")
      .select("id, parent_first_name, parent_last_name, parent_email, parent_phone, stripe_customer_id")
      .eq("id", membershipId)
      .maybeSingle();
    if (error) {
      console.error("[membership-card-setup-intent] load failed", error.message);
      return json({ error: "Could not load the membership" }, 500);
    }
    if (!membership) return json({ error: "Membership not found" }, 404);

    const stripe = createStripeClient(env);
    const parentEmail = (membership.parent_email as string | null) || "";
    let customerId = membership.stripe_customer_id as string | null;
    if (!customerId) {
      const existing = parentEmail ? await stripe.customers.list({ email: parentEmail, limit: 1 }) : { data: [] };
      customerId = existing.data[0]?.id
        ?? (await stripe.customers.create({
          email: parentEmail || undefined,
          name: `${membership.parent_first_name ?? ""} ${membership.parent_last_name ?? ""}`.trim() || undefined,
          phone: (membership.parent_phone as string | null) || undefined,
        })).id;
      await supabaseAdmin.from("memberships").update({ stripe_customer_id: customerId }).eq("id", membershipId);
    }

    const intent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      usage: "off_session",
      metadata: { type: "membership_card_update", membership_id: membershipId },
    });

    return json({ clientSecret: intent.client_secret, setupIntentId: intent.id, environment: env });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[membership-card-setup-intent] failed", msg);
    return json({ error: msg }, 500);
  }
});

async function requireAdmin(req: Request): Promise<{ ok: boolean; status: number; error?: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { ok: false, status: 401, error: "Missing Authorization header" };
  const { data, error } = await supabaseAdmin.auth.getUser(authHeader.replace("Bearer ", ""));
  if (error || !data?.user) return { ok: false, status: 401, error: "Invalid auth token" };
  const { data: isAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: data.user.id, _role: "admin" });
  if (!isAdmin) return { ok: false, status: 403, error: "Admin role required" };
  return { ok: true, status: 200 };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

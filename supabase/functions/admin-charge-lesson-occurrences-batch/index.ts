// One-time / on-demand batch charge for past private & semi-private lesson
// occurrences that already have a card on file. Mirrors the single-occurrence
// `admin-charge-private-lesson-occurrence` logic per row, but accepts a list
// and supports a dry run so an admin can review totals before money moves.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";
import { findReusableCardForEmail } from "../_shared/card-on-file.ts";
import { getPrivateLessonPrice } from "../_shared/private-lesson-pricing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  occurrence_ids: z.array(z.string().uuid()).min(1).max(200),
  environment: z.enum(["sandbox", "live"]),
  dry_run: z.boolean().default(true),
});

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type Result = {
  occurrence_id: string;
  swimmer: string | null;
  parent_email: string | null;
  occurrence_date: string | null;
  amount: number;
  outcome: "charged" | "would_charge" | "skipped" | "failed";
  reason?: string;
  payment_intent_id?: string;
};

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return j({ error: "Missing Authorization" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) return j({ error: "Invalid auth token" }, 401);
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (!isAdmin) return j({ error: "Admin role required" }, 403);

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return j({ error: parsed.error.flatten() }, 400);
    const { occurrence_ids, environment, dry_run } = parsed.data;

    const { data: rows, error: rErr } = await supabaseAdmin
      .from("lesson_booking_occurrences")
      .select(
        "id, booking_id, occurrence_date, status, payment_status, charge_status, stripe_payment_intent_id, lesson_bookings!inner(id, status, parent_name, parent_email, child_name, child_first_name, child_last_name, lesson_type, stripe_customer_id, stripe_payment_method_id)",
      )
      .in("id", occurrence_ids);
    if (rErr) return j({ error: rErr.message }, 500);

    const stripe = createStripeClient(environment as StripeEnv);
    const results: Result[] = [];

    for (const row of rows ?? []) {
      const b = (row as unknown as { lesson_bookings: Record<string, string | null> }).lesson_bookings;
      const swimmer = b?.child_name
        || [b?.child_first_name, b?.child_last_name].filter(Boolean).join(" ")
        || null;
      const base: Result = {
        occurrence_id: row.id as string,
        swimmer,
        parent_email: (b?.parent_email as string) ?? null,
        occurrence_date: row.occurrence_date as string,
        amount: 0,
        outcome: "skipped",
      };

      if (row.payment_status === "paid" || row.payment_status === "comp") {
        results.push({ ...base, reason: `Already ${row.payment_status}` });
        continue;
      }
      if (row.charge_status === "succeeded" || row.stripe_payment_intent_id) {
        results.push({
          ...base,
          reason: "Already has a Stripe charge",
          payment_intent_id: (row.stripe_payment_intent_id as string) ?? undefined,
        });
        continue;
      }
      if (row.status !== "scheduled" || b?.status === "abandoned" || b?.status === "cancelled") {
        results.push({ ...base, reason: `Lesson is ${row.status}` });
        continue;
      }

      // Reuse a sibling booking's card when this booking has none.
      let customerId = b?.stripe_customer_id ?? null;
      let paymentMethodId = b?.stripe_payment_method_id ?? null;
      if ((!customerId || !paymentMethodId) && b?.parent_email) {
        const reuse = await findReusableCardForEmail(supabaseAdmin, stripe, b.parent_email);
        if (reuse.found) {
          customerId = reuse.stripe_customer_id;
          paymentMethodId = reuse.stripe_payment_method_id;
          if (!dry_run) {
            await supabaseAdmin.from("lesson_bookings").update({
              stripe_customer_id: customerId,
              stripe_payment_method_id: paymentMethodId,
              updated_at: new Date().toISOString(),
            }).eq("id", b.id as string);
          }
        }
      }
      if (!customerId || !paymentMethodId) {
        results.push({ ...base, reason: "No card on file" });
        continue;
      }

      const dollars = getPrivateLessonPrice(
        (b?.lesson_type as string) ?? "private",
        row.occurrence_date as string,
      );
      const amount = Math.round(Number(dollars) * 100);

      if (dry_run) {
        results.push({ ...base, amount: dollars, outcome: "would_charge" });
        continue;
      }

      try {
        const pi = await stripe.paymentIntents.create({
          amount,
          currency: "usd",
          customer: customerId,
          payment_method: paymentMethodId,
          off_session: true,
          confirm: true,
          description: `Private Lesson — ${swimmer || b?.parent_name} — ${row.occurrence_date}`,
          metadata: {
            type: "private_lesson_charge_admin_batch",
            occurrence_id: row.id as string,
            booking_id: b.id as string,
            charged_by: userData.user.id,
          },
        }, { idempotencyKey: `occ_${row.id}` });

        const succeeded = pi.status === "succeeded";
        await supabaseAdmin.from("lesson_booking_occurrences").update({
          charge_status: succeeded ? "succeeded" : "failed",
          charge_attempted_at: new Date().toISOString(),
          stripe_payment_intent_id: pi.id,
          charge_error: succeeded ? null : `Status: ${pi.status}`,
        }).eq("id", row.id as string);

        if (succeeded) {
          await supabaseAdmin.from("lesson_booking_occurrences").update({
            payment_status: "paid",
            paid_at: new Date().toISOString(),
            payment_method: "card_on_file",
            payment_reference: pi.id,
          }).eq("id", row.id as string);
        }

        results.push({
          ...base,
          amount: dollars,
          outcome: succeeded ? "charged" : "failed",
          reason: succeeded ? undefined : `Stripe status ${pi.status}`,
          payment_intent_id: pi.id,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Charge failed";
        await supabaseAdmin.from("lesson_booking_occurrences").update({
          charge_status: "failed",
          charge_attempted_at: new Date().toISOString(),
          charge_error: message,
        }).eq("id", row.id as string);
        results.push({ ...base, amount: dollars, outcome: "failed", reason: message });
      }
    }

    const missing = occurrence_ids.filter((id) => !results.some((r) => r.occurrence_id === id));
    for (const id of missing) {
      results.push({
        occurrence_id: id,
        swimmer: null,
        parent_email: null,
        occurrence_date: null,
        amount: 0,
        outcome: "skipped",
        reason: "Occurrence not found",
      });
    }

    const totals = {
      charged: results.filter((r) => r.outcome === "charged").length,
      would_charge: results.filter((r) => r.outcome === "would_charge").length,
      skipped: results.filter((r) => r.outcome === "skipped").length,
      failed: results.filter((r) => r.outcome === "failed").length,
      amount_total: results
        .filter((r) => r.outcome === "charged" || r.outcome === "would_charge")
        .reduce((sum, r) => sum + r.amount, 0),
    };

    return j({ success: true, dry_run, totals, results });
  } catch (err) {
    console.error("admin-charge-lesson-occurrences-batch error", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return j({ error: message }, 500);
  }
});

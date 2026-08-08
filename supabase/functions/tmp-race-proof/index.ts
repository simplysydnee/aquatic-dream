// TEMPORARY diagnostic function. Proves the duplicate-completion race fix in
// sandbox and is deleted immediately after the run. Admin JWT required.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createStripeClient } from "../_shared/stripe.ts";
import {
  completeMembershipWithSavedCard,
  MembershipSlotFullError,
} from "../_shared/membership-completion.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const ENV = "sandbox" as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function isAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!bearer) return false;
  const { data } = await supabase.auth.getUser(bearer);
  const uid = data?.user?.id;
  if (!uid) return false;
  const { data: role } = await supabase.rpc("has_role", { _user_id: uid, _role: "admin" });
  return role === true;
}

async function makeCustomerWithCard(stripe: ReturnType<typeof createStripeClient>, tag: string) {
  const customer = await stripe.customers.create({
    email: `race-${tag}-${Date.now()}@example.com`,
    name: `Race Test ${tag}`,
  });
  const pm = await stripe.paymentMethods.create({ type: "card", card: { token: "tok_visa" } });
  await stripe.paymentMethods.attach(pm.id, { customer: customer.id });
  return { customerId: customer.id, paymentMethodId: pm.id };
}

async function stagePending(slotId: string, priceId: string, productId: string, tag: string) {
  const anchor = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
  const payload = {
    plan_key: "private",
    plan_name: "Race Proof Private",
    standing_slot_id: slotId,
    child_first_name: `Race${tag}`,
    child_last_name: "Proof",
    child_dob: "2015-01-01",
    parent_first_name: "Race",
    parent_last_name: "Proof",
    parent_name: "Race Proof",
    parent_email: `race-${tag}-${Date.now()}@example.com`,
    parent_phone: null,
    recurring_consent_amount_cents: 20000,
    recurring_consent_version: "race-proof",
    membership_agreement_version: "race-proof",
    first_charge_cents: 0,
    billing_anchor_unix: anchor,
    stripe_price_id: priceId,
    stripe_product_id: productId,
    environment: ENV,
    source: "race_proof",
    skip_welcome: true,
  };
  const { data, error } = await supabase
    .from("pending_memberships")
    .insert({ payload })
    .select("id")
    .single();
  if (error) throw new Error(`pending insert failed: ${error.message}`);
  return data!.id as string;
}

function describe(r: PromiseSettledResult<unknown>) {
  if (r.status === "fulfilled") return { outcome: "fulfilled", value: r.value };
  const e = r.reason;
  return {
    outcome: "rejected",
    error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    slotFull: e instanceof MembershipSlotFullError,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!(await isAdmin(req))) return json({ error: "admin only" }, 403);

  const stripe = createStripeClient(ENV);
  const body = await req.json().catch(() => ({}));
  const slotId: string = body.slot_id;
  if (!slotId) return json({ error: "slot_id required" }, 400);
  const mode: string = body.mode ?? "replay";

  const report: Record<string, unknown> = { mode, slotId };

  try {
    const product = await stripe.products.create({ name: "Race Proof Private" });
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: 20000,
      currency: "usd",
      recurring: { interval: "month" },
    });

    if (mode === "replay") {
      // Two concurrent completions of the SAME pending id — the shape that
      // produced the six broken subscriptions.
      const a = await makeCustomerWithCard(stripe, "a");
      const pendingId = await stagePending(slotId, price.id, product.id, "a");
      report.pendingId = pendingId;

      const results = await Promise.allSettled([
        completeMembershipWithSavedCard({ pendingId, ...a, env: ENV }),
        completeMembershipWithSavedCard({ pendingId, ...a, env: ENV }),
      ]);
      report.callers = results.map(describe);
    } else {
      // Negative control: two DIFFERENT subscriptions competing for one seat.
      const a = await makeCustomerWithCard(stripe, "n1");
      const b = await makeCustomerWithCard(stripe, "n2");
      const p1 = await stagePending(slotId, price.id, product.id, "n1");
      const p2 = await stagePending(slotId, price.id, product.id, "n2");
      report.pendingIds = [p1, p2];
      const first = await Promise.allSettled([
        completeMembershipWithSavedCard({ pendingId: p1, ...a, env: ENV }),
      ]);
      const second = await Promise.allSettled([
        completeMembershipWithSavedCard({ pendingId: p2, ...b, env: ENV }),
      ]);
      report.callers = [...first, ...second].map(describe);
    }

    // Ground truth from the DB and from Stripe.
    const { data: rows } = await supabase
      .from("memberships")
      .select("id, child_first_name, status, stripe_subscription_id, created_at")
      .eq("standing_slot_id", slotId);
    report.membership_rows = rows;

    const subs: unknown[] = [];
    for (const r of rows ?? []) {
      const id = r.stripe_subscription_id as string | null;
      if (!id) continue;
      const s = await stripe.subscriptions.retrieve(id);
      const events = await stripe.events.list({ type: "customer.subscription.deleted", limit: 50 });
      subs.push({
        subscription: id,
        status: s.status,
        cancel_at: s.cancel_at,
        canceled_at: s.canceled_at,
        deleted_events_for_this_sub: events.data.filter((e: any) => e.data?.object?.id === id).length,
      });
    }
    report.stripe = subs;

    const { count: occCount } = await supabase
      .from("membership_occurrences")
      .select("id", { count: "exact", head: true })
      .in("membership_id", (rows ?? []).map((r) => r.id as string));
    report.occurrence_count = occCount ?? 0;

    return json(report);
  } catch (e) {
    report.threw = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return json(report, 500);
  }
});

import { createStripeClient } from "../_shared/stripe.ts";

const PAIRS = [
  { family: "Barajas", dupSub: "sub_1TzfIF2HpbBBx5lse4xdLTot", expectCents: 8000, keepSub: "sub_1TzfI92HpbBBx5lsGwASio1I" },
  { family: "Pattar", dupSub: "sub_1Tzh2x2HpbBBx5lsWbHapqIn", expectCents: 8000, keepSub: "sub_1Tzh2u2HpbBBx5lsRLmxpPQZ" },
  { family: "Turnbow", dupSub: "sub_1TzhVC2HpbBBx5lscKoZdAjW", expectCents: 10000, keepSub: "sub_1TzhV82HpbBBx5lsfhU7IHTL" },
];

Deno.serve(async () => {
  const stripe = createStripeClient("live");
  const out: unknown[] = [];

  for (const p of PAIRS) {
    const row: Record<string, unknown> = { family: p.family, dupSub: p.dupSub };
    try {
      const invoices = await stripe.invoices.list({ subscription: p.dupSub, limit: 10 });
      const paid = (invoices.data as Record<string, unknown>[]).filter((i) => i.status === "paid");
      row.invoices = paid.map((i) => ({ id: i.id, amount_paid: i.amount_paid, payment_intent: i.payment_intent, charge: i.charge }));

      if (paid.length !== 1) throw new Error(`expected exactly 1 paid invoice, found ${paid.length}`);
      const inv = paid[0];
      if (inv.amount_paid !== p.expectCents) throw new Error(`amount mismatch: ${inv.amount_paid} vs ${p.expectCents}`);

      let pi = inv.payment_intent as string | null;
      if (!pi) {
        const full = await stripe.invoices.retrieve(inv.id as string, { expand: ["payments"] }) as Record<string, unknown>;
        const payments = (full.payments as Record<string, unknown> | undefined)?.data as Record<string, unknown>[] | undefined;
        const first = payments?.[0]?.payment as Record<string, unknown> | undefined;
        pi = (first?.payment_intent as string | undefined) ?? null;
      }
      if (!pi) throw new Error("no payment_intent on invoice");

      const refund = await stripe.refunds.create({
        payment_intent: pi,
        reason: "duplicate",
        metadata: { reason: "duplicate membership", invoice: String(inv.id) },
      }) as Record<string, unknown>;
      row.refund = { id: refund.id, amount: refund.amount, status: refund.status, invoice: inv.id };

      const cancelled = await stripe.subscriptions.cancel(p.dupSub, { prorate: false }) as Record<string, unknown>;
      row.cancelled = { id: cancelled.id, status: cancelled.status };

      const keep = await stripe.subscriptions.retrieve(p.keepSub) as Record<string, unknown>;
      row.keeper = {
        id: keep.id,
        status: keep.status,
        trial_end: keep.trial_end ? new Date((keep.trial_end as number) * 1000).toISOString() : null,
        default_payment_method: keep.default_payment_method,
      };
    } catch (e) {
      row.error = e instanceof Error ? e.message : String(e);
    }
    out.push(row);
  }

  return new Response(JSON.stringify(out, null, 2), { headers: { "Content-Type": "application/json" } });
});

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type ReconRow = {
  kind: string;
  stripeId: string | null;
  stripeUrl: string | null;
  membershipId: string | null;
  swimmer: string | null;
  parentEmail: string | null;
  amountCents: number | null;
  occurredAt: string | null;
  detail: string;
};

type ReconResult = {
  environment: "sandbox" | "live";
  windowDays: number;
  generatedAt: string;
  chargesScanned: number;
  membershipsScanned: number;
  inStripeNotOurs: ReconRow[];
  ourRecordsNotInStripe: ReconRow[];
  contradictions: ReconRow[];
};

const money = (cents: number | null) =>
  cents === null || cents === undefined ? "—" : `$${(cents / 100).toFixed(2)}`;

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";

const ReconTable = ({ rows }: { rows: ReconRow[] }) => {
  if (rows.length === 0) {
    return <p className="px-3 py-6 text-sm text-muted-foreground">Nothing to review here.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Swimmer</th>
            <th className="px-3 py-2 font-medium">Parent email</th>
            <th className="px-3 py-2 font-medium">Amount</th>
            <th className="px-3 py-2 font-medium">What disagrees</th>
            <th className="px-3 py-2 font-medium">Links</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row.kind}-${row.stripeId ?? row.membershipId}-${i}`} className="border-b last:border-0">
              <td className="whitespace-nowrap px-3 py-2">{when(row.occurredAt)}</td>
              <td className="px-3 py-2">{row.swimmer ?? "—"}</td>
              <td className="px-3 py-2">{row.parentEmail ?? "—"}</td>
              <td className="whitespace-nowrap px-3 py-2">{money(row.amountCents)}</td>
              <td className="px-3 py-2">
                <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-xs">{row.kind}</span>
                {row.detail}
              </td>
              <td className="whitespace-nowrap px-3 py-2">
                <div className="flex gap-3">
                  {row.stripeUrl && (
                    <a
                      className="inline-flex items-center gap-1 text-primary underline"
                      href={row.stripeUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Stripe <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {row.membershipId && (
                    <Link className="text-primary underline" to={`/admin/memberships?id=${row.membershipId}`}>
                      Membership
                    </Link>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const Section = ({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: ReconRow[];
}) => (
  <section className="rounded-lg border bg-card">
    <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Badge variant={rows.length > 0 ? "destructive" : "secondary"}>{rows.length}</Badge>
    </header>
    <ReconTable rows={rows} />
  </section>
);

const PaymentReconciliation = () => {
  const { data, isFetching, error, refetch } = useQuery<ReconResult>({
    queryKey: ["payment-reconciliation"],
    queryFn: async () => {
      const { data: res, error: fnError } = await supabase.functions.invoke(
        "reconcile-membership-payments",
        { body: {} },
      );
      if (fnError) throw new Error(fnError.message);
      if (res?.error) throw new Error(res.error as string);
      return res as ReconResult;
    },
    refetchOnWindowFocus: false,
  });

  return (
    <div className="space-y-4 p-3 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Payment reconciliation</h1>
          <p className="text-sm text-muted-foreground">
            Membership money in Stripe compared against our records for the trailing 60 days. This
            report only flags. It never changes a payment or a record.
          </p>
        </div>
        <Button onClick={() => void refetch()} disabled={isFetching} className="h-11">
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          {isFetching ? "Running" : "Refresh"}
        </Button>
      </div>

      {data && (
        <p className="text-xs text-muted-foreground">
          {data.environment} mode · {data.chargesScanned} Stripe charges ·{" "}
          {data.membershipsScanned} memberships · generated {new Date(data.generatedAt).toLocaleString()}
        </p>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{(error as Error).message}</span>
        </div>
      )}

      {isFetching && !data && (
        <p className="text-sm text-muted-foreground">Comparing Stripe against our records…</p>
      )}

      {data && (
        <div className="space-y-4">
          <Section
            title="In Stripe, not in our records"
            description="Succeeded charges that match no membership, including dashboard charges and prepayments."
            rows={data.inStripeNotOurs}
          />
          <Section
            title="In our records, not in Stripe"
            description="Memberships that look billing-active here with no matching money in Stripe."
            rows={data.ourRecordsNotInStripe}
          />
          <Section
            title="Contradictions"
            description="Records whose state disagrees with Stripe, including refunded or disputed charges on active memberships."
            rows={data.contradictions}
          />
        </div>
      )}
    </div>
  );
};

export default PaymentReconciliation;

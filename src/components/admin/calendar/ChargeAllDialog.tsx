import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Loader2, CreditCard, CheckCircle2, AlertTriangle, Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { toast } from "sonner";
import { getPrivateLessonPrice } from "@/lib/privateLessonPricing";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date;
}

type EligibleRow = {
  id: string;
  occurrence_date: string;
  start_time: string | null;
  end_time: string | null;
  child_name: string | null;
  parent_name: string | null;
  lesson_type: string | null;
  instructor_name: string | null;
  price: number;
  has_card: boolean;
};

type ChargeResult = {
  row: EligibleRow;
  status: "charged" | "already_charged" | "failed";
  payment_intent_id?: string | null;
  error?: string;
};

function fmtTime(t: string | null): string {
  if (!t) return "";
  try {
    return format(new Date(`2000-01-01T${t}`), "h:mm a");
  } catch {
    return t;
  }
}

function fmtMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

function lessonTypeLabel(t: string | null): string {
  if (t === "semi-private" || t === "semi_private") return "Semi-Private";
  if (t === "private") return "Private";
  return t || "Lesson";
}

function piTail(pi: string | null | undefined): string {
  if (!pi) return "—";
  return pi.length > 8 ? `…${pi.slice(-6)}` : pi;
}

export default function ChargeAllDialog({ open, onOpenChange, date }: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<EligibleRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [charging, setCharging] = useState(false);
  const [results, setResults] = useState<ChargeResult[] | null>(null);

  const dateStr = useMemo(() => format(date, "yyyy-MM-dd"), [date]);

  useEffect(() => {
    if (!open) return;
    setResults(null);
    setRows([]);
    setSelected(new Set());
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("lesson_booking_occurrences")
          .select(`
            id, occurrence_date, status, payment_status, charge_status,
            stripe_payment_intent_id, start_time_override, end_time_override,
            instructor_override_id,
            lesson_bookings!inner (
              id, child_name, parent_name, lesson_type, instructor_name,
              instructor_id, start_time, end_time, price_per_session,
              stripe_customer_id, stripe_payment_method_id
            )
          `)
          .eq("occurrence_date", dateStr)
          .eq("status", "scheduled")
          .not("payment_status", "in", "(paid,comp)");

        if (cancelled) return;
        if (error) throw error;

        const mapped: EligibleRow[] = ((data as any[]) || []).map((r) => {
          const b: any = r.lesson_bookings;
          return {
            id: r.id,
            occurrence_date: r.occurrence_date,
            start_time: r.start_time_override || b?.start_time || null,
            end_time: r.end_time_override || b?.end_time || null,
            child_name: b?.child_name ?? null,
            parent_name: b?.parent_name ?? null,
            lesson_type: b?.lesson_type ?? null,
            instructor_name: b?.instructor_name ?? null,
            price: getPrivateLessonPrice(b?.lesson_type ?? "private", r.occurrence_date),
            has_card: Boolean(b?.stripe_payment_method_id && b?.stripe_customer_id),
          };
        });

        mapped.sort((a, b) =>
          (a.start_time || "").localeCompare(b.start_time || ""),
        );

        setRows(mapped);
        setSelected(new Set(mapped.filter((r) => r.has_card).map((r) => r.id)));
      } catch (e: any) {
        toast.error("Failed to load lessons", { description: e?.message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, dateStr]);

  const eligibleRows = rows.filter((r) => r.has_card);
  const allEligibleSelected =
    eligibleRows.length > 0 && eligibleRows.every((r) => selected.has(r.id));
  const totalCents = rows
    .filter((r) => r.has_card && selected.has(r.id))
    .reduce((s, r) => s + Math.round(r.price * 100), 0);
  const totalDollars = totalCents / 100;

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allEligibleSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(eligibleRows.map((r) => r.id)));
    }
  };

  const handleCharge = async () => {
    const toCharge = rows.filter((r) => r.has_card && selected.has(r.id));
    if (toCharge.length === 0) return;

    setCharging(true);
    const env = getStripeEnvironment();
    const collected: ChargeResult[] = [];

    for (const row of toCharge) {
      try {
        const { data, error } = await supabase.functions.invoke(
          "admin-charge-private-lesson-occurrence",
          { body: { occurrence_id: row.id, environment: env } },
        );

        // Try to extract a structured body even on non-2xx.
        let body: any = data ?? null;
        if (!body && error && (error as any).context?.response) {
          try {
            body = await (error as any).context.response.clone().json();
          } catch {
            body = null;
          }
        }

        if (body?.success) {
          collected.push({
            row,
            status: "charged",
            payment_intent_id: body.payment_intent_id ?? null,
          });
        } else if (body?.error === "already_charged") {
          collected.push({
            row,
            status: "already_charged",
            payment_intent_id: body.payment_intent_id ?? null,
          });
        } else {
          const msg =
            (typeof body?.error === "string" && body.error) ||
            error?.message ||
            "Charge failed";
          collected.push({ row, status: "failed", error: msg });
        }
      } catch (e: any) {
        collected.push({
          row,
          status: "failed",
          error: e?.message || "Charge failed",
        });
      }
    }

    setResults(collected);
    setCharging(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (charging) return; // block close during charge loop
    onOpenChange(next);
  };

  const copySummary = async () => {
    if (!results) return;
    const lines = results.map((r) => {
      const name = r.row.child_name || r.row.parent_name || "—";
      const amt = fmtMoney(r.row.price);
      if (r.status === "charged") return `OK  ${name}  ${amt}  ${r.payment_intent_id || ""}`;
      if (r.status === "already_charged")
        return `SKIP ${name}  ${amt}  already charged ${r.payment_intent_id || ""}`;
      return `FAIL ${name}  ${amt}  ${r.error || ""}`;
    });
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success("Summary copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const chargedCount = results?.filter((r) => r.status === "charged").length ?? 0;
  const alreadyCount = results?.filter((r) => r.status === "already_charged").length ?? 0;
  const failedCount = results?.filter((r) => r.status === "failed").length ?? 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            {results ? "Charge results" : "Charge all"} ·{" "}
            {format(date, "EEE, MMM d, yyyy")}
          </DialogTitle>
          <DialogDescription>
            {results
              ? "Review each lesson charge result below."
              : "Review today's unpaid private and semi-private lessons before charging."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : results ? (
            <div className="border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="p-2 font-medium">Swimmer</th>
                    <th className="p-2 font-medium">Amount</th>
                    <th className="p-2 font-medium">Status</th>
                    <th className="p-2 font-medium">Reference</th>
                    <th className="p-2 font-medium">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">
                        {r.row.child_name || r.row.parent_name || "—"}
                        <div className="text-xs text-muted-foreground">
                          {fmtTime(r.row.start_time)}
                        </div>
                      </td>
                      <td className="p-2">{fmtMoney(r.row.price)}</td>
                      <td className="p-2">
                        {r.status === "charged" && (
                          <Badge className="bg-green-100 text-green-800 border-green-300" variant="outline">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Charged
                          </Badge>
                        )}
                        {r.status === "already_charged" && (
                          <Badge className="bg-blue-100 text-blue-800 border-blue-300" variant="outline">
                            Already charged
                          </Badge>
                        )}
                        {r.status === "failed" && (
                          <Badge className="bg-red-100 text-red-800 border-red-300" variant="outline">
                            <AlertTriangle className="w-3 h-3 mr-1" /> Failed
                          </Badge>
                        )}
                      </td>
                      <td className="p-2 font-mono text-xs">
                        {piTail(r.payment_intent_id)}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {r.status === "failed" ? r.error : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              No eligible lessons to charge for {format(date, "MMM d, yyyy")}.
            </div>
          ) : (
            <div className="border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="p-2 w-10">
                      <Checkbox
                        checked={allEligibleSelected}
                        onCheckedChange={toggleAll}
                        disabled={eligibleRows.length === 0 || charging}
                        aria-label="Select all"
                      />
                    </th>
                    <th className="p-2 font-medium">Swimmer</th>
                    <th className="p-2 font-medium">Time</th>
                    <th className="p-2 font-medium">Type</th>
                    <th className="p-2 font-medium">Instructor</th>
                    <th className="p-2 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isChecked = selected.has(r.id);
                    return (
                      <tr
                        key={r.id}
                        className={`border-t ${!r.has_card ? "opacity-60" : ""}`}
                      >
                        <td className="p-2">
                          {r.has_card ? (
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={() => toggleRow(r.id)}
                              disabled={charging}
                              aria-label={`Select ${r.child_name || r.parent_name || "lesson"}`}
                            />
                          ) : (
                            <Badge variant="outline" className="text-[10px] whitespace-nowrap">
                              No card on file
                            </Badge>
                          )}
                        </td>
                        <td className="p-2">
                          {r.child_name || r.parent_name || "—"}
                        </td>
                        <td className="p-2">{fmtTime(r.start_time)}</td>
                        <td className="p-2">{lessonTypeLabel(r.lesson_type)}</td>
                        <td className="p-2">{r.instructor_name || "—"}</td>
                        <td className="p-2 text-right">{fmtMoney(r.price)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 border-t pt-3 mt-2">
          {results ? (
            <div className="flex flex-1 items-center justify-between gap-2 flex-wrap">
              <div className="text-sm text-muted-foreground">
                Charged {chargedCount} · Already charged {alreadyCount} · Failed {failedCount}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={copySummary}>
                  <Copy className="w-4 h-4 mr-1" /> Copy summary
                </Button>
                <Button size="sm" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-between gap-2 flex-wrap">
              <div className="text-sm text-muted-foreground">
                {[...selected].filter((id) => rows.find((r) => r.id === id)?.has_card).length} selected · {fmtMoney(totalDollars)}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  disabled={charging}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleCharge}
                  disabled={charging || totalCents === 0}
                >
                  {charging ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      Charging…
                    </>
                  ) : (
                    <>Charge selected ({fmtMoney(totalDollars)})</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

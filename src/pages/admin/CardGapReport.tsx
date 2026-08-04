// Card gap report: upcoming lesson occurrences whose booking has no stored
// payment method, where the same parent email DOES have a card on another
// booking. Each row can be resolved with one confirmed action that attaches
// the family's card on file, charges the lesson, and emails a receipt.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, CheckCircle2, CreditCard, Loader2, RefreshCw } from "lucide-react";
import { getStripeEnvironment } from "@/lib/stripe";
import { getPrivateLessonPrice } from "@/lib/privateLessonPricing";

interface GapRow {
  occurrenceId: string;
  occurrenceDate: string;
  chargeStatus: string;
  paymentStatus: string;
  bookingId: string;
  parentEmail: string;
  parentName: string | null;
  childName: string | null;
  instructorName: string | null;
  startTime: string | null;
  lessonType: string;
  amountUsd: number;
}

interface ResolvedCard {
  brand: string;
  last4: string;
  sourceBookingId: string;
}

type RowStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "charging" }
  | { kind: "done"; paymentIntentId: string; receipt: "sent" | "failed"; receiptError?: string }
  | { kind: "error"; message: string };

const normalizeEmail = (value: string | null): string => (value || "").toLowerCase().trim();

const formatDate = (dateISO: string): string =>
  new Date(`${dateISO}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

const formatTime = (time: string | null): string => {
  if (!time) return "";
  const [h, m] = String(time).split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${m} ${suffix}`;
};

const errorMessage = (payload: unknown, fallback: string): string => {
  if (payload && typeof payload === "object") {
    const value = (payload as Record<string, unknown>).error;
    if (typeof value === "string") return value;
  }
  return fallback;
};

export const CardGapReport = () => {
  const [rows, setRows] = useState<GapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [statuses, setStatuses] = useState<Record<string, RowStatus>>({});
  const [pending, setPending] = useState<{ row: GapRow; card: ResolvedCard } | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const [bookingsRes, occRes] = await Promise.all([
          supabase
            .from("lesson_bookings")
            .select(
              "id, parent_email, parent_name, child_name, instructor_name, start_time, lesson_type, status, stripe_payment_method_id",
            ),
          supabase
            .from("lesson_booking_occurrences")
            .select("id, booking_id, occurrence_date, charge_status, payment_status, status")
            .gte("occurrence_date", today),
        ]);
        if (bookingsRes.error) throw bookingsRes.error;
        if (occRes.error) throw occRes.error;
        if (cancelled) return;

        const bookings = bookingsRes.data ?? [];
        const emailsWithCard = new Set(
          bookings
            .filter((b) => b.stripe_payment_method_id && b.status !== "cancelled")
            .map((b) => normalizeEmail(b.parent_email)),
        );
        const byId = new Map(bookings.map((b) => [b.id, b]));

        const gaps: GapRow[] = [];
        for (const occ of occRes.data ?? []) {
          if (occ.status === "cancelled") continue;
          const booking = byId.get(occ.booking_id);
          if (!booking) continue;
          if (booking.status === "cancelled") continue;
          if (booking.stripe_payment_method_id) continue;
          if (occ.payment_status === "paid" || occ.charge_status === "succeeded") continue;
          const email = normalizeEmail(booking.parent_email);
          if (!emailsWithCard.has(email)) continue;
          const lessonType = String(booking.lesson_type || "private");
          gaps.push({
            occurrenceId: occ.id,
            occurrenceDate: occ.occurrence_date,
            chargeStatus: occ.charge_status,
            paymentStatus: occ.payment_status,
            bookingId: booking.id,
            parentEmail: email,
            parentName: booking.parent_name ?? null,
            childName: booking.child_name ?? null,
            instructorName: booking.instructor_name ?? null,
            startTime: booking.start_time ?? null,
            lessonType,
            amountUsd: getPrivateLessonPrice(lessonType, occ.occurrence_date),
          });
        }
        gaps.sort((a, b) =>
          a.parentEmail === b.parentEmail
            ? a.occurrenceDate.localeCompare(b.occurrenceDate)
            : a.parentEmail.localeCompare(b.parentEmail),
        );
        setRows(gaps);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the report");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const familyCount = useMemo(() => new Set(rows.map((r) => r.parentEmail)).size, [rows]);
  const totalUsd = useMemo(() => rows.reduce((sum, r) => sum + r.amountUsd, 0), [rows]);

  const setStatus = (id: string, status: RowStatus) =>
    setStatuses((prev) => ({ ...prev, [id]: status }));

  // Step 1: resolve and validate the family's card, then open the confirm dialog.
  const handleStart = async (row: GapRow) => {
    setStatus(row.occurrenceId, { kind: "checking" });
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "admin-setup-card-for-booking",
        {
          body: {
            action: "check",
            booking_id: row.bookingId,
            environment: getStripeEnvironment(),
          },
        },
      );
      if (fnError) throw new Error(fnError.message);
      const result = data as {
        found?: boolean;
        reason?: string;
        brand?: string;
        last4?: string;
        source_booking_id?: string;
      };
      if (!result?.found) {
        const reason =
          result?.reason === "already_has_card"
            ? "This booking already has a card on file"
            : result?.reason === "all_candidates_invalid"
              ? "The family's saved cards are expired or no longer attached"
              : "No valid card on file for this family";
        setStatus(row.occurrenceId, { kind: "error", message: reason });
        return;
      }
      setStatus(row.occurrenceId, { kind: "idle" });
      setPending({
        row,
        card: {
          brand: result.brand || "Card",
          last4: result.last4 || "",
          sourceBookingId: result.source_booking_id || row.bookingId,
        },
      });
    } catch (e: unknown) {
      setStatus(row.occurrenceId, {
        kind: "error",
        message: e instanceof Error ? e.message : "Could not check the card on file",
      });
    }
  };

  // Step 2: attach, charge, receipt.
  const handleConfirm = async () => {
    if (!pending) return;
    const { row, card } = pending;
    setConfirming(true);
    setStatus(row.occurrenceId, { kind: "charging" });
    const environment = getStripeEnvironment();
    try {
      const attach = await supabase.functions.invoke("admin-setup-card-for-booking", {
        body: {
          action: "attach_existing",
          booking_id: row.bookingId,
          source_booking_id: card.sourceBookingId,
          environment,
        },
      });
      if (attach.error) {
        throw new Error(errorMessage(attach.data, attach.error.message) || "Could not attach the card");
      }

      const charge = await supabase.functions.invoke(
        "admin-charge-private-lesson-occurrence",
        { body: { occurrence_id: row.occurrenceId, environment } },
      );
      if (charge.error) {
        const raw = errorMessage(charge.data, charge.error.message);
        throw new Error(raw === "already_charged" ? "Already charged — no second charge was made" : raw);
      }
      const paymentIntentId = (charge.data as { payment_intent_id?: string })?.payment_intent_id || "";

      let receipt: "sent" | "failed" = "sent";
      let receiptError: string | undefined;
      const receiptRes = await supabase.functions.invoke("send-lesson-charge-receipt", {
        body: { occurrence_id: row.occurrenceId, environment },
      });
      if (receiptRes.error) {
        receipt = "failed";
        receiptError = errorMessage(receiptRes.data, receiptRes.error.message);
      }

      setStatus(row.occurrenceId, { kind: "done", paymentIntentId, receipt, receiptError });
      setPending(null);
      setReloadKey((n) => n + 1);
    } catch (e: unknown) {
      setStatus(row.occurrenceId, {
        kind: "error",
        message: e instanceof Error ? e.message : "The charge failed",
      });
      setPending(null);
    } finally {
      setConfirming(false);
    }
  };

  const renderStatus = (row: GapRow) => {
    const status = statuses[row.occurrenceId] ?? { kind: "idle" };
    if (status.kind === "done") {
      return (
        <div className="space-y-0.5">
          <span className="flex items-center gap-1 text-emerald-700 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" /> Charged
          </span>
          <span className="block font-mono text-[10px] text-muted-foreground">
            {status.paymentIntentId}
          </span>
          {status.receipt === "failed" && (
            <span className="block text-[10px] text-amber-700">
              Receipt failed: {status.receiptError}
            </span>
          )}
        </div>
      );
    }
    if (status.kind === "error") {
      return <span className="text-destructive">{status.message}</span>;
    }
    return <span className="text-muted-foreground">—</span>;
  };

  return (
    <div className="container max-w-7xl py-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Card gap report</h1>
          <p className="text-sm text-muted-foreground">
            Upcoming lessons with no payment method on the booking, where the family has a card on another
            booking. Attach and charge runs only when you confirm it.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setReloadKey((n) => n + 1)} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
          Refresh
        </Button>
      </div>

      <Card className="p-4">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive py-6 text-center">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No gaps found.</p>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3 text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span className="font-medium">
                {rows.length} occurrence{rows.length === 1 ? "" : "s"} across {familyCount} famil
                {familyCount === 1 ? "y" : "ies"} · ${totalUsd.toFixed(2)}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Time</th>
                    <th className="py-2 pr-3 font-medium">Swimmer</th>
                    <th className="py-2 pr-3 font-medium">Parent email</th>
                    <th className="py-2 pr-3 font-medium">Instructor</th>
                    <th className="py-2 pr-3 font-medium">Amount</th>
                    <th className="py-2 pr-3 font-medium">Charge</th>
                    <th className="py-2 pr-3 font-medium">Payment</th>
                    <th className="py-2 pr-3 font-medium">Result</th>
                    <th className="py-2 pr-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const status = statuses[r.occurrenceId] ?? { kind: "idle" };
                    const busy = status.kind === "checking" || status.kind === "charging";
                    return (
                      <tr key={r.occurrenceId} className="border-b last:border-0 align-top">
                        <td className="py-2 pr-3 whitespace-nowrap">{formatDate(r.occurrenceDate)}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">{formatTime(r.startTime) || "—"}</td>
                        <td className="py-2 pr-3">{r.childName || "—"}</td>
                        <td className="py-2 pr-3 break-all">{r.parentEmail}</td>
                        <td className="py-2 pr-3">{r.instructorName || "—"}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">${r.amountUsd.toFixed(2)}</td>
                        <td className="py-2 pr-3">
                          <Badge variant="outline" className="text-[10px]">{r.chargeStatus}</Badge>
                        </td>
                        <td className="py-2 pr-3">
                          <Badge variant="outline" className="text-[10px]">{r.paymentStatus}</Badge>
                        </td>
                        <td className="py-2 pr-3 min-w-[140px]">{renderStatus(r)}</td>
                        <td className="py-2 pr-0 text-right">
                          <Button
                            size="sm"
                            className="h-8"
                            disabled={busy || status.kind === "done"}
                            onClick={() => handleStart(r)}
                          >
                            {busy ? (
                              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                            ) : (
                              <CreditCard className="w-3.5 h-3.5 mr-1" />
                            )}
                            Attach card and charge
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <AlertDialog
        open={!!pending}
        onOpenChange={(open) => {
          if (!open && !confirming) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Attach card and charge?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 pt-2">
                <DetailRow label="Swimmer" value={pending?.row.childName || "—"} />
                <DetailRow
                  label="Lesson date"
                  value={pending ? formatDate(pending.row.occurrenceDate) : ""}
                />
                <DetailRow label="Time" value={formatTime(pending?.row.startTime ?? null) || "—"} />
                <DetailRow label="Coach" value={pending?.row.instructorName || "—"} />
                <DetailRow
                  label="Card"
                  value={
                    pending
                      ? `${pending.card.brand} ending in ${pending.card.last4}`
                      : ""
                  }
                />
                <DetailRow
                  label="Amount"
                  value={pending ? `$${pending.row.amountUsd.toFixed(2)}` : ""}
                />
                <p className="text-xs text-muted-foreground pt-2">
                  This attaches the family's card on file to this booking, charges it immediately, and
                  emails a receipt.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirming}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirm();
              }}
              disabled={confirming}
            >
              {confirming ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              Charge ${pending?.row.amountUsd.toFixed(2) ?? "0.00"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between text-sm gap-4">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium text-foreground text-right">{value}</span>
  </div>
);

export default CardGapReport;

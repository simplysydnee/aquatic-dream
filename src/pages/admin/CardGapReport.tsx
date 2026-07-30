// Read-only report: upcoming lesson occurrences whose booking has no stored
// payment method, where the same parent email DOES have a card on another
// booking. Almost always caused by a silent card-lookup failure at booking
// time. Nothing here writes: attaching a stored card to a different booking
// requires the parent's authorization and is done by hand.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";

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
}

const normalizeEmail = (value: string | null): string => (value || "").toLowerCase().trim();

export const CardGapReport = () => {
  const [rows, setRows] = useState<GapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

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
            .select("id, parent_email, parent_name, child_name, instructor_name, status, stripe_payment_method_id"),
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
          const email = normalizeEmail(booking.parent_email);
          if (!emailsWithCard.has(email)) continue;
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

  return (
    <div className="container max-w-7xl py-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Card gap report</h1>
          <p className="text-sm text-muted-foreground">
            Upcoming lessons with no payment method on the booking, where the family has a card on another booking.
            Read only. Cards are never attached automatically.
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
                {familyCount === 1 ? "y" : "ies"}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Swimmer</th>
                    <th className="py-2 pr-3 font-medium">Parent email</th>
                    <th className="py-2 pr-3 font-medium">Instructor</th>
                    <th className="py-2 pr-3 font-medium">Charge</th>
                    <th className="py-2 pr-3 font-medium">Payment</th>
                    <th className="py-2 pr-3 font-medium">Booking</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.occurrenceId} className="border-b last:border-0">
                      <td className="py-1.5 pr-3 whitespace-nowrap">{r.occurrenceDate}</td>
                      <td className="py-1.5 pr-3">{r.childName || "—"}</td>
                      <td className="py-1.5 pr-3">{r.parentEmail}</td>
                      <td className="py-1.5 pr-3">{r.instructorName || "—"}</td>
                      <td className="py-1.5 pr-3">
                        <Badge variant="outline" className="text-[10px]">{r.chargeStatus}</Badge>
                      </td>
                      <td className="py-1.5 pr-3">
                        <Badge variant="outline" className="text-[10px]">{r.paymentStatus}</Badge>
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-[10px] text-muted-foreground">
                        {r.bookingId.slice(0, 8)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
};

export default CardGapReport;

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LEVEL_DISPLAY, type SwimLevel, getGroupName, getAgeGroup } from "@/components/swim-enrollment/types";
import EnrollmentDetailDialog from "@/components/admin/EnrollmentDetailDialog";
import SendPaymentLinkDialog, { type SendPaymentLinkTarget } from "@/components/admin/SendPaymentLinkDialog";
import TextPayLinkButton from "@/components/admin/TextPayLinkButton";
import SessionEnrollmentCards from "@/components/admin/SessionEnrollmentCards";
import StartReminderPreviewDialog from "@/components/admin/StartReminderPreviewDialog";
import { Progress } from "@/components/ui/progress";
import { Eye, CheckCircle, Send, ArrowRightLeft, Trash2 } from "lucide-react";
import MoveSwimmerDialog from "@/components/admin/MoveSwimmerDialog";
import { toast } from "@/hooks/use-toast";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatPaymentStatus } from "@/lib/paymentLabels";
import SwimmerLink from "@/components/admin/swimmer/SwimmerLink";
import WaitlistPanel from "@/components/admin/WaitlistPanel";

interface Enrollment {
  id: string;
  child_name: string;
  child_age: number;
  parent_name: string;
  parent_email: string;
  parent_phone: string | null;
  swim_level: string;
  status: string;
  notes: string | null;
  created_at: string;
  session_id: string | null;
  payment_status: string;
  payment_amount: number | null;
  stripe_payment_id: string | null;
  is_first_time: boolean;
  payment_due_date: string | null;
  payment_method?: string | null;
  payment_reference?: string | null;
  payment_reminder_sent_at?: string | null;
  session_fee_status: string;
  session_fee_stripe_id?: string | null;
  session_fee_paid_at?: string | null;
  admin_reviewed_at?: string | null;
}


interface SessionInfo {
  id: string;
  start_time: string;
  end_time?: string;
  session_name: string | null;
  age_group: string | null;
  swim_level: string;
  max_students: number;
  day_of_week: string;
  session_period_id: string | null;
}

interface SessionPeriod {
  id: string;
  name: string;
  start_date: string;
}

function formatDayOfWeek(dow: string) {
  const map: Record<string, string> = {
    monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu",
    friday: "Fri", saturday: "Sat", sunday: "Sun",
  };
  return dow.toLowerCase().split("_").map(p => map[p] || p).join(" & ");
}

function formatTime12h(time: string) {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

const SwimEnrollmentsAdmin = () => {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [sessions, setSessions] = useState<Record<string, SessionInfo>>({});
  const [sessionPeriods, setSessionPeriods] = useState<SessionPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEnrollment, setSelectedEnrollment] = useState<Enrollment | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<Enrollment | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [payLinkTarget, setPayLinkTarget] = useState<SendPaymentLinkTarget | null>(null);
  const [payLinkOpen, setPayLinkOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [sessionFilter, setSessionFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<string>("all");
  const [ageFilter, setAgeFilter] = useState<string>("all");
  const [seatsPeriodFilter, setSeatsPeriodFilter] = useState<string>("upcoming");
  const [reminderPreviewOpen, setReminderPreviewOpen] = useState(false);
  const [reminderTestPhone, setReminderTestPhone] = useState<string | undefined>(undefined);

  // Manual mark-paid dialog state
  const [markPaidTarget, setMarkPaidTarget] = useState<
    | { enrollment: Enrollment; fee: "reg" | "session"; defaultMethod: "cash" | "check" | "comp" | "other" }
    | null
  >(null);
  const [markPaidMethod, setMarkPaidMethod] = useState<"cash" | "check" | "comp" | "other">("cash");
  const [markPaidReference, setMarkPaidReference] = useState("");
  const [markPaidEmailReceipt, setMarkPaidEmailReceipt] = useState(true);
  const [markPaidSaving, setMarkPaidSaving] = useState(false);

  const openMarkPaid = (
    enrollment: Enrollment,
    fee: "reg" | "session",
    defaultMethod: "cash" | "check" | "comp" | "other" = "cash"
  ) => {
    setMarkPaidTarget({ enrollment, fee, defaultMethod });
    setMarkPaidMethod(defaultMethod);
    setMarkPaidReference("");
    setMarkPaidEmailReceipt(true);
  };

  const confirmMarkPaid = async () => {
    if (!markPaidTarget) return;
    const { enrollment, fee } = markPaidTarget;
    const ref = markPaidReference.trim() || null;
    setMarkPaidSaving(true);
    try {
      const updates: Record<string, unknown> =
        fee === "reg"
          ? { payment_status: "paid", payment_method: markPaidMethod, payment_reference: ref }
          : {
              session_fee_status: markPaidMethod === "comp" ? "comp" : "paid",
              session_fee_paid_at: new Date().toISOString(),
              payment_method: markPaidMethod,
              payment_reference: ref,
            };
      const { error } = await supabase.from("swim_enrollments").update(updates).eq("id", enrollment.id);
      if (error) throw error;
      setEnrollments((prev) =>
        prev.map((e) => (e.id === enrollment.id ? ({ ...e, ...updates } as Enrollment) : e))
      );

      // Email a receipt for cash/check payments when admin opted in.
      if (
        markPaidEmailReceipt &&
        (markPaidMethod === "cash" || markPaidMethod === "check") &&
        enrollment.parent_email &&
        enrollment.parent_email.includes("@")
      ) {
        try {
          const sess = enrollment.session_id ? sessions[enrollment.session_id] : null;
          const sessionLabel = sess
            ? `${sess.session_name || ""} ${formatDayOfWeek(sess.day_of_week)} ${formatTime12h(sess.start_time)}`.trim()
            : undefined;
          await supabase.functions.invoke("send-transactional-email", {
            body: {
              templateName: "cash-receipt",
              recipientEmail: enrollment.parent_email,
              templateData: {
                parentName: enrollment.parent_name,
                childName: enrollment.child_name,
                sessionLabel,
                amountUsd: fee === "reg" ? 45 : 240,
                paymentMethod: markPaidMethod,
                paymentReference: ref,
                receivedOn: new Date().toLocaleDateString(),
                feeLabel: fee === "reg" ? "Registration fee" : "Session fee",
              },
            },
          });
        } catch (e) {
          console.error("cash receipt send failed", e);
        }
      }

      toast({
        title: fee === "reg" ? "Reg fee marked paid" : "Session fee recorded",
        description: `${enrollment.child_name} · ${markPaidMethod}`,
      });
      setMarkPaidTarget(null);
    } catch (err: any) {
      toast({ title: "Failed to update", description: err?.message || "Try again", variant: "destructive" });
    } finally {
      setMarkPaidSaving(false);
    }
  };

  const fetchData = async () => {
    const [enrollRes, sessionRes, periodRes] = await Promise.all([
      supabase.from("swim_enrollments").select("*").order("created_at", { ascending: false }),
      supabase.from("swim_sessions").select("id, start_time, end_time, session_name, age_group, swim_level, max_students, day_of_week, session_period_id, registration_status"),
      supabase.from("session_periods").select("id, name, start_date").order("start_date", { ascending: true }),
    ]);

    if (enrollRes.data) setEnrollments(enrollRes.data as Enrollment[]);
    if (sessionRes.data) {
      const map: Record<string, SessionInfo> = {};
      sessionRes.data.forEach((s: any) => (map[s.id] = s));
      setSessions(map);
    }
    if (periodRes.data) setSessionPeriods(periodRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // Realtime: refetch on any swim_enrollments change so moves made elsewhere appear instantly.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel("swim-enrollments-admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "swim_enrollments" },
        () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => fetchData(), 300);
        },
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  // Cancellation flow state
  const [cancelTarget, setCancelTarget] = useState<Enrollment | null>(null);
  const [cancelRefund, setCancelRefund] = useState(true);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const updateStatus = async (id: string, status: string) => {
    if (status === "cancelled") {
      const target = enrollments.find((e) => e.id === id);
      if (target) {
        setCancelTarget(target);
        setCancelReason("");
        // Default refund=true only if there's something refundable
        const hasRefundable =
          (target.payment_status === "paid" && !!target.stripe_payment_id) ||
          (target.session_fee_status === "paid" && !!target.session_fee_stripe_id);
        setCancelRefund(hasRefundable);
      }
      return;
    }
    await supabase.from("swim_enrollments").update({ status }).eq("id", id);
    setEnrollments((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e)));
  };

  const acknowledgeEnrollment = async (id: string) => {
    const reviewedAt = new Date().toISOString();
    const { error } = await supabase.from("swim_enrollments").update({ admin_reviewed_at: reviewedAt }).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Enrollment acknowledged" });
      setEnrollments((prev) => prev.map((e) => (e.id === id ? { ...e, admin_reviewed_at: reviewedAt } : e)));
    }
  };


  const deleteEnrollment = async (e: Enrollment) => {
    if (!window.confirm(`Permanently DELETE enrollment for ${e.child_name} (${e.parent_email})?\n\nThis cannot be undone and will NOT issue any refund. Use Cancel instead if a refund is needed.`)) return;
    const { error } = await supabase.from("swim_enrollments").delete().eq("id", e.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Enrollment deleted", description: e.child_name });
      setEnrollments((prev) => prev.filter((x) => x.id !== e.id));
    }
  };

  const confirmCancellation = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const { data, error } = await supabase.functions.invoke("cancel-enrollment-refund", {
        body: {
          enrollmentId: cancelTarget.id,
          refund: cancelRefund,
          environment: "live",
          reason: cancelReason || "Admin cancellation",
        },
      });
      if (error || !data?.success) {
        throw new Error(error?.message || data?.error || "Cancellation failed");
      }
      const refunded = (data.refundResults || []).filter((r: { refundId?: string }) => r.refundId);
      const failed = (data.refundResults || []).filter((r: { error?: string }) => r.error);
      toast({
        title: "Enrollment cancelled",
        description: refunded.length
          ? `Refunded ${refunded.length} charge${refunded.length > 1 ? "s" : ""} via Stripe.`
          : cancelRefund
            ? "No refundable charges found."
            : "Cancelled without refund.",
      });
      if (failed.length) {
        toast({
          title: "Some refunds failed",
          description: failed.map((r: { error?: string }) => r.error).join("; "),
          variant: "destructive",
        });
      }
      await fetchData();
      setCancelTarget(null);
    } catch (e) {
      toast({ title: "Failed to cancel", description: (e as Error).message, variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  };

  const updatePaymentStatus = async (enrollment: Enrollment, payment_status: string) => {
    const { error } = await supabase
      .from("swim_enrollments")
      .update({ payment_status })
      .eq("id", enrollment.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Reg fee updated", description: `${enrollment.child_name}: ${payment_status}` });
      setEnrollments((prev) => prev.map((e) => (e.id === enrollment.id ? { ...e, payment_status } : e)));
    }
  };

  const updateSessionFeeStatus = async (enrollment: Enrollment, session_fee_status: string) => {
    const updates: Record<string, unknown> = { session_fee_status };
    if (session_fee_status === "paid") {
      updates.session_fee_paid_at = new Date().toISOString();
    }
    const { error } = await supabase
      .from("swim_enrollments")
      .update(updates)
      .eq("id", enrollment.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Session fee updated", description: `${enrollment.child_name}: ${session_fee_status}` });
      setEnrollments((prev) => prev.map((e) => (e.id === enrollment.id ? { ...e, ...updates } as Enrollment : e)));
    }
  };

  const sendPaymentLink = (enrollment: Enrollment) => {
    setPayLinkTarget({
      enrollmentId: enrollment.id,
      sessionId: enrollment.session_id,
      childName: enrollment.child_name,
      parentEmail: enrollment.parent_email,
      isFirstTime: enrollment.is_first_time,
      waiverSignedAt: null,
    });
    setPayLinkOpen(true);
  };

  const paymentStatusColor = (status: string) => {
    switch (status) {
      case "paid": return "bg-green-100 text-green-700 border-green-300";
      case "refunded": return "bg-purple-100 text-purple-700 border-purple-300";
      case "waived": return "bg-slate-100 text-slate-700 border-slate-300";
      default: return "bg-yellow-100 text-yellow-700 border-yellow-300";
    }
  };

  const enrollmentStateColor = (status: string) => {
    switch (status) {
      case "confirmed": return "bg-green-100 text-green-700 border-green-300";
      case "pending_payment": return "bg-orange-100 text-orange-800 border-orange-300";
      case "waitlist": return "bg-amber-100 text-amber-700 border-amber-300";
      case "no_show": return "bg-slate-100 text-slate-700 border-slate-300";
      case "cancelled": return "bg-red-100 text-red-700 border-red-300";
      default: return "";
    }
  };

  const sessionFeeColor = (status: string) => {
    switch (status) {
      case "paid": return "bg-green-100 text-green-700 border-green-300";
      case "comp": return "bg-slate-100 text-slate-700 border-slate-300";
      default: return "bg-blue-100 text-blue-700 border-blue-300";
    }
  };

  const matchesSearchAndFilters = (e: Enrollment) => {
    const matchSearch = search === "" ||
      e.child_name.toLowerCase().includes(search.toLowerCase()) ||
      e.parent_name.toLowerCase().includes(search.toLowerCase()) ||
      e.parent_email.toLowerCase().includes(search.toLowerCase());
    const matchPayment = paymentFilter === "all" || e.payment_status === paymentFilter;
    const matchSession = sessionFilter === "all" || e.session_id === sessionFilter;
    const matchPeriod = periodFilter === "all" || (e.session_id && sessions[e.session_id]?.session_period_id === periodFilter);
    const matchAge = ageFilter === "all" || (e.session_id && sessions[e.session_id]?.age_group === ageFilter);
    return matchSearch && matchPayment && matchSession && matchPeriod && matchAge;
  };

  // "All Enrollments" tab EXCLUDES cancelled — they live on their own tab.
  const filtered = enrollments.filter((e) => e.status !== "cancelled" && matchesSearchAndFilters(e));
  const cancelledList = enrollments.filter((e) => e.status === "cancelled" && matchesSearchAndFilters(e));

  // Filter-aware metrics: when any filter is active, scope to filtered; else use full set.
  const anyFilterActive =
    search !== "" || paymentFilter !== "all" || sessionFilter !== "all" ||
    periodFilter !== "all" || ageFilter !== "all";
  // Metrics scope excludes cancelled (they're on their own tab).
  const nonCancelled = enrollments.filter((e) => e.status !== "cancelled");
  const scope = anyFilterActive ? filtered : nonCancelled;

  const isActive = (e: Enrollment) => e.status === "confirmed";
  const activeEnrollments = scope.filter(isActive);

  const SESSION_FEE = 240;
  const REG_FEE = 45;

  const activeCount = activeEnrollments.length;
  // Sums actual payment_amount when present (matches Stripe), excludes refunded rows.
  const revenueCollected = activeEnrollments.reduce((sum, e) => {
    if (e.payment_status === "refunded" || e.session_fee_status === "refunded") return sum;
    let amt = 0;
    if (e.payment_status === "paid") {
      amt += Number(e.payment_amount ?? (e.is_first_time ? REG_FEE : SESSION_FEE));
    }
    if (e.session_fee_status === "paid" && e.payment_status !== "paid") {
      amt += SESSION_FEE;
    }
    return sum + amt;
  }, 0);

  // Owed Now: balances that should NEVER grow under the new rules.
  // - First-time + reg fee unpaid (not waived) → $45
  // - Returning + session_fee_status='due_day_1' → $240 (Mejia grace)
  const owedNowFirstTime = activeEnrollments
    .filter((e) => e.is_first_time && e.payment_status === "unpaid")
    .reduce((sum) => sum + REG_FEE, 0);
  const owedNowReturning = activeEnrollments
    .filter((e) => !e.is_first_time && e.session_fee_status === "due_day_1")
    .reduce((sum) => sum + SESSION_FEE, 0);
  const owedNowTotal = owedNowReturning + owedNowFirstTime;

  // Day-1 Collection: every active enrollment with session_fee_status='due_day_1' owes $240.
  const dayOneRows = activeEnrollments.filter((e) => e.session_fee_status === "due_day_1");
  const dayOneFirstTimers = dayOneRows.filter((e) => e.is_first_time);
  const dayOneReturningGrace = dayOneRows.filter((e) => !e.is_first_time);
  const dayOneTotal = dayOneRows.length * SESSION_FEE;

  // Capacity: classes (sessions) with ≥1 active enrollment vs. total available classes in scope.
  const allSessionIds = Object.values(sessions).map((s) => s.id);
  const filteredSessionIds = anyFilterActive
    ? new Set(filtered.map((e) => e.session_id).filter(Boolean) as string[])
    : new Set(allSessionIds);
  const totalClasses = filteredSessionIds.size;

  const classesWithEnrollments = new Set(
    activeEnrollments.map((e) => e.session_id).filter(Boolean) as string[],
  );
  const classesStarted = classesWithEnrollments.size;
  const classesPct = totalClasses > 0 ? Math.round((classesStarted / totalClasses) * 100) : 0;
  const avgPerStartedClass = classesStarted > 0 ? (activeCount / classesStarted).toFixed(1) : "0.0";

  // Seat utilization (independent of table filters) — scoped by seatsPeriodFilter
  const today = new Date().toISOString().split("T")[0];
  const upcomingPeriod = sessionPeriods.find((p) => p.start_date >= today) || sessionPeriods[0];
  const resolvedSeatsPeriodId =
    seatsPeriodFilter === "upcoming" ? upcomingPeriod?.id :
    seatsPeriodFilter === "all" ? null :
    seatsPeriodFilter;
  const seatScopeSessions = Object.values(sessions).filter((s) =>
    resolvedSeatsPeriodId === null ? true : s.session_period_id === resolvedSeatsPeriodId
  );
  const seatScopeSessionIds = new Set(seatScopeSessions.map((s) => s.id));
  const totalSeats = seatScopeSessions.reduce((sum, s) => sum + (s.max_students || 0), 0);
  const seatsBooked = enrollments.filter(
    (e) => e.status === "confirmed" && e.session_id && seatScopeSessionIds.has(e.session_id)
  ).length;
  const seatsOpen = Math.max(totalSeats - seatsBooked, 0);
  const seatsPct = totalSeats > 0 ? Math.round((seatsBooked / totalSeats) * 100) : 0;
  const seatsFillColor =
    seatsPct >= 85 ? "bg-[hsl(var(--coral))]" :
    seatsPct >= 50 ? "bg-[hsl(var(--teal))]" :
    "bg-slate-400";
  const seatsPeriodLabel =
    seatsPeriodFilter === "upcoming" ? (upcomingPeriod?.name || "Upcoming") :
    seatsPeriodFilter === "all" ? "All Sessions" :
    sessionPeriods.find((p) => p.id === seatsPeriodFilter)?.name || "";

  const cancelledCount = enrollments.filter((e) => e.status === "cancelled").length;
  const refundedCount = scope.filter((e) => e.payment_status === "refunded").length;
  const waivedCount = scope.filter((e) => e.payment_status === "waived").length;
  const firstTimeOnRoster = activeEnrollments.filter((e) => e.is_first_time).length;

  const fmtMoney = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  // Build session options for the filter dropdown
  const sessionOptions = Object.values(sessions).map((s) => ({
    id: s.id,
    label: `${s.session_name || s.swim_level} – ${formatDayOfWeek(s.day_of_week)} ${formatTime12h(s.start_time)}`,
  }));

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl sm:text-2xl font-display font-bold text-foreground">Swim Enrollments</h2>
        <Badge variant="outline" className="text-xs sm:text-sm shrink-0">{enrollments.length} total</Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Swimmers{anyFilterActive && <span className="text-[10px] ml-1">(filtered)</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Revenue Collected</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{fmtMoney(revenueCollected)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Matches Stripe net (excludes refunds)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Owed Now</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-yellow-600">{fmtMoney(owedNowTotal)}</p>
            <p className="text-[11px] text-muted-foreground mt-1 leading-tight">
              Returning unpaid: <span className="font-medium text-foreground">{fmtMoney(owedNowReturning)}</span><br />
              Reg fees unpaid: <span className="font-medium text-foreground">{fmtMoney(owedNowFirstTime)}</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Day-1 Collection</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">{fmtMoney(dayOneTotal)}</p>
            <p className="text-[11px] text-muted-foreground mt-1 leading-tight">
              {dayOneFirstTimers.length} first-timer{dayOneFirstTimers.length === 1 ? "" : "s"} (standard)
              {dayOneReturningGrace.length > 0 && (
                <> + {dayOneReturningGrace.length} returning (grace)</>
              )}
            </p>
          </CardContent>
        </Card>
        <Card className="col-span-2 lg:col-span-1">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Seats Booked</CardTitle>
              <Select value={seatsPeriodFilter} onValueChange={setSeatsPeriodFilter}>
                <SelectTrigger className="h-7 text-xs w-[120px] px-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="upcoming">Upcoming</SelectItem>
                  <SelectItem value="all">All Sessions</SelectItem>
                  {sessionPeriods.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {totalSeats === 0 ? (
              <>
                <p className="text-3xl font-bold text-muted-foreground">—</p>
                <p className="text-[11px] text-muted-foreground mt-2 leading-tight">
                  No sessions in this period
                  <br />
                  <span className="opacity-70">{seatsPeriodLabel}</span>
                </p>
              </>
            ) : (
              <>
                <p className="text-3xl font-bold text-foreground leading-none">
                  {seatsBooked}<span className="text-muted-foreground text-xl font-semibold"> / {totalSeats}</span>
                </p>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  {seatsOpen} open · {seatsPct}% full
                </p>
                <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200/60 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${seatsFillColor}`}
                    style={{ width: seatsPct > 0 ? `max(4px, ${seatsPct}%)` : "0%" }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5 opacity-70">
                  {seatsPeriodLabel}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground -mt-2">
        <span>Classes active: <span className="font-medium text-foreground">{classesStarted}/{totalClasses}</span></span>
        <span>·</span>
        <span>Cancelled: <span className="font-medium text-foreground">{cancelledCount}</span></span>
        <span>·</span>
        <span>Refunded: <span className="font-medium text-foreground">{refundedCount}</span></span>
        <span>·</span>
        <span>Waived: <span className="font-medium text-foreground">{waivedCount}</span></span>
        <span>·</span>
        <span>First-time on roster: <span className="font-medium text-foreground">{firstTimeOnRoster}</span></span>
      </div>

      <Tabs defaultValue="all">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 sm:inline-flex sm:w-auto h-auto">
          <TabsTrigger value="all" className="text-xs sm:text-sm whitespace-normal">All</TabsTrigger>
          <TabsTrigger value="by-session" className="text-xs sm:text-sm whitespace-normal">By Session</TabsTrigger>
          <TabsTrigger value="cancelled" className="text-xs sm:text-sm whitespace-normal">
            Cancelled{cancelledCount > 0 && <span className="ml-1 opacity-70">({cancelledCount})</span>}
          </TabsTrigger>
          <TabsTrigger value="waitlist" className="text-xs sm:text-sm whitespace-normal">Waitlist</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {/* Filters: stack full-width on mobile */}
          <div className="grid grid-cols-1 sm:flex sm:flex-wrap sm:items-center gap-2 sm:gap-3">
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:max-w-xs"
            />
            <Select value={paymentFilter} onValueChange={setPaymentFilter}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Payment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Payments</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="refunded">Refunded</SelectItem>
              </SelectContent>
            </Select>
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="All Sessions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sessions</SelectItem>
                {sessionPeriods.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {periodFilter !== "all" && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const periodName = sessionPeriods.find(p => p.id === periodFilter)?.name || "this session";
                  const { data: preview, error: previewErr } = await supabase.functions.invoke(
                    "send-session-welcome-email",
                    { body: { sessionPeriodId: periodFilter, dryRun: true } },
                  );
                  if (previewErr) {
                    toast({ title: "Preview failed", description: previewErr.message, variant: "destructive" });
                    return;
                  }
                  const count = preview?.count ?? 0;
                  if (!count) {
                    toast({ title: "No recipients", description: `No active enrollments found for ${periodName}.` });
                    return;
                  }
                  if (!confirm(`Send welcome email + Stripe payment link to ${count} ${periodName} families?`)) return;
                  const { data, error } = await supabase.functions.invoke(
                    "send-session-welcome-email",
                    { body: { sessionPeriodId: periodFilter } },
                  );
                  if (error) {
                    toast({ title: "Send failed", description: error.message, variant: "destructive" });
                  } else {
                    toast({ title: "Welcome emails queued", description: `${data?.sent ?? 0} of ${data?.total ?? 0} sent.` });
                  }
                }}
              >
                Send {sessionPeriods.find(p => p.id === periodFilter)?.name || "session"} welcome
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setReminderTestPhone(undefined);
                setReminderPreviewOpen(true);
              }}
            >
              Preview start reminders
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const stored = typeof window !== "undefined"
                  ? window.localStorage.getItem("admin_test_sms_phone") ?? ""
                  : "";
                setReminderTestPhone(stored || "+1");
                setReminderPreviewOpen(true);
              }}
            >
              Preview as test to my number
            </Button>
            <Select value={ageFilter} onValueChange={setAgeFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="All Ages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Ages</SelectItem>
                <SelectItem value="preschool-3-5">Preschool (3–5)</SelectItem>
                <SelectItem value="school-age-6-12">School Age (6–12)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sessionFilter} onValueChange={setSessionFilter}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue placeholder="All Classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {sessionOptions
                  .filter(s => periodFilter === "all" || sessions[s.id]?.session_period_id === periodFilter)
                  .filter(s => ageFilter === "all" || sessions[s.id]?.age_group === ageFilter)
                  .map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Mobile card list */}
          <div className="grid grid-cols-1 gap-2 md:hidden">
            {filtered.map((e) => {
              const levelInfo = LEVEL_DISPLAY[e.swim_level as SwimLevel];
              const ageGroup = getAgeGroup(e.child_age);
              const groupName = levelInfo ? getGroupName(e.swim_level as SwimLevel, ageGroup) : e.swim_level;
              const session = e.session_id ? sessions[e.session_id] : null;
              return (
                <Card key={e.id} className="p-3">
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-sm break-words"><SwimmerLink childName={e.child_name} parentEmail={e.parent_email} /></span>
                        <span className="text-xs text-muted-foreground">({e.child_age})</span>
                        <Badge variant="outline" className={`text-[10px] ${levelInfo?.color || ""}`}>{groupName}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground break-words">{e.parent_name}</div>
                      <div className="text-xs text-muted-foreground break-all">{e.parent_email}</div>
                      <div className="mt-1 text-xs break-words">
                        {session ? `${session.session_name || ""} · ${formatDayOfWeek(session.day_of_week)} ${formatTime12h(session.start_time)}` : "—"}
                      </div>
                    </div>
                    <div className="flex shrink-0 -mr-1">
                      <Button size="icon" variant="ghost" title="Move to another class" onClick={() => { setMoveTarget(e); setMoveOpen(true); }}>
                        <ArrowRightLeft className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => { setSelectedEnrollment(e); setDialogOpen(true); }}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" title="Delete enrollment" onClick={() => deleteEnrollment(e)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                    {!e.admin_reviewed_at && (
                      <Badge variant="outline" className="text-[10px] bg-red-100 text-red-700 border-red-300">New</Badge>
                    )}
                    <Badge variant="outline" className={`text-[10px] ${enrollmentStateColor(e.status)}`}>{e.status}</Badge>
                    <Badge variant="outline" className={`text-[10px] ${paymentStatusColor(e.payment_status)}`}>Reg: {formatPaymentStatus(e.payment_status)}</Badge>
                    <Badge variant="outline" className={`text-[10px] ${sessionFeeColor(e.session_fee_status)}`}>Session: {formatPaymentStatus(e.session_fee_status)}</Badge>
                    {!e.admin_reviewed_at && (
                      <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] gap-1" onClick={() => acknowledgeEnrollment(e.id)}>
                        <CheckCircle className="w-3 h-3" /> Acknowledge
                      </Button>
                    )}
                    {e.session_fee_status === "due_day_1" && (
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] gap-1" onClick={() => sendPaymentLink(e)}>
                        <Send className="w-3 h-3" /> Send link
                      </Button>
                    )}
                  </div>

                </Card>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-center py-8 text-sm text-muted-foreground">No enrollments found</p>
            )}
          </div>

          <Card className="hidden md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Child</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Parent</TableHead>
                    <TableHead>Session</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[90px]">Review</TableHead>
                    <TableHead>Reg Fee</TableHead>
                    <TableHead>Session Fee</TableHead>
                    <TableHead>Method / Ref</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filtered.map((e) => {
                    const levelInfo = LEVEL_DISPLAY[e.swim_level as SwimLevel];
                    const ageGroup = getAgeGroup(e.child_age);
                    const groupName = levelInfo ? getGroupName(e.swim_level as SwimLevel, ageGroup) : e.swim_level;
                    const session = e.session_id ? sessions[e.session_id] : null;
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium"><SwimmerLink childName={e.child_name} parentEmail={e.parent_email} /></TableCell>
                        <TableCell>{e.child_age}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={levelInfo?.color || ""}>
                            {groupName}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div>{e.parent_name}</div>
                          <div className="text-xs text-muted-foreground">{e.parent_email}</div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {session ? `${session.session_name || ""} ${formatDayOfWeek(session.day_of_week)} ${formatTime12h(session.start_time)}` : "—"}
                        </TableCell>
                        <TableCell>
                          <Select value={e.status} onValueChange={(v) => updateStatus(e.id, v)}>
                            <SelectTrigger className={`w-[140px] h-9 font-semibold ${enrollmentStateColor(e.status)}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="confirmed">Confirmed</SelectItem>
                              <SelectItem value="waitlist">Waitlist</SelectItem>
                              <SelectItem value="no_show">No-show</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {!e.admin_reviewed_at ? (
                            <div className="flex flex-col gap-1.5">
                              <Badge variant="outline" className="text-[10px] self-start bg-red-100 text-red-700 border-red-300">New</Badge>
                              <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] gap-1 self-start" onClick={() => acknowledgeEnrollment(e.id)}>
                                <CheckCircle className="w-3 h-3" /> Acknowledge
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        <TableCell>
                          {e.is_first_time && e.payment_status !== "not_required" ? (
                            <Select value={e.payment_status} onValueChange={(v) => v === "paid" ? openMarkPaid(e, "reg", "cash") : updatePaymentStatus(e, v)}>
                              <SelectTrigger className={`w-[120px] h-8 ${paymentStatusColor(e.payment_status)}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unpaid">Unpaid</SelectItem>
                                <SelectItem value="paid">Paid ($45)</SelectItem>
                                <SelectItem value="refunded">Refunded</SelectItem>
                                <SelectItem value="waived">Waived</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : e.is_first_time && e.payment_status === "not_required" ? (
                            <span className="text-xs text-muted-foreground italic">Paid w/ other session</span>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">N/A (returning)</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Select value={e.session_fee_status} onValueChange={(v) => v === "paid" ? openMarkPaid(e, "session", "cash") : v === "comp" ? openMarkPaid(e, "session", "comp") : updateSessionFeeStatus(e, v)}>
                            <SelectTrigger className={`w-[140px] h-8 ${sessionFeeColor(e.session_fee_status)}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="due_day_1">Due Day 1 ($240)</SelectItem>
                              <SelectItem value="paid">Paid ($240)</SelectItem>
                              <SelectItem value="comp">Comp</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-xs">
                          {e.payment_method ? (
                            <div>
                              <span className="font-medium capitalize">{e.payment_method}</span>
                              {e.payment_reference && (
                                <div className="text-muted-foreground truncate max-w-[140px]" title={e.payment_reference}>
                                  {e.payment_reference}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic">none</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(e.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {e.session_fee_status === "due_day_1" && (
                              <>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  title="Email session fee payment link"
                                  onClick={() => sendPaymentLink(e)}
                                >
                                  <Send className="w-4 h-4 text-primary" />
                                </Button>
                                <TextPayLinkButton
                                  enrollmentId={e.id}
                                  parentPhone={e.parent_phone}
                                  sessionFeeStatus={e.session_fee_status}
                                />
                              </>
                            )}
                            <Button size="icon" variant="ghost" title="Move to another class" onClick={() => { setMoveTarget(e); setMoveOpen(true); }}>
                              <ArrowRightLeft className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => { setSelectedEnrollment(e); setDialogOpen(true); }}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="ghost" title="Delete enrollment" onClick={() => deleteEnrollment(e)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                        No enrollments found
                      </TableCell>
                    </TableRow>
                  )}

                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="by-session">
          <SessionEnrollmentCards
            sessions={sessions}
            enrollments={nonCancelled}
            sessionPeriods={sessionPeriods}
            onChanged={fetchData}
          />
        </TabsContent>

        <TabsContent value="cancelled" className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Cancelled enrollments are hidden from the main views. Use the status dropdown to restore one if needed.
          </div>

          {/* Mobile cancelled cards */}
          <div className="grid grid-cols-1 gap-2 md:hidden">
            {cancelledList.map((e) => {
              const levelInfo = LEVEL_DISPLAY[e.swim_level as SwimLevel];
              const ageGroup = getAgeGroup(e.child_age);
              const groupName = levelInfo ? getGroupName(e.swim_level as SwimLevel, ageGroup) : e.swim_level;
              return (
                <Card key={e.id} className="p-3 opacity-90">
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-sm break-words"><SwimmerLink childName={e.child_name} parentEmail={e.parent_email} /></span>
                        <Badge variant="outline" className={`text-[10px] ${levelInfo?.color || ""}`}>{groupName}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground break-words">{e.parent_name}</div>
                      <div className="text-xs text-muted-foreground break-all">{e.parent_email}</div>
                    </div>
                    <Button size="icon" variant="ghost" className="shrink-0 -mr-1" onClick={() => { setSelectedEnrollment(e); setDialogOpen(true); }}>
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                    {!e.admin_reviewed_at && (
                      <Badge variant="outline" className="text-[10px] bg-red-100 text-red-700 border-red-300">New</Badge>
                    )}
                    <Badge variant="outline" className={`text-[10px] ${enrollmentStateColor(e.status)}`}>{e.status}</Badge>
                    <Badge variant="outline" className={`text-[10px] ${paymentStatusColor(e.payment_status)}`}>Reg: {formatPaymentStatus(e.payment_status)}</Badge>
                    <Badge variant="outline" className={`text-[10px] ${sessionFeeColor(e.session_fee_status)}`}>Session: {formatPaymentStatus(e.session_fee_status)}</Badge>
                    {!e.admin_reviewed_at && (
                      <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] gap-1" onClick={() => acknowledgeEnrollment(e.id)}>
                        <CheckCircle className="w-3 h-3" /> Acknowledge
                      </Button>
                    )}
                  </div>

                </Card>
              );
            })}
            {cancelledList.length === 0 && (
              <p className="text-center py-8 text-sm text-muted-foreground">No cancelled enrollments</p>
            )}
          </div>

          <Card className="hidden md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Child</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Parent</TableHead>
                    <TableHead>Session</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reg Fee</TableHead>
                    <TableHead>Session Fee</TableHead>
                    <TableHead>Cancelled</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cancelledList.map((e) => {
                    const levelInfo = LEVEL_DISPLAY[e.swim_level as SwimLevel];
                    const ageGroup = getAgeGroup(e.child_age);
                    const groupName = levelInfo ? getGroupName(e.swim_level as SwimLevel, ageGroup) : e.swim_level;
                    const session = e.session_id ? sessions[e.session_id] : null;
                    return (
                      <TableRow key={e.id} className="opacity-80">
                        <TableCell className="font-medium"><SwimmerLink childName={e.child_name} parentEmail={e.parent_email} /></TableCell>
                        <TableCell>{e.child_age}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={levelInfo?.color || ""}>{groupName}</Badge>
                        </TableCell>
                        <TableCell>
                          <div>{e.parent_name}</div>
                          <div className="text-xs text-muted-foreground">{e.parent_email}</div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {session ? `${session.session_name || ""} ${formatDayOfWeek(session.day_of_week)} ${formatTime12h(session.start_time)}` : "—"}
                        </TableCell>
                        <TableCell>
                          <Select value={e.status} onValueChange={(v) => updateStatus(e.id, v)}>
                            <SelectTrigger className={`w-[140px] h-9 font-semibold ${enrollmentStateColor(e.status)}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="confirmed">Confirmed</SelectItem>
                              <SelectItem value="waitlist">Waitlist</SelectItem>
                              <SelectItem value="no_show">No-show</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={paymentStatusColor(e.payment_status)}>
                            {formatPaymentStatus(e.payment_status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={sessionFeeColor(e.session_fee_status)}>
                            {formatPaymentStatus(e.session_fee_status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(e.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={() => { setSelectedEnrollment(e); setDialogOpen(true); }}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="ghost" title="Delete enrollment" onClick={() => deleteEnrollment(e)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {cancelledList.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                        No cancelled enrollments
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="waitlist" className="space-y-4">
          <WaitlistPanel />
        </TabsContent>
      </Tabs>

      <EnrollmentDetailDialog
        enrollment={selectedEnrollment}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onUpdated={(updated) => {
          setEnrollments((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
        }}
      />

      <MoveSwimmerDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        enrollment={moveTarget}
        sessions={Object.values(sessions)}
        periods={sessionPeriods}
        allEnrollments={enrollments}
        onMoved={fetchData}
      />

      <SendPaymentLinkDialog
        open={payLinkOpen}
        onOpenChange={setPayLinkOpen}
        target={payLinkTarget}
        onSent={() => {
          if (payLinkTarget) {
            setEnrollments((prev) => prev.map((e) =>
              e.id === payLinkTarget.enrollmentId
                ? { ...e, payment_reminder_sent_at: new Date().toISOString() }
                : e,
            ));
          }
        }}
      />

      <StartReminderPreviewDialog
        open={reminderPreviewOpen}
        onClose={() => setReminderPreviewOpen(false)}
        periodFilter={periodFilter}
        initialTestPhone={reminderTestPhone}
      />


      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => { if (!o) setCancelTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel enrollment?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {cancelTarget && (
                  <div className="text-sm text-foreground">
                    <p><strong>{cancelTarget.child_name}</strong> — {cancelTarget.parent_name}</p>
                    <p className="text-muted-foreground text-xs mt-1">{cancelTarget.parent_email}</p>
                  </div>
                )}
                {cancelTarget && (
                  <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
                    <p className="font-semibold text-foreground">Refundable charges on this enrollment:</p>
                    {cancelTarget.payment_status === "paid" && cancelTarget.stripe_payment_id ? (
                      <p>• Registration / initial payment: <span className="font-medium">${cancelTarget.payment_amount ?? (cancelTarget.is_first_time ? 45 : 240)}</span></p>
                    ) : (
                      <p className="text-muted-foreground">• No registration payment to refund</p>
                    )}
                    {cancelTarget.session_fee_status === "paid" && cancelTarget.session_fee_stripe_id ? (
                      <p>• Session fee: <span className="font-medium">$240</span></p>
                    ) : (
                      <p className="text-muted-foreground">• No session fee paid via Stripe</p>
                    )}
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="refund-check"
                    checked={cancelRefund}
                    onCheckedChange={(v) => setCancelRefund(!!v)}
                  />
                  <Label htmlFor="refund-check" className="text-sm font-normal leading-tight cursor-pointer">
                    Issue Stripe refund(s) for any captured charges and notify parent by email
                  </Label>
                </div>
                <div>
                  <Label htmlFor="cancel-reason" className="text-xs">Reason (added to enrollment notes)</Label>
                  <Textarea
                    id="cancel-reason"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="e.g., Family schedule conflict — refunded full session fee"
                    className="mt-1 text-sm"
                    rows={2}
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep enrollment</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmCancellation(); }}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? "Cancelling…" : cancelRefund ? "Cancel & refund" : "Cancel (no refund)"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!markPaidTarget} onOpenChange={(o) => { if (!o) setMarkPaidTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {markPaidTarget?.fee === "reg" ? "Registration Fee — $45" : "Session Fee — $240"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {markPaidTarget && (
              <div className="text-xs text-muted-foreground">
                {markPaidTarget.enrollment.child_name} · {markPaidTarget.enrollment.parent_name}
              </div>
            )}
            <div>
              <Label className="text-xs">Method</Label>
              <Select value={markPaidMethod} onValueChange={(v) => setMarkPaidMethod(v as any)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="comp">Comp (no charge)</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Reference (optional)</Label>
              <Input
                placeholder={
                  markPaidMethod === "cash" ? "Receipt # or note" :
                  markPaidMethod === "check" ? "Check #" :
                  markPaidMethod === "comp" ? "Reason for comp" : "Reference"
                }
                value={markPaidReference}
                onChange={(e) => setMarkPaidReference(e.target.value)}
                className="h-9"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Optional. Stripe payments are recorded automatically.
              </p>
            </div>
            {(markPaidMethod === "cash" || markPaidMethod === "check") && markPaidTarget?.enrollment.parent_email && (
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={markPaidEmailReceipt}
                  onChange={(e) => setMarkPaidEmailReceipt(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Email a receipt to {markPaidTarget.enrollment.parent_email}
              </label>
            )}
          </div>
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setMarkPaidTarget(null)} disabled={markPaidSaving}>Cancel</Button>
            <Button size="sm" onClick={confirmMarkPaid} disabled={markPaidSaving}>
              {markPaidSaving ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SwimEnrollmentsAdmin;

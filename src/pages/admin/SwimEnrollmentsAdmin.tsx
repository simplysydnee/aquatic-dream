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
import SessionEnrollmentCards from "@/components/admin/SessionEnrollmentCards";
import { Progress } from "@/components/ui/progress";
import { Eye, CheckCircle, Send } from "lucide-react";
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
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [sessionFilter, setSessionFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<string>("all");
  const [ageFilter, setAgeFilter] = useState<string>("all");
  const [seatsPeriodFilter, setSeatsPeriodFilter] = useState<string>("upcoming");

  const fetchData = async () => {
    const [enrollRes, sessionRes, periodRes] = await Promise.all([
      supabase.from("swim_enrollments").select("*").order("created_at", { ascending: false }),
      supabase.from("swim_sessions").select("id, start_time, end_time, session_name, age_group, swim_level, max_students, day_of_week, session_period_id"),
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

  const sendPaymentLink = async (enrollment: Enrollment) => {
    toast({ title: "Sending payment link...", description: `Emailing ${enrollment.parent_email}` });
    const { data, error } = await supabase.functions.invoke("send-session-payment-link", {
      body: { enrollmentId: enrollment.id, environment: "live" },
    });
    if (error || !data?.success) {
      toast({ title: "Failed to send", description: error?.message || data?.error || "Please try again.", variant: "destructive" });
    } else {
      toast({ title: "Payment link sent!", description: `Email sent to ${enrollment.parent_email}` });
      setEnrollments((prev) => prev.map((e) => (e.id === enrollment.id ? { ...e, payment_reminder_sent_at: new Date().toISOString() } : e)));
    }
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

  const cancelledCount = scope.filter((e) => e.status === "cancelled").length;
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-display font-bold text-foreground">Swim Enrollments</h2>
        <Badge variant="outline" className="text-sm">{enrollments.length} total</Badge>
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
        <TabsList>
          <TabsTrigger value="all">All Enrollments</TabsTrigger>
          <TabsTrigger value="by-session">By Session</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {/* Filters */}
          <div className="flex gap-3 items-center flex-wrap">
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select value={paymentFilter} onValueChange={setPaymentFilter}>
              <SelectTrigger className="w-[150px]">
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
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Sessions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sessions</SelectItem>
                {sessionPeriods.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={ageFilter} onValueChange={setAgeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Ages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Ages</SelectItem>
                <SelectItem value="preschool-3-5">Preschool (3–5)</SelectItem>
                <SelectItem value="school-age-6-12">School Age (6–12)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sessionFilter} onValueChange={setSessionFilter}>
              <SelectTrigger className="w-[220px]">
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

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Child</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Parent</TableHead>
                    <TableHead>Session</TableHead>
                    <TableHead>Reg Fee</TableHead>
                    <TableHead>Session Fee</TableHead>
                    <TableHead>Method / Ref</TableHead>
                    <TableHead>Enrollment State</TableHead>
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
                        <TableCell className="font-medium">{e.child_name}</TableCell>
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
                          {e.is_first_time && e.payment_status !== "not_required" ? (
                            <Select value={e.payment_status} onValueChange={(v) => updatePaymentStatus(e, v)}>
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
                          <Select value={e.session_fee_status} onValueChange={(v) => updateSessionFeeStatus(e, v)}>
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
                        <TableCell>
                          <Select value={e.status} onValueChange={(v) => updateStatus(e.id, v)}>
                            <SelectTrigger className={`w-[130px] h-8 ${enrollmentStateColor(e.status)}`}>
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
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(e.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {e.session_fee_status === "due_day_1" && (
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Send $240 session fee payment link"
                                onClick={() => sendPaymentLink(e)}
                              >
                                <Send className="w-4 h-4 text-primary" />
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" onClick={() => { setSelectedEnrollment(e); setDialogOpen(true); }}>
                              <Eye className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
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
            enrollments={enrollments}
            sessionPeriods={sessionPeriods}
          />
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
    </div>
  );
};

export default SwimEnrollmentsAdmin;

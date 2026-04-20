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
import { Eye, CheckCircle, Send } from "lucide-react";
import { toast } from "@/hooks/use-toast";

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

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("swim_enrollments").update({ status }).eq("id", id);
    setEnrollments((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e)));
  };

  const updatePaymentStatus = async (enrollment: Enrollment, payment_status: string) => {
    const { error } = await supabase
      .from("swim_enrollments")
      .update({ payment_status })
      .eq("id", enrollment.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Payment updated", description: `${enrollment.child_name}: ${payment_status}` });
      setEnrollments((prev) => prev.map((e) => (e.id === enrollment.id ? { ...e, payment_status } : e)));
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
      default: return "bg-yellow-100 text-yellow-700 border-yellow-300";
    }
  };

  const filtered = enrollments.filter((e) => {
    const matchSearch = search === "" ||
      e.child_name.toLowerCase().includes(search.toLowerCase()) ||
      e.parent_name.toLowerCase().includes(search.toLowerCase()) ||
      e.parent_email.toLowerCase().includes(search.toLowerCase());
    const matchPayment = paymentFilter === "all" || e.payment_status === paymentFilter;
    const matchSession = sessionFilter === "all" || e.session_id === sessionFilter;
    const matchPeriod = periodFilter === "all" || (e.session_id && sessions[e.session_id]?.session_period_id === periodFilter);
    const matchAge = ageFilter === "all" || (e.session_id && sessions[e.session_id]?.age_group === ageFilter);
    return matchSearch && matchPayment && matchSession && matchPeriod && matchAge;
  });

  // Filter-aware metrics: when any filter is active, scope to filtered; else use full set.
  const anyFilterActive =
    search !== "" || paymentFilter !== "all" || sessionFilter !== "all" ||
    periodFilter !== "all" || ageFilter !== "all";
  const scope = anyFilterActive ? filtered : enrollments;

  const isActive = (e: Enrollment) => e.status === "confirmed" || e.status === "enrolled";
  const activeEnrollments = scope.filter(isActive);

  const SESSION_FEE = 240;
  const REG_FEE = 45;

  const activeCount = activeEnrollments.length;
  const revenueCollected = activeEnrollments
    .filter((e) => e.payment_status === "paid")
    .reduce((sum, e) => sum + (Number(e.payment_amount) || 0), 0);

  // Owed Now: overdue balances that should NEVER grow under the new rules.
  // - Returning + unpaid → $240 (should have paid at checkout)
  // - First-time + unpaid (reg fee NOT waived) → $45
  const owedNowReturning = activeEnrollments
    .filter((e) => !e.is_first_time && e.payment_status === "unpaid")
    .reduce((sum) => sum + SESSION_FEE, 0);
  const owedNowFirstTime = activeEnrollments
    .filter((e) => e.is_first_time && e.payment_status === "unpaid")
    .reduce((sum) => sum + REG_FEE, 0);
  const owedNowTotal = owedNowReturning + owedNowFirstTime;

  // Day-1 Collection: cash/check expected at first lesson.
  // - Every active first-timer owes $240 day 1 (regardless of reg fee status)
  // - Returning swimmers flagged as day-1 grace (payment_method = 'cash' AND unpaid)
  const dayOneFirstTimers = activeEnrollments.filter((e) => e.is_first_time);
  const dayOneReturningGrace = activeEnrollments.filter(
    (e) => !e.is_first_time && e.payment_status === "unpaid" && e.payment_method === "cash",
  );
  const dayOneTotal = (dayOneFirstTimers.length + dayOneReturningGrace.length) * SESSION_FEE;

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
            <p className="text-[11px] text-muted-foreground mt-1">Stripe payments to date</p>
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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Capacity Used</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">
              {classesStarted}<span className="text-muted-foreground text-xl"> / {totalClasses}</span>
            </p>
            <p className="text-[11px] text-muted-foreground mt-1 leading-tight">
              {classesPct}% of classes started<br />
              avg {avgPerStartedClass} of 3 seats per filled class
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground -mt-2">
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
                    <TableHead>Payment</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method / Ref</TableHead>
                    <TableHead>Status</TableHead>
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
                          <Select value={e.payment_status} onValueChange={(v) => updatePaymentStatus(e, v)}>
                            <SelectTrigger className={`w-[120px] h-8 ${paymentStatusColor(e.payment_status)}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unpaid">Unpaid</SelectItem>
                              <SelectItem value="paid">Paid</SelectItem>
                              <SelectItem value="refunded">Refunded</SelectItem>
                              <SelectItem value="waived">Waived</SelectItem>
                            </SelectContent>
                          </Select>
                          {e.is_first_time && (
                            <span className="block text-[10px] text-muted-foreground mt-0.5">1st time</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {e.payment_amount ? `$${e.payment_amount}` : "—"}
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
                            <SelectTrigger className="w-[110px] h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="enrolled">Enrolled</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(e.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {e.payment_status === "unpaid" && e.is_first_time && (
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Send payment link email"
                                onClick={() => sendPaymentLink(e)}
                              >
                                <Send className="w-4 h-4 text-primary" />
                              </Button>
                            )}
                            {e.payment_status === "unpaid" && (
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Mark as paid (cash/check)"
                                onClick={() => updatePaymentStatus(e, "paid")}
                              >
                                <CheckCircle className="w-4 h-4 text-green-600" />
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
    </div>
  );
};

export default SwimEnrollmentsAdmin;

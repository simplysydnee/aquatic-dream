import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { LEVEL_DISPLAY, type SwimLevel, getGroupName, getAgeGroup } from "@/components/swim-enrollment/types";
import EnrollmentDetailDialog from "@/components/admin/EnrollmentDetailDialog";
import { Eye, DollarSign, Send, CheckCircle } from "lucide-react";
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
}

interface SessionInfo {
  id: string;
  start_time: string;
  session_name: string | null;
  age_group: string | null;
  swim_level: string;
}

const SwimEnrollmentsAdmin = () => {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [sessions, setSessions] = useState<Record<string, SessionInfo>>({});
  const [loading, setLoading] = useState(true);
  const [selectedEnrollment, setSelectedEnrollment] = useState<Enrollment | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");

  const fetchData = async () => {
    const [enrollRes, sessionRes] = await Promise.all([
      supabase.from("swim_enrollments").select("*").order("created_at", { ascending: false }),
      supabase.from("swim_sessions").select("id, start_time, session_name, age_group, swim_level"),
    ]);

    if (enrollRes.data) setEnrollments(enrollRes.data as Enrollment[]);
    if (sessionRes.data) {
      const map: Record<string, SessionInfo> = {};
      sessionRes.data.forEach((s: any) => (map[s.id] = s));
      setSessions(map);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("swim_enrollments").update({ status }).eq("id", id);
    setEnrollments((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e)));
  };

  const markAsPaid = async (enrollment: Enrollment) => {
    const { error } = await supabase
      .from("swim_enrollments")
      .update({ payment_status: "paid" })
      .eq("id", enrollment.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Marked as paid", description: `${enrollment.child_name} marked as paid.` });
      setEnrollments((prev) => prev.map((e) => (e.id === enrollment.id ? { ...e, payment_status: "paid" } : e)));
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
    return matchSearch && matchPayment;
  });

  const unpaidCount = enrollments.filter((e) => e.payment_status === "unpaid" && e.status === "enrolled").length;
  const paidCount = enrollments.filter((e) => e.payment_status === "paid").length;
  const cancelledCount = enrollments.filter((e) => e.status === "cancelled").length;

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-display font-bold text-foreground">Swim Enrollments</h2>
        <Badge variant="outline" className="text-sm">{enrollments.length} total</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Enrolled (Unpaid)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-yellow-600">{unpaidCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{paidCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cancelled</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-red-600">{cancelledCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center">
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
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
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
                      {session ? `${session.session_name || ""} ${session.start_time}` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={paymentStatusColor(e.payment_status)}>
                        {e.payment_status}
                      </Badge>
                      {e.is_first_time && (
                        <span className="block text-[10px] text-muted-foreground mt-0.5">1st time</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {e.payment_amount ? `$${e.payment_amount}` : "—"}
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
                        {e.payment_status === "unpaid" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Mark as paid (cash/check)"
                            onClick={() => markAsPaid(e)}
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
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    No enrollments found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
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

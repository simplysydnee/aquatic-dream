import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface LessonRequest {
  id: string;
  parent_name: string;
  parent_email: string;
  parent_phone: string | null;
  child_name: string;
  child_age: number;
  lesson_type: string;
  preferred_times: string | null;
  notes: string | null;
  status: string;
  created_at: string;
}

const LessonRequestsAdmin = () => {
  const [requests, setRequests] = useState<LessonRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("lesson_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setRequests(data as LessonRequest[]);
        setLoading(false);
      });
  }, []);

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("lesson_requests").update({ status }).eq("id", id);
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-display font-bold text-foreground">Lesson Requests</h2>
        <Badge variant="outline" className="text-sm">{requests.length} total</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {["new", "contacted", "scheduled"].map((status) => {
          const count = requests.filter((r) => r.status === status).length;
          return (
            <Card key={status}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium capitalize text-muted-foreground">{status}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">{count}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Child</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Parent</TableHead>
                <TableHead>Preferred Times</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.child_name}</TableCell>
                  <TableCell>{r.child_age}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={r.lesson_type === "private" ? "bg-purple-50 text-purple-700 border-purple-300" : "bg-blue-50 text-blue-700 border-blue-300"}>
                      {r.lesson_type === "private" ? "Private" : "Semi-Private"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div>{r.parent_name}</div>
                    <div className="text-xs text-muted-foreground">{r.parent_email}</div>
                    {r.parent_phone && <div className="text-xs text-muted-foreground">{r.parent_phone}</div>}
                  </TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate">{r.preferred_times || "—"}</TableCell>
                  <TableCell>
                    <Select value={r.status} onValueChange={(v) => updateStatus(r.id, v)}>
                      <SelectTrigger className="w-[120px] h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="contacted">Contacted</SelectItem>
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                        <SelectItem value="declined">Declined</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
              {requests.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No lesson requests yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default LessonRequestsAdmin;

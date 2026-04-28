import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import LessonRequestDetailDialog, { LessonRequest } from "@/components/admin/LessonRequestDetailDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, MessageSquare } from "lucide-react";
import { formatPhone } from "@/lib/phone";
import { useCommentCounts } from "@/hooks/useInternalComments";

const LessonRequestsAdmin = () => {
  const [requests, setRequests] = useState<LessonRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LessonRequest | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

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

  const handleUpdated = (updated: LessonRequest) => {
    setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setSelected(updated);
  };

  const openRequest = (r: LessonRequest) => {
    setSelected(r);
    setDialogOpen(true);
  };

  const requestIds = useMemo(() => requests.map((r) => r.id), [requests]);
  const commentCounts = useCommentCounts("lesson_request", requestIds);

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
                <TableHead>Replied</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => openRequest(r)}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1.5">
                      {r.child_name}
                      {commentCounts[r.id] > 0 && (
                        <Badge variant="secondary" className="gap-1 text-[10px] h-5">
                          <MessageSquare className="h-3 w-3" />
                          {commentCounts[r.id]}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{r.child_age}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={r.lesson_type === "private" ? "bg-purple-50 text-purple-700 border-purple-300" : "bg-blue-50 text-blue-700 border-blue-300"}>
                      {r.lesson_type === "private" ? "Private" : "Semi-Private"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div>{r.parent_name}</div>
                    <div className="text-xs text-muted-foreground">{r.parent_email}</div>
                    {r.parent_phone && <div className="text-xs text-muted-foreground">{formatPhone(r.parent_phone)}</div>}
                  </TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate">{r.preferred_times || "—"}</TableCell>
                  <TableCell>
                    {r.status === "new" ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="destructive" className="capitalize cursor-help">
                              {r.status}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            Auto-confirmation sent. Awaiting personal reply.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <Badge variant="secondary" className="capitalize">
                        {r.status}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.last_replied_at ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {new Date(r.last_replied_at).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
              {requests.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No lesson requests yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <LessonRequestDetailDialog
        request={selected}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onUpdated={handleUpdated}
      />
    </div>
  );
};

export default LessonRequestsAdmin;

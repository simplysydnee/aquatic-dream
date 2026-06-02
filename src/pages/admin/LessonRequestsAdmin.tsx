import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import LessonRequestDetailDialog, { LessonRequest } from "@/components/admin/LessonRequestDetailDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, MessageSquare, Copy, Check } from "lucide-react";
import { formatPhone } from "@/lib/phone";
import { useCommentCounts } from "@/hooks/useInternalComments";
import SwimmerLink from "@/components/admin/swimmer/SwimmerLink";
import { toast } from "@/hooks/use-toast";

const LessonRequestsAdmin = () => {
  const [requests, setRequests] = useState<LessonRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LessonRequest | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [audienceFilter, setAudienceFilter] = useState<"kids" | "adults" | "all">("kids");

  const bookingUrl = `${window.location.origin}/book-private-lesson`;

  const copyBookingLink = async () => {
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setCopied(true);
      toast({ title: "Link copied", description: "Private booking link copied to clipboard." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Couldn't copy", description: bookingUrl, variant: "destructive" });
    }
  };

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

  const filteredRequests = useMemo(() => {
    if (audienceFilter === "all") return requests;
    if (audienceFilter === "adults") return requests.filter((r) => r.is_adult_swimmer);
    return requests.filter((r) => !r.is_adult_swimmer);
  }, [requests, audienceFilter]);

  const requestIds = useMemo(() => filteredRequests.map((r) => r.id), [filteredRequests]);
  const commentCounts = useCommentCounts("lesson_request", requestIds);

  const adultCount = useMemo(() => requests.filter((r) => r.is_adult_swimmer).length, [requests]);

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-xl sm:text-2xl font-display font-bold text-foreground">Lesson Requests</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={copyBookingLink} className="gap-1.5">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copied!" : "Copy private-booking link"}
          </Button>
          <Badge variant="outline" className="text-xs sm:text-sm shrink-0">{requests.length} total</Badge>
        </div>
      </div>
      <p className="text-xs text-muted-foreground -mt-3 break-all">
        Share with families: <span className="font-mono">{bookingUrl}</span>
      </p>

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {["new", "contacted", "scheduled"].map((status) => {
          const count = requests.filter((r) => r.status === status).length;
          return (
            <Card key={status}>
              <CardHeader className="pb-2 p-3 sm:p-4">
                <CardTitle className="text-xs sm:text-sm font-medium capitalize text-muted-foreground">{status}</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
                <p className="text-2xl sm:text-3xl font-bold text-foreground">{count}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Mobile cards */}
      <div className="grid grid-cols-1 gap-2 md:hidden">
        {requests.map((r) => (
          <Card key={r.id} className="p-3 cursor-pointer" onClick={() => openRequest(r)}>
            <div className="flex items-start justify-between gap-2 min-w-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold text-sm break-words"><SwimmerLink childName={r.child_name} parentEmail={r.parent_email} /></span>
                  <span className="text-xs text-muted-foreground">({r.child_age})</span>
                  {commentCounts[r.id] > 0 && (
                    <Badge variant="secondary" className="gap-1 text-[10px] h-5">
                      <MessageSquare className="h-3 w-3" />{commentCounts[r.id]}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground break-words">{r.parent_name}</div>
                <div className="text-xs text-muted-foreground break-all">{r.parent_email}</div>
                {r.parent_phone && <div className="text-xs text-muted-foreground">{formatPhone(r.parent_phone)}</div>}
                {r.preferred_times && <div className="text-xs mt-1 break-words">⏰ {r.preferred_times}</div>}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className={`text-[10px] ${r.lesson_type === "private" ? "bg-purple-50 text-purple-700 border-purple-300" : "bg-blue-50 text-blue-700 border-blue-300"}`}>
                {r.lesson_type === "private" ? "Private" : "Semi-Private"}
              </Badge>
              <Badge variant={r.status === "new" ? "destructive" : "secondary"} className="capitalize text-[10px]">{r.status}</Badge>
              {r.last_replied_at && (
                <span className="inline-flex items-center gap-1 text-[10px] text-green-700">
                  <CheckCircle2 className="h-3 w-3" /> {new Date(r.last_replied_at).toLocaleDateString()}
                </span>
              )}
              <span className="ml-auto text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
            </div>
          </Card>
        ))}
        {requests.length === 0 && <p className="text-center py-8 text-sm text-muted-foreground">No lesson requests yet</p>}
      </div>

      <Card className="hidden md:block">
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
                      <SwimmerLink childName={r.child_name} parentEmail={r.parent_email} />
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

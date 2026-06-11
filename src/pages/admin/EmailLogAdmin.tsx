import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Mail, RefreshCw, Loader2, Eye, EyeOff } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import EmailPreviewDialog, { type EmailPreviewData } from "@/components/admin/EmailPreviewDialog";

type EmailRow = {
  id: string;
  message_id: string | null;
  template_name: string;
  recipient_email: string;
  status: string;
  error_message: string | null;
  metadata: any;
  created_at: string;
};

type TimeRange = "24h" | "7d" | "30d" | "all";

const PAGE_SIZE = 50;

const STATUS_VARIANT: Record<string, { label: string; className: string }> = {
  sent: { label: "Sent", className: "bg-green-100 text-green-800 border-green-200" },
  pending: { label: "Pending", className: "bg-gray-100 text-gray-700 border-gray-200" },
  failed: { label: "Failed", className: "bg-red-100 text-red-800 border-red-200" },
  dlq: { label: "Failed (DLQ)", className: "bg-red-100 text-red-800 border-red-200" },
  bounced: { label: "Bounced", className: "bg-red-100 text-red-800 border-red-200" },
  complained: { label: "Complained", className: "bg-orange-100 text-orange-800 border-orange-200" },
  suppressed: { label: "Suppressed", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
};

function statusBadge(status: string) {
  const v = STATUS_VARIANT[status] || { label: status, className: "bg-muted text-foreground" };
  return <Badge variant="outline" className={v.className}>{v.label}</Badge>;
}

function getStartDate(range: TimeRange): Date | null {
  if (range === "all") return null;
  const now = new Date();
  if (range === "24h") return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (range === "7d") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (range === "30d") return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return null;
}

export default function EmailLogAdmin() {
  const [rows, setRows] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [templateFilter, setTemplateFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [previewEmail, setPreviewEmail] = useState<EmailPreviewData | null>(null);

  const fetchData = async () => {
    setLoading(true);
    const startDate = getStartDate(timeRange);
    let query = supabase
      .from("email_send_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(2000);

    if (startDate) query = query.gte("created_at", startDate.toISOString());

    const { data, error } = await query;
    if (error) {
      toast.error("Failed to load email log: " + error.message);
      setLoading(false);
      return;
    }

    // Deduplicate by message_id, keeping the latest row but merging in
    // metadata from any earlier row in the same group (the rendered HTML is
    // stored on the initial `pending` insert, not on the later `sent` row).
    const groups = new Map<string, EmailRow>();
    for (const r of (data || []) as EmailRow[]) {
      const key = r.message_id || r.id;
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, r);
      } else if (!existing.metadata && r.metadata) {
        // Keep the latest row's status/error but inherit metadata from the older row
        groups.set(key, { ...existing, metadata: r.metadata });
      }
    }
    const deduped: EmailRow[] = Array.from(groups.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    setRows(deduped);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange]);

  const templateOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.template_name && set.add(r.template_name));
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (templateFilter !== "all" && r.template_name !== templateFilter) return false;
      if (statusFilter !== "all") {
        if (statusFilter === "failed") {
          if (!["failed", "dlq", "bounced"].includes(r.status)) return false;
        } else if (r.status !== statusFilter) return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const td = r.metadata?.templateData || {};
        const haystacks: string[] = [
          r.recipient_email || "",
          r.template_name || "",
          td.parentName, td.parent_name, td.parentEmail,
          td.childName, td.child_name, td.swimmerName, td.swimmer_name,
          td.instructorName, td.instructor_name,
        ].filter(Boolean).map((s: string) => String(s).toLowerCase());
        if (!haystacks.some((h) => h.includes(q))) return false;
      }
      return true;
    });
  }, [rows, templateFilter, statusFilter, search]);

  const stats = useMemo(() => {
    const s = { total: 0, sent: 0, failed: 0, suppressed: 0, pending: 0 };
    filtered.forEach((r) => {
      s.total++;
      if (r.status === "sent") s.sent++;
      else if (["failed", "dlq", "bounced"].includes(r.status)) s.failed++;
      else if (r.status === "suppressed") s.suppressed++;
      else if (r.status === "pending") s.pending++;
    });
    return s;
  }, [filtered]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => { setPage(0); }, [templateFilter, statusFilter, search, timeRange]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Mail className="h-7 w-7" /> Email Log
          </h1>
          <p className="text-muted-foreground">All emails sent by the system</p>
        </div>
        <Button variant="outline" onClick={fetchData} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Refresh
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats.total}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Sent</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-green-700">{stats.sent}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Failed</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-red-700">{stats.failed}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Suppressed</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-yellow-700">{stats.suppressed}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Pending</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-gray-700">{stats.pending}</div></CardContent></Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6 grid gap-3 md:grid-cols-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Time range</label>
            <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="24h">Last 24 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Template</label>
            <Select value={templateFilter} onValueChange={setTemplateFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All templates</SelectItem>
                {templateOptions.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Status</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="suppressed">Suppressed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Search</label>
            <Input placeholder="email, parent, swimmer, instructor, template…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Loading…
            </div>
          ) : pageRows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No emails match the current filters.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead className="w-20 text-right">View</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((r) => {
                  const isOpen = !!expanded[r.id];
                  return (
                    <Collapsible key={r.id} asChild open={isOpen} onOpenChange={(o) => setExpanded((s) => ({ ...s, [r.id]: o }))}>
                      <>
                        <TableRow className="cursor-pointer" onClick={() => setExpanded((s) => ({ ...s, [r.id]: !isOpen }))}>
                          <TableCell>
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {format(new Date(r.created_at), "MMM d, yyyy h:mm a")}
                          </TableCell>
                          <TableCell className="font-medium">{r.template_name}</TableCell>
                          <TableCell>{r.recipient_email}</TableCell>
                          <TableCell>{statusBadge(r.status)}</TableCell>
                          <TableCell className="max-w-xs truncate text-sm text-red-700" title={r.error_message || ""}>
                            {r.error_message || ""}
                          </TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            {r.metadata?.html ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setPreviewEmail({
                                  template_name: r.template_name,
                                  recipient_email: r.recipient_email,
                                  status: r.status,
                                  created_at: r.created_at,
                                  metadata: r.metadata,
                                })}
                                title="View email"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            ) : (
                              <span
                                className="inline-flex h-9 w-9 items-center justify-center text-muted-foreground/50"
                                title="Preview not available for this email"
                              >
                                <EyeOff className="h-4 w-4" />
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                        <CollapsibleContent asChild>
                          <TableRow>
                            <TableCell colSpan={7} className="bg-muted/30">
                              <div className="space-y-2 text-sm py-2">
                                <div><span className="font-medium">Message ID:</span> <span className="font-mono text-xs">{r.message_id || "—"}</span></div>
                                {r.error_message && (
                                  <div>
                                    <div className="font-medium">Full error:</div>
                                    <pre className="whitespace-pre-wrap text-xs bg-background p-2 rounded border border-border">{r.error_message}</pre>
                                  </div>
                                )}
                                {r.metadata && (() => {
                                  const { html: _h, ...rest } = r.metadata || {};
                                  if (!Object.keys(rest).length) return null;
                                  return (
                                    <div>
                                      <div className="font-medium">Metadata:</div>
                                      <pre className="whitespace-pre-wrap text-xs bg-background p-2 rounded border border-border">{JSON.stringify(rest, null, 2)}</pre>
                                    </div>
                                  );
                                })()}
                              </div>
                            </TableCell>
                          </TableRow>
                        </CollapsibleContent>
                      </>
                    </Collapsible>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <EmailPreviewDialog
        email={previewEmail}
        open={!!previewEmail}
        onOpenChange={(o) => { if (!o) setPreviewEmail(null); }}
      />
    </div>
  );
}

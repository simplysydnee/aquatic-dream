import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Status = "new" | "contacted" | "enrolled" | "closed";

interface Row {
  id: string;
  parent_first_name: string;
  parent_last_name: string;
  parent_email: string;
  parent_phone: string | null;
  child_first_name: string;
  child_last_name: string;
  child_age: number | null;
  swim_level: string | null;
  session_id: string | null;
  notes: string | null;
  status: Status;
  created_at: string;
}

const STATUS_COLORS: Record<Status, string> = {
  new: "bg-primary/15 text-primary",
  contacted: "bg-accent/20 text-accent-foreground",
  enrolled: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  closed: "bg-muted text-muted-foreground",
};

export default function WaitlistPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("waitlist_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Couldn't load waitlist", description: error.message, variant: "destructive" });
    } else {
      setRows((data as Row[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (id: string, status: Status) => {
    const prev = rows;
    setRows(rs => rs.map(r => (r.id === id ? { ...r, status } : r)));
    const { error } = await supabase.from("waitlist_requests").update({ status }).eq("id", id);
    if (error) {
      setRows(prev);
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading waitlist…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="font-medium text-foreground mb-1">No waitlist requests yet.</p>
        <p className="text-sm">
          Parents who hit a full session and submit the friendly fallback screen will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Submitted</TableHead>
            <TableHead>Parent</TableHead>
            <TableHead>Child</TableHead>
            <TableHead>Level / Session</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(r => (
            <TableRow key={r.id}>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                {new Date(r.created_at).toLocaleString()}
              </TableCell>
              <TableCell className="font-medium">
                {r.parent_first_name} {r.parent_last_name}
              </TableCell>
              <TableCell>
                {r.child_first_name} {r.child_last_name}
                {r.child_age != null && (
                  <span className="text-muted-foreground"> · age {r.child_age}</span>
                )}
              </TableCell>
              <TableCell>
                <div className="text-sm">{r.swim_level || "—"}</div>
                {r.session_id && (
                  <div className="text-xs text-muted-foreground font-mono">
                    {r.session_id.slice(0, 8)}…
                  </div>
                )}
              </TableCell>
              <TableCell className="text-sm">
                <a href={`mailto:${r.parent_email}`} className="underline">{r.parent_email}</a>
                {r.parent_phone && (
                  <div className="text-xs text-muted-foreground">{r.parent_phone}</div>
                )}
              </TableCell>
              <TableCell>
                <Badge className={STATUS_COLORS[r.status]} variant="secondary">
                  {r.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Select value={r.status} onValueChange={v => setStatus(r.id, v as Status)}>
                  <SelectTrigger className="w-[130px] ml-auto">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="contacted">Contacted</SelectItem>
                    <SelectItem value="enrolled">Enrolled</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

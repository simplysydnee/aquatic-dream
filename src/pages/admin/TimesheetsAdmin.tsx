import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Check, X, Pencil, Download } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, startOfWeek, endOfWeek, addWeeks, subWeeks } from "date-fns";

interface Punch {
  id: string;
  instructor_id: string;
  shift_id: string | null;
  clock_in_at: string;
  clock_out_at: string | null;
  break_minutes: number;
  notes: string | null;
  status: string;
}
interface Instructor { id: string; name: string; hourly_wage: number | null; }

const hours = (p: Punch) => {
  if (!p.clock_out_at) return 0;
  const ms = new Date(p.clock_out_at).getTime() - new Date(p.clock_in_at).getTime() - (p.break_minutes ?? 0) * 60_000;
  return Math.max(0, ms / 3_600_000);
};

const toLocalDT = (iso: string) => {
  const d = new Date(iso);
  const tzOffset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
};
const fromLocalDT = (s: string) => new Date(s).toISOString();

export default function TimesheetsAdmin() {
  const [loading, setLoading] = useState(true);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [filter, setFilter] = useState<"all" | "pending" | "approved">("pending");
  const [editing, setEditing] = useState<Punch | null>(null);
  const [editForm, setEditForm] = useState({ clock_in_at: "", clock_out_at: "", break_minutes: 0, notes: "" });

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });

  const load = async () => {
    setLoading(true);
    const [{ data: pData }, { data: iData }] = await Promise.all([
      supabase.from("time_clock_entries").select("*")
        .gte("clock_in_at", weekStart.toISOString())
        .lte("clock_in_at", weekEnd.toISOString())
        .order("clock_in_at", { ascending: false }),
      supabase.from("instructors").select("id,name,hourly_wage"),
    ]);
    setPunches((pData ?? []) as Punch[]);
    setInstructors((iData ?? []) as Instructor[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, [weekStart]);

  const instMap = useMemo(() => Object.fromEntries(instructors.map((i) => [i.id, i])), [instructors]);

  const filtered = punches.filter((p) => filter === "all" || p.status === filter);

  const totals = useMemo(() => {
    const map: Record<string, { hours: number; cost: number; count: number }> = {};
    for (const p of punches) {
      if (!p.clock_out_at) continue;
      const inst = instMap[p.instructor_id];
      const hrs = hours(p);
      const wage = inst?.hourly_wage ?? 0;
      const t = map[p.instructor_id] ||= { hours: 0, cost: 0, count: 0 };
      t.hours += hrs;
      t.cost += hrs * Number(wage);
      t.count += 1;
    }
    return map;
  }, [punches, instMap]);

  const grandHours = Object.values(totals).reduce((s, t) => s + t.hours, 0);
  const grandCost = Object.values(totals).reduce((s, t) => s + t.cost, 0);

  const decide = async (id: string, status: "approved" | "rejected") => {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("time_clock_entries").update({
      status,
      approved_by: u.user?.id ?? null,
      approved_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const startEdit = (p: Punch) => {
    setEditing(p);
    setEditForm({
      clock_in_at: toLocalDT(p.clock_in_at),
      clock_out_at: p.clock_out_at ? toLocalDT(p.clock_out_at) : "",
      break_minutes: p.break_minutes ?? 0,
      notes: p.notes ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("time_clock_entries").update({
      clock_in_at: fromLocalDT(editForm.clock_in_at),
      clock_out_at: editForm.clock_out_at ? fromLocalDT(editForm.clock_out_at) : null,
      break_minutes: editForm.break_minutes,
      notes: editForm.notes || null,
      edited_by: u.user?.id ?? null,
    }).eq("id", editing.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Punch updated");
    setEditing(null);
    load();
  };

  const exportCsv = () => {
    const rows = [["Instructor", "Date", "Clock In", "Clock Out", "Break (min)", "Hours", "Wage", "Cost", "Status", "Notes"]];
    for (const p of punches) {
      const inst = instMap[p.instructor_id];
      const hrs = hours(p);
      const wage = inst?.hourly_wage ?? 0;
      rows.push([
        inst?.name ?? "Unknown",
        format(parseISO(p.clock_in_at), "yyyy-MM-dd"),
        format(parseISO(p.clock_in_at), "HH:mm"),
        p.clock_out_at ? format(parseISO(p.clock_out_at), "HH:mm") : "",
        String(p.break_minutes ?? 0),
        hrs.toFixed(2),
        Number(wage).toFixed(2),
        (hrs * Number(wage)).toFixed(2),
        p.status,
        (p.notes ?? "").replace(/[\r\n,]/g, " "),
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timesheet-${format(weekStart, "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Timesheets</h1>
          <p className="text-sm text-muted-foreground">
            Week of {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>← Prev</Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }))}>This week</Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>Next →</Button>
          <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="w-4 h-4 mr-1" />Export CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total hours (week)</div>
          <div className="text-2xl font-semibold">{grandHours.toFixed(2)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Estimated labor cost</div>
          <div className="text-2xl font-semibold">${grandCost.toFixed(2)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Pending approval</div>
          <div className="text-2xl font-semibold">{punches.filter((p) => p.status === "pending" && p.clock_out_at).length}</div>
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="font-medium mb-3">By instructor</h3>
        <div className="space-y-1 text-sm">
          {Object.entries(totals).map(([id, t]) => {
            const inst = instMap[id];
            return (
              <div key={id} className="flex items-center justify-between border-b last:border-0 py-1">
                <span>{inst?.name ?? "Unknown"} {inst?.hourly_wage == null && <span className="text-xs text-rose-600 ml-2">(no wage set)</span>}</span>
                <span className="text-muted-foreground">{t.hours.toFixed(2)} hrs · ${t.cost.toFixed(2)}</span>
              </div>
            );
          })}
          {Object.keys(totals).length === 0 && <p className="text-muted-foreground text-sm">No punches this week.</p>}
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-medium mb-3">Punches</h3>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing to show.</p>
        ) : (
          <div className="space-y-1">
            {filtered.map((p) => {
              const inst = instMap[p.instructor_id];
              const hrs = hours(p);
              const cost = hrs * Number(inst?.hourly_wage ?? 0);
              return (
                <div key={p.id} className="flex items-center justify-between gap-2 border-b last:border-0 py-2 flex-wrap">
                  <div className="min-w-[180px]">
                    <div className="font-medium text-sm">{inst?.name ?? "Unknown"}</div>
                    <div className="text-xs text-muted-foreground">
                      {format(parseISO(p.clock_in_at), "EEE, MMM d · h:mm a")}
                      {p.clock_out_at ? ` – ${format(parseISO(p.clock_out_at), "h:mm a")}` : " – open"}
                      {p.break_minutes > 0 && ` · ${p.break_minutes}m break`}
                    </div>
                    {p.notes && <div className="text-xs italic mt-1">{p.notes}</div>}
                  </div>
                  <div className="text-right text-sm">
                    <div>{hrs.toFixed(2)} hrs</div>
                    <div className="text-xs text-muted-foreground">${cost.toFixed(2)}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline">{p.status}</Badge>
                    <Button size="sm" variant="ghost" onClick={() => startEdit(p)}><Pencil className="w-3 h-3" /></Button>
                    {p.status !== "approved" && p.clock_out_at && (
                      <Button size="sm" onClick={() => decide(p.id, "approved")}><Check className="w-3 h-3" /></Button>
                    )}
                    {p.status !== "rejected" && (
                      <Button size="sm" variant="outline" onClick={() => decide(p.id, "rejected")}><X className="w-3 h-3" /></Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit punch</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Clock in</Label>
              <Input type="datetime-local" value={editForm.clock_in_at} onChange={(e) => setEditForm({ ...editForm, clock_in_at: e.target.value })} />
            </div>
            <div>
              <Label>Clock out</Label>
              <Input type="datetime-local" value={editForm.clock_out_at} onChange={(e) => setEditForm({ ...editForm, clock_out_at: e.target.value })} />
            </div>
            <div>
              <Label>Break (minutes)</Label>
              <Input type="number" min={0} value={editForm.break_minutes} onChange={(e) => setEditForm({ ...editForm, break_minutes: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

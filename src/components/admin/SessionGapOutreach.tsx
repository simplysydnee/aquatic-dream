import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageSquare, Mail, Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";

interface Period { id: string; name: string; start_date: string; end_date: string; }
interface CapacityRow { swim_level: string; total_capacity: number; enrolled: number; spots_left: number; }
interface GapRow {
  child_name: string;
  child_first: string | null;
  last_level: string | null;
  parent_name: string | null;
  parent_email: string | null;
  parent_phone: string | null;
  source: "session_1" | "lesson_request";
  created_at: string;
}

const ENROLL_URL = "https://aquaticdreamsswim.com/swim-lessons";

const downloadCsv = (filename: string, rows: (string | number)[][]) => {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

export default function SessionGapOutreach() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [fromId, setFromId] = useState<string>("");
  const [toId, setToId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [capacity, setCapacity] = useState<CapacityRow[]>([]);
  const [gap, setGap] = useState<GapRow[]>([]);
  const [toPeriodDates, setToPeriodDates] = useState<{ start: string; end: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [smsTemplate, setSmsTemplate] = useState<string>(
    "Hi! Session 2 at Aquatic Dreams starts {StartDate}. We still have open spots for {FirstNames} — enroll here: " + ENROLL_URL + " Reply STOP to opt out."
  );
  const [sending, setSending] = useState(false);

  useEffect(() => {
    supabase.from("session_periods")
      .select("id, name, start_date, end_date")
      .eq("is_active", true)
      .order("start_date")
      .then(({ data }) => {
        const list = (data || []) as Period[];
        setPeriods(list);
        if (list.length >= 2 && !fromId && !toId) {
          setFromId(list[0].id);
          setToId(list[1].id);
        }
      });
  }, []);

  const runQuery = async () => {
    if (!fromId || !toId) return;
    setLoading(true);
    setSelected(new Set());
    const { data, error } = await supabase.rpc("get_session_gap_outreach", { _from_period: fromId, _to_period: toId });
    setLoading(false);
    if (error) {
      toast({ title: "Failed to load report", description: error.message, variant: "destructive" });
      return;
    }
    const payload = data as any;
    setCapacity((payload?.capacity ?? []) as CapacityRow[]);
    setGap((payload?.gap ?? []) as GapRow[]);
    setToPeriodDates(payload?.to_period_start ? { start: payload.to_period_start, end: payload.to_period_end } : null);
  };

  useEffect(() => { if (fromId && toId) runQuery(); }, [fromId, toId]);

  const rowKey = (r: GapRow, i: number) => `${r.parent_email || ""}|${r.child_first || r.child_name}|${i}`;

  const toggleAll = () => {
    if (selected.size === gap.length) setSelected(new Set());
    else setSelected(new Set(gap.map((r, i) => rowKey(r, i))));
  };

  const selectedRows = useMemo(() => gap.filter((r, i) => selected.has(rowKey(r, i))), [gap, selected]);

  const dedupedByPhone = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const r of selectedRows) {
      const phone = (r.parent_phone || "").trim();
      if (!phone) continue;
      if (!map.has(phone)) map.set(phone, []);
      const name = r.child_first || (r.child_name || "").split(" ")[0];
      if (name && !map.get(phone)!.includes(name)) map.get(phone)!.push(name);
    }
    return map;
  }, [selectedRows]);

  const dedupedByEmail = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const r of selectedRows) {
      const email = (r.parent_email || "").trim().toLowerCase();
      if (!email) continue;
      if (!map.has(email)) map.set(email, []);
      const name = r.child_first || (r.child_name || "").split(" ")[0];
      if (name && !map.get(email)!.includes(name)) map.get(email)!.push(name);
    }
    return map;
  }, [selectedRows]);

  const startDateLabel = toPeriodDates
    ? format(parseISO(toPeriodDates.start), "MMM d")
    : "next session";

  const sendSmsBlast = async () => {
    if (!dedupedByPhone.size) {
      toast({ title: "No phone numbers", description: "Select recipients that have phone numbers.", variant: "destructive" });
      return;
    }
    if (!confirm(`Send SMS to ${dedupedByPhone.size} parent(s)? (Multi-swimmer families receive one text.)`)) return;
    setSending(true);
    const recipients = Array.from(dedupedByPhone.entries()).map(([phone, childNames]) => ({ phone, childNames }));
    const { data, error } = await supabase.functions.invoke("send-bulk-outreach-sms", {
      body: { template: smsTemplate, startDateLabel, recipients, reminderKind: "session_outreach_sms" },
    });
    setSending(false);
    if (error) {
      toast({ title: "SMS blast failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "SMS sent", description: `Sent ${data?.sent ?? 0}, failed ${data?.failed ?? 0}.` });
    }
  };

  const copyEmailList = () => {
    const emails = Array.from(dedupedByEmail.keys()).join(", ");
    navigator.clipboard.writeText(emails);
    toast({
      title: `${dedupedByEmail.size} email(s) copied`,
      description: "Paste into Marketing → New Campaign recipients.",
    });
  };

  const exportCsv = () => {
    const rows: (string | number)[][] = [["Child", "Last level", "Parent", "Email", "Phone", "Source"]];
    gap.forEach((r) => rows.push([r.child_name, r.last_level || "", r.parent_name || "", r.parent_email || "", r.parent_phone || "", r.source]));
    downloadCsv(`session-gap-${new Date().toISOString().slice(0,10)}.csv`, rows);
  };

  const totalOpen = capacity.reduce((s, c) => s + c.spots_left, 0);

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-medium">Session gap outreach</h3>
          <p className="text-xs text-muted-foreground">
            Families in the previous session (or recent lesson request) who haven't enrolled in the next session yet.
            Uses legacy-safe name matching so pre-split records aren't missed.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Previous session</div>
            <Select value={fromId} onValueChange={setFromId}>
              <SelectTrigger className="w-44"><SelectValue placeholder="From" /></SelectTrigger>
              <SelectContent>{periods.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Target session</div>
            <Select value={toId} onValueChange={setToId}>
              <SelectTrigger className="w-44"><SelectValue placeholder="To" /></SelectTrigger>
              <SelectContent>{periods.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {toPeriodDates && (
        <div className="text-sm">
          Target runs <strong>{format(parseISO(toPeriodDates.start), "MMM d")} – {format(parseISO(toPeriodDates.end), "MMM d, yyyy")}</strong>
          {" "}• <span className="text-muted-foreground">{totalOpen} open spot{totalOpen === 1 ? "" : "s"} across all levels</span>
        </div>
      )}

      {/* Capacity by level */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {capacity.map(c => (
          <div key={c.swim_level} className="rounded border p-2">
            <div className="text-xs uppercase text-muted-foreground">{c.swim_level}</div>
            <div className="text-lg font-semibold">
              {c.spots_left} <span className="text-xs font-normal text-muted-foreground">/ {c.total_capacity}</span>
            </div>
            <div className="text-xs text-muted-foreground">{c.enrolled} enrolled</div>
          </div>
        ))}
      </div>

      {/* Gap list */}
      {loading ? (
        <div className="flex justify-center p-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : gap.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nobody in the gap — everyone from Session 1 is enrolled in Session 2. 🎉</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2">
              <Checkbox checked={selected.size === gap.length && gap.length > 0} onCheckedChange={toggleAll} />
              <span>{selected.size} of {gap.length} selected</span>
              <span className="text-muted-foreground">
                • {dedupedByPhone.size} unique phone{dedupedByPhone.size === 1 ? "" : "s"}, {dedupedByEmail.size} unique email{dedupedByEmail.size === 1 ? "" : "s"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={exportCsv}><Download className="w-3 h-3 mr-1" />CSV</Button>
              <Button size="sm" variant="outline" onClick={copyEmailList} disabled={!dedupedByEmail.size}>
                <Mail className="w-3 h-3 mr-1" />Copy emails
              </Button>
              <Button size="sm" onClick={sendSmsBlast} disabled={sending || !dedupedByPhone.size}>
                {sending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <MessageSquare className="w-3 h-3 mr-1" />}
                Send SMS ({dedupedByPhone.size})
              </Button>
            </div>
          </div>

          <div className="border rounded">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b bg-muted/50">
                <tr>
                  <th className="p-2 w-8"></th>
                  <th className="text-left p-2">Child</th>
                  <th className="text-left p-2">Last level</th>
                  <th className="text-left p-2">Parent</th>
                  <th className="text-left p-2">Email</th>
                  <th className="text-left p-2">Phone</th>
                  <th className="text-left p-2">Source</th>
                </tr>
              </thead>
              <tbody>
                {gap.map((r, i) => {
                  const key = rowKey(r, i);
                  const hasSpot = r.last_level && capacity.find(c => c.swim_level === r.last_level && c.spots_left > 0);
                  return (
                    <tr key={key} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-2">
                        <Checkbox
                          checked={selected.has(key)}
                          onCheckedChange={(v) => {
                            const next = new Set(selected);
                            if (v) next.add(key); else next.delete(key);
                            setSelected(next);
                          }}
                        />
                      </td>
                      <td className="p-2">{r.child_name || "—"}</td>
                      <td className="p-2">
                        {r.last_level ? (
                          <Badge variant={hasSpot ? "default" : "secondary"} className="capitalize">{r.last_level}</Badge>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-2">{r.parent_name || "—"}</td>
                      <td className="p-2 text-xs">{r.parent_email || "—"}</td>
                      <td className="p-2 text-xs">{r.parent_phone || "—"}</td>
                      <td className="p-2">
                        <Badge variant="outline" className="text-xs">
                          {r.source === "session_1" ? "Session 1" : "Lesson request"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1">
              SMS template — {"{FirstNames}"} and {"{StartDate}"} are substituted per recipient. Multi-swimmer families get one text.
            </div>
            <Textarea rows={3} value={smsTemplate} onChange={(e) => setSmsTemplate(e.target.value)} />
          </div>
        </>
      )}
    </Card>
  );
}

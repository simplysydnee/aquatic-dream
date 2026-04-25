import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Check, X, Repeat } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

interface PTO {
  id: string;
  instructor_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
}
interface Trade {
  id: string;
  shift_id: string;
  from_instructor_id: string;
  to_instructor_id: string;
  message: string | null;
  status: string;
  created_at: string;
}
interface Instructor { id: string; name: string; }
interface Shift { id: string; shift_date: string; start_time: string; end_time: string; }

const fmtTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hr = ((h + 11) % 12) + 1;
  return `${hr}:${m.toString().padStart(2, "0")} ${period}`;
};

export default function TimeOffAdmin() {
  const [loading, setLoading] = useState(true);
  const [pto, setPto] = useState<PTO[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const [{ data: p }, { data: t }, { data: i }, { data: s }] = await Promise.all([
      supabase.from("time_off_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("shift_trade_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("instructors").select("id,name"),
      supabase.from("shifts").select("id,shift_date,start_time,end_time"),
    ]);
    setPto((p ?? []) as PTO[]);
    setTrades((t ?? []) as Trade[]);
    setInstructors((i ?? []) as Instructor[]);
    setShifts((s ?? []) as Shift[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const instMap = useMemo(() => Object.fromEntries(instructors.map((i) => [i.id, i.name])), [instructors]);
  const shiftMap = useMemo(() => Object.fromEntries(shifts.map((s) => [s.id, s])), [shifts]);

  const decide = async (id: string, status: "approved" | "denied") => {
    const { error } = await supabase.from("time_off_requests").update({
      status,
      admin_notes: notes[id] || null,
      reviewed_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Request ${status}`);
    load();
  };

  const approveTrade = async (id: string) => {
    const { error } = await supabase.rpc("approve_shift_trade", { _trade_id: id });
    if (error) { toast.error(error.message); return; }
    toast.success("Trade approved and shift reassigned");
    load();
  };

  const denyTrade = async (id: string) => {
    const { error } = await supabase.from("shift_trade_requests").update({
      status: "denied",
      reviewed_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  const pendingPto = pto.filter((p) => p.status === "pending");
  const pendingTrades = trades.filter((t) => t.status === "accepted");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold">Time Off & Trades</h2>
        <p className="text-sm text-muted-foreground">Review instructor time-off requests and shift trades.</p>
      </div>

      <Tabs defaultValue="pto">
        <TabsList>
          <TabsTrigger value="pto">Time off {pendingPto.length > 0 && <Badge className="ml-2">{pendingPto.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="trades">Shift trades {pendingTrades.length > 0 && <Badge className="ml-2">{pendingTrades.length}</Badge>}</TabsTrigger>
        </TabsList>

        <TabsContent value="pto" className="space-y-2">
          {pto.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requests yet.</p>
          ) : pto.map((p) => (
            <Card key={p.id} className="p-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-[220px]">
                  <div className="font-medium">{instMap[p.instructor_id] ?? "Unknown"}</div>
                  <div className="text-sm text-muted-foreground">
                    {format(parseISO(p.start_date), "MMM d, yyyy")} – {format(parseISO(p.end_date), "MMM d, yyyy")}
                  </div>
                  {p.reason && <div className="text-xs mt-1">{p.reason}</div>}
                  {p.admin_notes && <div className="text-xs mt-1"><span className="font-medium">Note:</span> {p.admin_notes}</div>}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge variant={p.status === "pending" ? "default" : "outline"}>{p.status}</Badge>
                  {p.status === "pending" && (
                    <>
                      <Textarea
                        placeholder="Notes (optional)"
                        className="w-64"
                        rows={1}
                        value={notes[p.id] ?? ""}
                        onChange={(e) => setNotes({ ...notes, [p.id]: e.target.value })}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => decide(p.id, "approved")}><Check className="w-3 h-3 mr-1" />Approve</Button>
                        <Button size="sm" variant="outline" onClick={() => decide(p.id, "denied")}><X className="w-3 h-3 mr-1" />Deny</Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="trades" className="space-y-2">
          {trades.length === 0 ? (
            <p className="text-sm text-muted-foreground">No trade requests yet.</p>
          ) : trades.map((t) => {
            const sh = shiftMap[t.shift_id];
            return (
              <Card key={t.id} className="p-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-[220px]">
                    <div className="font-medium flex items-center gap-2">
                      {instMap[t.from_instructor_id]} <Repeat className="w-3 h-3" /> {instMap[t.to_instructor_id]}
                    </div>
                    {sh && (
                      <div className="text-sm text-muted-foreground">
                        {format(parseISO(sh.shift_date), "EEE, MMM d")} · {fmtTime(sh.start_time)} – {fmtTime(sh.end_time)}
                      </div>
                    )}
                    {t.message && <div className="text-xs mt-1 italic">"{t.message}"</div>}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge>{t.status}</Badge>
                    {t.status === "accepted" && (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => approveTrade(t.id)}><Check className="w-3 h-3 mr-1" />Approve</Button>
                        <Button size="sm" variant="outline" onClick={() => denyTrade(t.id)}><X className="w-3 h-3 mr-1" />Deny</Button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}

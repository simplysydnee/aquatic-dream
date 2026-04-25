import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Hand, Repeat, Check, X } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

interface Shift {
  id: string;
  instructor_id: string | null;
  position_id: string | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  notes: string | null;
  status: string;
}
interface Position { id: string; name: string; color: string; }
interface Instructor { id: string; name: string; }
interface Trade {
  id: string;
  shift_id: string;
  from_instructor_id: string;
  to_instructor_id: string;
  message: string | null;
  status: string;
  created_at: string;
}

const fmtTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hr = ((h + 11) % 12) + 1;
  return `${hr}:${m.toString().padStart(2, "0")} ${period}`;
};

export default function InstructorOpenShifts() {
  const [loading, setLoading] = useState(true);
  const [instructorId, setInstructorId] = useState<string | null>(null);
  const [openShifts, setOpenShifts] = useState<Shift[]>([]);
  const [myShifts, setMyShifts] = useState<Shift[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);

  const [tradeShift, setTradeShift] = useState<Shift | null>(null);
  const [tradeTo, setTradeTo] = useState<string>("");
  const [tradeMsg, setTradeMsg] = useState("");

  const load = async () => {
    setLoading(true);
    const { data: idData } = await supabase.rpc("current_user_instructor_id");
    const id = idData as unknown as string | null;
    setInstructorId(id);

    const today = format(new Date(), "yyyy-MM-dd");
    const [{ data: openData }, { data: myData }, { data: posData }, { data: instData }, { data: tradeData }] = await Promise.all([
      supabase.from("shifts").select("*").is("instructor_id", null).eq("status","published").gte("shift_date", today).order("shift_date").order("start_time"),
      id ? supabase.from("shifts").select("*").eq("instructor_id", id).gte("shift_date", today).order("shift_date").order("start_time") : Promise.resolve({ data: [] as any }),
      supabase.from("shift_positions").select("*"),
      supabase.from("instructors").select("id,name").eq("is_active", true),
      id ? supabase.from("shift_trade_requests").select("*").or(`from_instructor_id.eq.${id},to_instructor_id.eq.${id}`).order("created_at",{ascending:false}) : Promise.resolve({ data: [] as any }),
    ]);
    setOpenShifts((openData ?? []) as Shift[]);
    setMyShifts((myData ?? []) as Shift[]);
    setPositions((posData ?? []) as Position[]);
    setInstructors((instData ?? []) as Instructor[]);
    setTrades((tradeData ?? []) as Trade[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const posMap = useMemo(() => Object.fromEntries(positions.map((p) => [p.id, p])), [positions]);
  const instMap = useMemo(() => Object.fromEntries(instructors.map((i) => [i.id, i.name])), [instructors]);

  const claim = async (id: string) => {
    const { error } = await supabase.rpc("claim_open_shift", { _shift_id: id });
    if (error) { toast.error(error.message); return; }
    toast.success("Shift claimed!");
    load();
  };

  const proposeTrade = async () => {
    if (!tradeShift || !tradeTo || !instructorId) return;
    const { error } = await supabase.from("shift_trade_requests").insert({
      shift_id: tradeShift.id,
      from_instructor_id: instructorId,
      to_instructor_id: tradeTo,
      message: tradeMsg || null,
      status: "pending",
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Trade request sent");
    setTradeShift(null); setTradeTo(""); setTradeMsg("");
    load();
  };

  const respondTrade = async (id: string, accept: boolean) => {
    const { error } = await supabase.from("shift_trade_requests")
      .update({ status: accept ? "accepted" : "declined", responded_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(accept ? "Accepted — pending admin approval" : "Declined");
    load();
  };

  const cancelTrade = async (id: string) => {
    const { error } = await supabase.from("shift_trade_requests").update({ status: "cancelled" }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  const incoming = trades.filter((t) => t.to_instructor_id === instructorId && t.status === "pending");
  const outgoing = trades.filter((t) => t.from_instructor_id === instructorId && ["pending","accepted"].includes(t.status));
  const history = trades.filter((t) => !incoming.includes(t) && !outgoing.includes(t)).slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold">Open Shifts & Trades</h2>
        <p className="text-sm text-muted-foreground">Claim open shifts (first-come, first-served) or propose a trade with a teammate.</p>
      </div>

      <Card className="p-4">
        <h3 className="font-medium mb-3">Open shifts</h3>
        {openShifts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open shifts right now.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {openShifts.map((s) => {
              const pos = s.position_id ? posMap[s.position_id] : null;
              return (
                <div key={s.id} className="border rounded-md p-3 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">{format(parseISO(s.shift_date), "EEE, MMM d")}</div>
                    <div className="text-xs text-muted-foreground">{fmtTime(s.start_time)} – {fmtTime(s.end_time)}</div>
                    {pos && <Badge className="mt-1" style={{ backgroundColor: pos.color, color: "white" }}>{pos.name}</Badge>}
                    {s.notes && <div className="text-xs mt-1 italic">{s.notes}</div>}
                  </div>
                  <Button size="sm" onClick={() => claim(s.id)}><Hand className="w-3 h-3 mr-1" />Claim</Button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="font-medium mb-3">My upcoming shifts</h3>
        {myShifts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing on your schedule.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {myShifts.map((s) => {
              const pos = s.position_id ? posMap[s.position_id] : null;
              return (
                <div key={s.id} className="border rounded-md p-3 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">{format(parseISO(s.shift_date), "EEE, MMM d")}</div>
                    <div className="text-xs text-muted-foreground">{fmtTime(s.start_time)} – {fmtTime(s.end_time)}</div>
                    {pos && <Badge className="mt-1" style={{ backgroundColor: pos.color, color: "white" }}>{pos.name}</Badge>}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setTradeShift(s)}>
                    <Repeat className="w-3 h-3 mr-1" />Trade
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {incoming.length > 0 && (
        <Card className="p-4 border-amber-300">
          <h3 className="font-medium mb-3">Incoming trade requests</h3>
          <div className="space-y-2">
            {incoming.map((t) => {
              const shift = [...openShifts, ...myShifts].find((s) => s.id === t.shift_id);
              return (
                <div key={t.id} className="border rounded-md p-3 flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <div className="text-sm font-medium">From {instMap[t.from_instructor_id] ?? "Teammate"}</div>
                    {shift && <div className="text-xs text-muted-foreground">{format(parseISO(shift.shift_date), "EEE, MMM d")} · {fmtTime(shift.start_time)} – {fmtTime(shift.end_time)}</div>}
                    {t.message && <div className="text-xs mt-1 italic">"{t.message}"</div>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => respondTrade(t.id, true)}><Check className="w-3 h-3 mr-1" />Accept</Button>
                    <Button size="sm" variant="outline" onClick={() => respondTrade(t.id, false)}><X className="w-3 h-3 mr-1" />Decline</Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {outgoing.length > 0 && (
        <Card className="p-4">
          <h3 className="font-medium mb-3">My pending trade offers</h3>
          <div className="space-y-2">
            {outgoing.map((t) => (
              <div key={t.id} className="border rounded-md p-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm">To {instMap[t.to_instructor_id] ?? "Teammate"}</div>
                  <Badge variant="outline" className="mt-1">{t.status === "accepted" ? "Awaiting admin approval" : "Pending response"}</Badge>
                </div>
                <Button size="sm" variant="ghost" onClick={() => cancelTrade(t.id)}>Cancel</Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {history.length > 0 && (
        <Card className="p-4">
          <h3 className="font-medium mb-3">Recent trade history</h3>
          <div className="space-y-1 text-xs">
            {history.map((t) => (
              <div key={t.id} className="flex justify-between">
                <span>{instMap[t.from_instructor_id]} → {instMap[t.to_instructor_id]}</span>
                <Badge variant="outline">{t.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Dialog open={!!tradeShift} onOpenChange={(o) => !o && setTradeShift(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Propose trade</DialogTitle>
          </DialogHeader>
          {tradeShift && (
            <div className="space-y-3">
              <div className="text-sm">
                {format(parseISO(tradeShift.shift_date), "EEE, MMM d")} · {fmtTime(tradeShift.start_time)} – {fmtTime(tradeShift.end_time)}
              </div>
              <div>
                <Label>Send to</Label>
                <Select value={tradeTo} onValueChange={setTradeTo}>
                  <SelectTrigger><SelectValue placeholder="Pick a teammate" /></SelectTrigger>
                  <SelectContent>
                    {instructors.filter((i) => i.id !== instructorId).map((i) => (
                      <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Message (optional)</Label>
                <Textarea value={tradeMsg} onChange={(e) => setTradeMsg(e.target.value)} rows={2} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTradeShift(null)}>Cancel</Button>
            <Button onClick={proposeTrade} disabled={!tradeTo}>Send request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

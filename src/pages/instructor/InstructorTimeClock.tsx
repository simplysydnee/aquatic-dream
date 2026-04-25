import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Square, Clock } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, formatDistanceStrict } from "date-fns";

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

const formatDuration = (start: string, end: string, breakMin: number) => {
  const ms = new Date(end).getTime() - new Date(start).getTime() - breakMin * 60_000;
  const hrs = Math.max(0, ms / 3_600_000);
  return `${hrs.toFixed(2)} hrs`;
};

export default function InstructorTimeClock() {
  const [loading, setLoading] = useState(true);
  const [instructorId, setInstructorId] = useState<string | null>(null);
  const [open, setOpen] = useState<Punch | null>(null);
  const [history, setHistory] = useState<Punch[]>([]);
  const [breakMin, setBreakMin] = useState(0);
  const [notes, setNotes] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = async () => {
    setLoading(true);
    const { data: idData } = await supabase.rpc("current_user_instructor_id");
    const id = idData as unknown as string | null;
    setInstructorId(id);
    if (!id) { setLoading(false); return; }

    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { data, error } = await supabase
      .from("time_clock_entries")
      .select("*")
      .eq("instructor_id", id)
      .gte("clock_in_at", since)
      .order("clock_in_at", { ascending: false });
    if (error) toast.error(error.message);
    const all = (data ?? []) as Punch[];
    setOpen(all.find((p) => !p.clock_out_at) ?? null);
    setHistory(all.filter((p) => p.clock_out_at));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const clockIn = async () => {
    const { error } = await supabase.rpc("clock_in", { _shift_id: null, _notes: null });
    if (error) { toast.error(error.message); return; }
    toast.success("Clocked in");
    load();
  };

  const clockOut = async () => {
    const { error } = await supabase.rpc("clock_out", { _break_minutes: breakMin, _notes: notes || null });
    if (error) { toast.error(error.message); return; }
    toast.success("Clocked out");
    setBreakMin(0); setNotes("");
    load();
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!instructorId) return <p className="text-sm text-muted-foreground">Your account isn't linked to an instructor profile yet.</p>;

  const liveDuration = open ? ((now - new Date(open.clock_in_at).getTime()) / 3_600_000).toFixed(2) : null;

  const totalApproved = history.filter((p) => p.status === "approved").reduce((sum, p) => {
    if (!p.clock_out_at) return sum;
    const ms = new Date(p.clock_out_at).getTime() - new Date(p.clock_in_at).getTime() - p.break_minutes * 60_000;
    return sum + Math.max(0, ms / 3_600_000);
  }, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold">Time Clock</h2>
        <p className="text-sm text-muted-foreground">Clock in when your shift starts, clock out when you're done.</p>
      </div>

      <Card className={`p-6 ${open ? "border-emerald-400 bg-emerald-50/40" : ""}`}>
        {open ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
              <div>
                <div className="font-medium">Currently clocked in</div>
                <div className="text-xs text-muted-foreground">
                  Since {format(parseISO(open.clock_in_at), "h:mm a")} · {liveDuration} hrs elapsed
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>Break (minutes)</Label>
                <Input type="number" min={0} value={breakMin} onChange={(e) => setBreakMin(Number(e.target.value) || 0)} />
              </div>
              <div className="md:col-span-2">
                <Label>Notes (optional)</Label>
                <Textarea rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
            <Button onClick={clockOut} variant="destructive">
              <Square className="w-4 h-4 mr-1" /> Clock out
            </Button>
          </div>
        ) : (
          <div className="text-center space-y-3">
            <Clock className="w-12 h-12 mx-auto text-muted-foreground" />
            <div className="text-sm text-muted-foreground">You're not clocked in</div>
            <Button onClick={clockIn} size="lg">
              <Play className="w-4 h-4 mr-1" /> Clock in
            </Button>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">Recent punches (30 days)</h3>
          <Badge variant="outline">{totalApproved.toFixed(2)} hrs approved</Badge>
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No punches yet.</p>
        ) : (
          <div className="space-y-1">
            {history.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm border-b last:border-0 py-2">
                <div>
                  <div>{format(parseISO(p.clock_in_at), "EEE, MMM d")}</div>
                  <div className="text-xs text-muted-foreground">
                    {format(parseISO(p.clock_in_at), "h:mm a")} – {p.clock_out_at ? format(parseISO(p.clock_out_at), "h:mm a") : "—"}
                    {p.break_minutes > 0 && ` · ${p.break_minutes}m break`}
                  </div>
                </div>
                <div className="text-right">
                  {p.clock_out_at && <div className="text-sm">{formatDuration(p.clock_in_at, p.clock_out_at, p.break_minutes)}</div>}
                  <Badge variant="outline" className="text-xs mt-1">{p.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

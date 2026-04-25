import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Avail {
  id: string;
  instructor_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  preference: "preferred" | "available" | "unavailable";
  notes: string | null;
}

const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

const PREF_COLORS: Record<string, string> = {
  preferred: "bg-emerald-100 text-emerald-900 border-emerald-300",
  available: "bg-sky-100 text-sky-900 border-sky-300",
  unavailable: "bg-rose-100 text-rose-900 border-rose-300",
};

export default function InstructorAvailability() {
  const [loading, setLoading] = useState(true);
  const [instructorId, setInstructorId] = useState<string | null>(null);
  const [items, setItems] = useState<Avail[]>([]);
  const [day, setDay] = useState<number>(1);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [pref, setPref] = useState<"preferred"|"available"|"unavailable">("available");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: idData } = await supabase.rpc("current_user_instructor_id");
    const id = idData as unknown as string | null;
    setInstructorId(id);
    if (!id) { setLoading(false); return; }
    const { data, error } = await supabase
      .from("instructor_availability")
      .select("*")
      .eq("instructor_id", id)
      .order("day_of_week").order("start_time");
    if (error) toast.error(error.message);
    setItems((data ?? []) as Avail[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!instructorId) return;
    if (start >= end) { toast.error("End time must be after start"); return; }
    setSaving(true);
    const { error } = await supabase.from("instructor_availability").insert({
      instructor_id: instructorId,
      day_of_week: day,
      start_time: start,
      end_time: end,
      preference: pref,
      notes: notes || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Availability saved");
    setNotes("");
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("instructor_availability").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!instructorId) return <p className="text-sm text-muted-foreground">Your account isn't linked to an instructor profile yet.</p>;

  const grouped: Record<number, Avail[]> = {};
  items.forEach((i) => { (grouped[i.day_of_week] ||= []).push(i); });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold">My Availability</h2>
        <p className="text-sm text-muted-foreground">Tell us your weekly availability. Admins use this when scheduling.</p>
      </div>

      <Card className="p-4">
        <h3 className="font-medium mb-3">Add availability</h3>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div>
            <Label>Day</Label>
            <Select value={String(day)} onValueChange={(v) => setDay(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Start</Label>
            <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label>End</Label>
            <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div>
            <Label>Preference</Label>
            <Select value={pref} onValueChange={(v) => setPref(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="preferred">Preferred</SelectItem>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="unavailable">Unavailable</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Notes (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. mornings only" />
          </div>
        </div>
        <Button className="mt-3" onClick={add} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" />Add</>}
        </Button>
      </Card>

      <div className="space-y-3">
        {DAYS.map((d, i) => (
          <Card key={i} className="p-4">
            <h3 className="font-medium mb-2">{d}</h3>
            {(grouped[i] ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">No entries</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {grouped[i].map((a) => (
                  <div key={a.id} className={`px-3 py-1.5 rounded-md border text-xs flex items-center gap-2 ${PREF_COLORS[a.preference]}`}>
                    <span className="font-medium capitalize">{a.preference}</span>
                    <span>{a.start_time.slice(0,5)} – {a.end_time.slice(0,5)}</span>
                    {a.notes && <span className="opacity-75">· {a.notes}</span>}
                    <button onClick={() => remove(a.id)} className="hover:opacity-60"><Trash2 className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

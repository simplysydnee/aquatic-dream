import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Ban } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

interface PTO {
  id: string;
  instructor_id: string;
  start_date: string;
  end_date: string;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
}

const STATUS_VARIANTS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-900",
  denied: "bg-rose-100 text-rose-900",
  cancelled: "bg-muted text-muted-foreground",
};

export default function InstructorTimeOff() {
  const [loading, setLoading] = useState(true);
  const [instructorId, setInstructorId] = useState<string | null>(null);
  const [items, setItems] = useState<PTO[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: idData } = await supabase.rpc("current_user_instructor_id");
    const id = idData as unknown as string | null;
    setInstructorId(id);
    if (!id) { setLoading(false); return; }
    const { data, error } = await supabase
      .from("time_off_requests")
      .select("*")
      .eq("instructor_id", id)
      .order("start_date", { ascending: false });
    if (error) toast.error(error.message);
    setItems((data ?? []) as PTO[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!instructorId || !startDate || !endDate) { toast.error("Pick start and end dates"); return; }
    if (endDate < startDate) { toast.error("End date must be on/after start date"); return; }
    setSaving(true);
    const { error } = await supabase.from("time_off_requests").insert({
      instructor_id: instructorId,
      start_date: startDate,
      end_date: endDate,
      all_day: true,
      reason: reason || null,
      status: "pending",
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Time-off request submitted");
    setStartDate(""); setEndDate(""); setReason("");
    load();
  };

  const cancel = async (id: string) => {
    const { error } = await supabase.from("time_off_requests").update({ status: "cancelled" }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!instructorId) return <p className="text-sm text-muted-foreground">Your account isn't linked to an instructor profile yet.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold">Time Off</h2>
        <p className="text-sm text-muted-foreground">Submit a time-off request for admin approval.</p>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>From</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label>To</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="md:col-span-3">
            <Label>Reason (optional)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          </div>
        </div>
        <Button className="mt-3" onClick={submit} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" />Submit request</>}
        </Button>
      </Card>

      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No time-off requests yet.</p>
        ) : items.map((p) => (
          <Card key={p.id} className="p-3 flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="font-medium text-sm">
                {format(parseISO(p.start_date), "MMM d, yyyy")} – {format(parseISO(p.end_date), "MMM d, yyyy")}
              </div>
              {p.reason && <div className="text-xs text-muted-foreground">{p.reason}</div>}
              {p.admin_notes && <div className="text-xs mt-1"><span className="font-medium">Admin:</span> {p.admin_notes}</div>}
            </div>
            <div className="flex items-center gap-2">
              <Badge className={STATUS_VARIANTS[p.status] ?? ""}>{p.status}</Badge>
              {p.status === "pending" && (
                <Button variant="outline" size="sm" onClick={() => cancel(p.id)}>
                  <Ban className="w-3 h-3 mr-1" /> Cancel
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

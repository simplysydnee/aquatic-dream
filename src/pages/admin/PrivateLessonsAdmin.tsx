import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Instructor { id: string; name: string }
interface Block {
  id: string; instructor_id: string; kind: "weekly" | "date_range";
  day_of_week: number | null; start_date: string | null; end_date: string | null;
  start_time: string; end_time: string; slot_minutes: number; pool_area: string;
  is_blackout: boolean; notes: string | null;
}

export default function PrivateLessonsAdmin() {
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [draft, setDraft] = useState({
    instructor_id: "", kind: "weekly" as "weekly" | "date_range",
    day_of_week: 1, start_date: "", end_date: "",
    start_time: "15:00", end_time: "18:00", slot_minutes: 30,
    pool_area: "shallow", is_blackout: false, notes: "",
  });

  const load = async () => {
    const [{ data: ins }, { data: bks }, { data: bookings }] = await Promise.all([
      supabase.from("instructors").select("id, name").eq("is_active", true).order("name"),
      supabase.from("instructor_booking_blocks").select("*").order("created_at", { ascending: false }),
      supabase.from("lesson_bookings").select("*, lesson_booking_occurrences(id, occurrence_date, status, auto_charge_status, payment_status)")
        .eq("lesson_type", "private").eq("booking_source", "self_serve").order("created_at", { ascending: false }).limit(100),
    ]);
    setInstructors((ins as any[]) || []);
    setBlocks((bks as any[]) || []);
    setBookings((bookings as any[]) || []);
    if (!draft.instructor_id && ins && ins.length) setDraft((d) => ({ ...d, instructor_id: (ins as any[])[0].id }));
  };
  useEffect(() => { load(); }, []);

  const addBlock = async () => {
    if (!draft.instructor_id) return;
    const payload: any = {
      instructor_id: draft.instructor_id, kind: draft.kind,
      start_time: draft.start_time, end_time: draft.end_time,
      slot_minutes: draft.slot_minutes, pool_area: draft.pool_area,
      is_blackout: draft.is_blackout, notes: draft.notes || null,
      day_of_week: draft.kind === "weekly" ? draft.day_of_week : (draft.day_of_week ?? null),
      start_date: draft.kind === "date_range" ? draft.start_date || null : null,
      end_date: draft.kind === "date_range" ? draft.end_date || null : null,
    };
    const { error } = await supabase.from("instructor_booking_blocks").insert(payload);
    if (error) { toast({ title: "Could not add", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Block added" });
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("instructor_booking_blocks").delete().eq("id", id);
    load();
  };

  const instructorName = (id: string) => instructors.find((i) => i.id === id)?.name || "?";

  return (
    <div className="p-4 sm:p-6 max-w-6xl">
      <h1 className="font-display text-2xl font-bold mb-4">Private Lessons</h1>
      <Tabs defaultValue="availability">
        <TabsList>
          <TabsTrigger value="availability">Availability</TabsTrigger>
          <TabsTrigger value="bookings">Bookings ({bookings.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="availability" className="space-y-6 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Add availability block</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-3 gap-3">
              <div>
                <Label>Instructor</Label>
                <Select value={draft.instructor_id} onValueChange={(v) => setDraft({ ...draft, instructor_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Pick instructor" /></SelectTrigger>
                  <SelectContent>{instructors.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Type</Label>
                <Select value={draft.kind} onValueChange={(v: any) => setDraft({ ...draft, kind: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly recurring</SelectItem>
                    <SelectItem value="date_range">Date range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Day of week</Label>
                <Select value={String(draft.day_of_week)} onValueChange={(v) => setDraft({ ...draft, day_of_week: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{WEEKDAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {draft.kind === "date_range" && (
                <>
                  <div><Label>Start date</Label><Input type="date" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} /></div>
                  <div><Label>End date</Label><Input type="date" value={draft.end_date} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} /></div>
                </>
              )}
              <div><Label>Start time</Label><Input type="time" value={draft.start_time} onChange={(e) => setDraft({ ...draft, start_time: e.target.value })} /></div>
              <div><Label>End time</Label><Input type="time" value={draft.end_time} onChange={(e) => setDraft({ ...draft, end_time: e.target.value })} /></div>
              <div><Label>Slot minutes</Label><Input type="number" min={15} step={5} value={draft.slot_minutes} onChange={(e) => setDraft({ ...draft, slot_minutes: Number(e.target.value) })} /></div>
              <div>
                <Label>Pool area</Label>
                <Select value={draft.pool_area} onValueChange={(v) => setDraft({ ...draft, pool_area: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shallow">Shallow</SelectItem>
                    <SelectItem value="deep">Deep</SelectItem>
                    <SelectItem value="full">Full</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={draft.is_blackout} onCheckedChange={(v) => setDraft({ ...draft, is_blackout: v })} />
                <Label>Blackout (block off, not bookable)</Label>
              </div>
              <div className="sm:col-span-3"><Button onClick={addBlock}><Plus className="w-4 h-4 mr-1" />Add block</Button></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Current blocks</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Instructor</TableHead><TableHead>Type</TableHead><TableHead>When</TableHead>
                  <TableHead>Time</TableHead><TableHead>Slot</TableHead><TableHead>Pool</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {blocks.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No availability set</TableCell></TableRow>}
                  {blocks.map((b) => (
                    <TableRow key={b.id} className={b.is_blackout ? "opacity-60" : ""}>
                      <TableCell>{instructorName(b.instructor_id)}</TableCell>
                      <TableCell>{b.is_blackout ? "Blackout" : b.kind === "weekly" ? "Weekly" : "Date range"}</TableCell>
                      <TableCell>
                        {b.kind === "weekly" ? WEEKDAYS[b.day_of_week ?? 0] :
                          `${b.start_date || ""} → ${b.end_date || ""}${b.day_of_week !== null ? ` (${WEEKDAYS[b.day_of_week]})` : ""}`}
                      </TableCell>
                      <TableCell>{b.start_time.slice(0,5)}–{b.end_time.slice(0,5)}</TableCell>
                      <TableCell>{b.slot_minutes}m</TableCell>
                      <TableCell>{b.pool_area}</TableCell>
                      <TableCell><Button variant="ghost" size="icon" onClick={() => remove(b.id)}><Trash2 className="w-4 h-4" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bookings" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Parent</TableHead><TableHead>Swimmer</TableHead><TableHead>Instructor</TableHead>
                  <TableHead>Lessons</TableHead><TableHead>Charged</TableHead><TableHead>Card</TableHead><TableHead>Status</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {bookings.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No online private bookings yet</TableCell></TableRow>}
                  {bookings.map((b) => {
                    const occs = b.lesson_booking_occurrences || [];
                    const paid = occs.filter((o: any) => o.auto_charge_status === "succeeded").length;
                    return (
                      <TableRow key={b.id}>
                        <TableCell>
                          <div className="font-medium">{b.parent_name}</div>
                          <div className="text-xs text-muted-foreground">{b.parent_email}</div>
                        </TableCell>
                        <TableCell>{b.child_name}</TableCell>
                        <TableCell>{b.instructor_name || "—"}</TableCell>
                        <TableCell>{occs.length}</TableCell>
                        <TableCell>{paid} / {occs.length}</TableCell>
                        <TableCell>{b.stripe_payment_method_id ? "On file" : "Pending"}</TableCell>
                        <TableCell>{b.status}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

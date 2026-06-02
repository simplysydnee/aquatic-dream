import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Trash2, Plus, MoreHorizontal, CreditCard, XCircle, Loader2, ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { getStripeEnvironment } from "@/lib/stripe";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SLOT_WINDOW_DAYS = 56; // show ~8 weeks of upcoming slots per block

type UiKind = "weekly" | "date_range" | "one_time";

interface Instructor { id: string; name: string }
interface Block {
  id: string; instructor_id: string; kind: "weekly" | "date_range";
  day_of_week: number | null; start_date: string | null; end_date: string | null;
  start_time: string; end_time: string; slot_minutes: number; pool_area: string;
  is_blackout: boolean; notes: string | null;
  break_start_time: string | null; break_end_time: string | null;
}

function normTime(t: string) { return t.length >= 5 ? t.substring(0, 5) : t; }
function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hr = ((h + 11) % 12) + 1;
  return `${hr}:${String(m).padStart(2, "0")} ${period}`;
}
function fmtDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

interface SlotRow {
  date: string;
  start: string;
  end: string;
  parentBlockId: string;
  instructor_id: string;
  booking?: { booking_id: string; occurrence_id: string; child_name: string; parent_name: string; payment_status: string; auto_charge_status: string; status: string };
  blocked?: { block_id: string };
}

export default function PrivateLessonsAdmin() {
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [allPrivateBookings, setAllPrivateBookings] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<any | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);
  const [detailBooking, setDetailBooking] = useState<any | null>(null);
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());
  const [editingBlock, setEditingBlock] = useState<Block | null>(null);
  const [editDraft, setEditDraft] = useState({
    kind: "weekly" as UiKind,
    day_of_week: 1, start_date: "", end_date: "",
    start_time: "15:00", end_time: "18:00", slot_minutes: 30,
    pool_area: "shallow", is_blackout: false, notes: "",
    has_break: false, break_start_time: "", break_end_time: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [activeSlot, setActiveSlot] = useState<SlotRow | null>(null);
  const [slotBusy, setSlotBusy] = useState(false);
  const [confirmSlotCancel, setConfirmSlotCancel] = useState<SlotRow | null>(null);
  const [draft, setDraft] = useState({
    instructor_id: "", kind: "weekly" as UiKind,
    day_of_week: 1, start_date: "", end_date: "",
    start_time: "15:00", end_time: "18:00", slot_minutes: 30,
    pool_area: "shallow", is_blackout: false, notes: "",
    has_break: false, break_start_time: "", break_end_time: "",
  });

  const load = async () => {
    const [{ data: ins }, { data: bks }, { data: bkg }, { data: allBkg }] = await Promise.all([
      supabase.from("instructors").select("id, name").eq("is_active", true).order("name"),
      supabase.from("instructor_booking_blocks").select("*").order("created_at", { ascending: false }),
      supabase.from("lesson_bookings")
        .select("*, lesson_booking_occurrences(id, occurrence_date, status, auto_charge_status, payment_status, auto_charge_error)")
        .eq("lesson_type", "private")
        .eq("booking_source", "self_serve")
        .neq("status", "pending_card")
        .order("created_at", { ascending: false }).limit(100),
      supabase.from("lesson_bookings")
        .select("id, instructor_id, start_time, parent_name, child_name, status, lesson_booking_occurrences(id, occurrence_date, status, auto_charge_status, payment_status)")
        .eq("lesson_type", "private")
        .neq("status", "pending_card")
        .neq("status", "cancelled"),
    ]);
    setInstructors((ins as any[]) || []);
    setBlocks((bks as any[]) || []);
    setBookings((bkg as any[]) || []);
    setAllPrivateBookings((allBkg as any[]) || []);
    if (!draft.instructor_id && ins && ins.length) setDraft((d) => ({ ...d, instructor_id: (ins as any[])[0].id }));
    if (detailBooking) {
      const updated = (bkg as any[] | null)?.find((x) => x.id === detailBooking.id);
      if (updated) setDetailBooking(updated);
    }
  };
  useEffect(() => { load(); }, []);

  const addBlock = async () => {
    if (!draft.instructor_id) return;
    if (!draft.start_date || (draft.kind !== "one_time" && !draft.end_date)) {
      toast({ title: "Dates required", description: "Please choose the date(s) for this availability.", variant: "destructive" });
      return;
    }
    const endDate = draft.kind === "one_time" ? draft.start_date : draft.end_date;
    if (endDate < draft.start_date) {
      toast({ title: "Invalid range", description: "End date must be on or after start date.", variant: "destructive" });
      return;
    }

    // For weekly recurring blocks, derive day-of-week directly from the start date
    // so admins can't accidentally mismatch the two.
    const derivedDow = draft.start_date
      ? new Date(draft.start_date + "T00:00").getDay()
      : draft.day_of_week;

    if (draft.has_break) {
      if (!draft.break_start_time || !draft.break_end_time) {
        toast({ title: "Break times required", description: "Enter both break start and end, or turn off the break.", variant: "destructive" });
        return;
      }
      if (draft.break_end_time <= draft.break_start_time) {
        toast({ title: "Invalid break", description: "Break end must be after break start.", variant: "destructive" });
        return;
      }
      if (draft.break_start_time < draft.start_time || draft.break_end_time > draft.end_time) {
        toast({ title: "Break outside block", description: "Break must fall within the block start/end times.", variant: "destructive" });
        return;
      }
    }

    const dbKind: "weekly" | "date_range" = draft.kind === "weekly" ? "weekly" : "date_range";
    const payload: any = {
      instructor_id: draft.instructor_id, kind: dbKind,
      start_time: draft.start_time, end_time: draft.end_time,
      slot_minutes: draft.slot_minutes, pool_area: draft.pool_area,
      is_blackout: draft.is_blackout, notes: draft.notes || null,
      day_of_week: draft.kind === "weekly" ? derivedDow : null,
      start_date: draft.start_date,
      end_date: endDate,
      break_start_time: draft.has_break ? draft.break_start_time : null,
      break_end_time: draft.has_break ? draft.break_end_time : null,
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

  const openEdit = (b: Block) => {
    const isOneTime = b.kind === "date_range" && b.start_date && b.start_date === b.end_date && b.day_of_week === null;
    const uiKind: UiKind = b.kind === "weekly" ? "weekly" : isOneTime ? "one_time" : "date_range";
    setEditDraft({
      kind: uiKind,
      day_of_week: b.day_of_week ?? 1,
      start_date: b.start_date || "",
      end_date: b.end_date || "",
      start_time: b.start_time.slice(0, 5),
      end_time: b.end_time.slice(0, 5),
      slot_minutes: b.slot_minutes,
      pool_area: b.pool_area,
      is_blackout: b.is_blackout,
      notes: b.notes || "",
      has_break: !!(b.break_start_time && b.break_end_time),
      break_start_time: b.break_start_time ? b.break_start_time.slice(0, 5) : "",
      break_end_time: b.break_end_time ? b.break_end_time.slice(0, 5) : "",
    });
    setEditingBlock(b);
  };

  const saveEdit = async () => {
    if (!editingBlock) return;
    const d = editDraft;
    if (!d.start_date || (d.kind !== "one_time" && !d.end_date)) {
      toast({ title: "Dates required", variant: "destructive" });
      return;
    }
    const endDate = d.kind === "one_time" ? d.start_date : d.end_date;
    if (endDate < d.start_date) {
      toast({ title: "Invalid range", description: "End date must be on or after start date.", variant: "destructive" });
      return;
    }
    if (d.has_break) {
      if (!d.break_start_time || !d.break_end_time) {
        toast({ title: "Break times required", variant: "destructive" });
        return;
      }
      if (d.break_end_time <= d.break_start_time) {
        toast({ title: "Invalid break", description: "Break end must be after break start.", variant: "destructive" });
        return;
      }
      if (d.break_start_time < d.start_time || d.break_end_time > d.end_time) {
        toast({ title: "Break outside block", variant: "destructive" });
        return;
      }
    }
    const derivedDow = d.kind === "weekly" && d.start_date
      ? new Date(d.start_date + "T00:00").getDay()
      : d.day_of_week;
    const dbKind: "weekly" | "date_range" = d.kind === "weekly" ? "weekly" : "date_range";
    const payload: any = {
      kind: dbKind,
      start_time: d.start_time, end_time: d.end_time,
      slot_minutes: d.slot_minutes, pool_area: d.pool_area,
      is_blackout: d.is_blackout, notes: d.notes || null,
      day_of_week: d.kind === "weekly" ? derivedDow : (d.kind === "one_time" ? null : (editingBlock.day_of_week)),
      start_date: d.start_date,
      end_date: endDate,
      break_start_time: d.has_break ? d.break_start_time : null,
      break_end_time: d.has_break ? d.break_end_time : null,
    };
    setSavingEdit(true);
    const { error } = await supabase.from("instructor_booking_blocks").update(payload).eq("id", editingBlock.id);
    setSavingEdit(false);
    if (error) {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Block updated" });
    setEditingBlock(null);
    load();
  };


  // Map of `${instructor_id}|${date}|${HH:MM}` -> booking info
  const bookingMap = useMemo(() => {
    const m = new Map<string, SlotRow["booking"]>();
    for (const b of allPrivateBookings) {
      if (!b.instructor_id || !b.start_time) continue;
      const t = normTime(b.start_time);
      for (const o of (b.lesson_booking_occurrences || [])) {
        if (o.status === "cancelled") continue;
        m.set(`${b.instructor_id}|${o.occurrence_date}|${t}`, {
          booking_id: b.id,
          occurrence_id: o.id,
          child_name: b.child_name || "—",
          parent_name: b.parent_name || "",
          payment_status: o.payment_status,
          auto_charge_status: o.auto_charge_status,
          status: o.status,
        });
      }
    }
    return m;
  }, [allPrivateBookings]);

  // Find a one-time blackout block that exactly covers a slot
  const findBlackoutForSlot = (instructorId: string, dateStr: string, start: string, end: string) => {
    const dow = new Date(dateStr + "T00:00").getDay();
    return blocks.find((bl) => {
      if (!bl.is_blackout) return false;
      if (bl.instructor_id !== instructorId) return false;
      const inDate = bl.kind === "weekly"
        ? bl.day_of_week === dow && (!bl.start_date || bl.start_date <= dateStr) && (!bl.end_date || bl.end_date >= dateStr)
        : (bl.start_date && bl.start_date <= dateStr) && (bl.end_date && bl.end_date >= dateStr) && (bl.day_of_week === null || bl.day_of_week === dow);
      if (!inDate) return false;
      const bs = normTime(bl.start_time);
      const be = normTime(bl.end_time);
      // overlap
      return bs < end && be > start;
    });
  };

  const computeBlockSlots = (b: Block): SlotRow[] => {
    if (b.is_blackout) return [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const rangeStart = b.start_date && new Date(b.start_date + "T00:00") > today ? new Date(b.start_date + "T00:00") : today;
    const horizon = new Date(today); horizon.setDate(horizon.getDate() + SLOT_WINDOW_DAYS);
    const rangeEnd = b.end_date && new Date(b.end_date + "T00:00") < horizon ? new Date(b.end_date + "T00:00") : horizon;

    const slots: SlotRow[] = [];
    const cursor = new Date(rangeStart);
    while (cursor <= rangeEnd) {
      const dateStr = isoDate(cursor);
      const dow = cursor.getDay();
      let matchesDay = true;
      if (b.kind === "weekly") matchesDay = b.day_of_week === dow;
      else if (b.kind === "date_range" && b.day_of_week !== null) matchesDay = b.day_of_week === dow;
      if (matchesDay) {
        let t = normTime(b.start_time);
        const end = normTime(b.end_time);
        const brkStart = b.break_start_time ? normTime(b.break_start_time) : null;
        const brkEnd = b.break_end_time ? normTime(b.break_end_time) : null;
        while (addMinutes(t, b.slot_minutes) <= end) {
          const slotEnd = addMinutes(t, b.slot_minutes);
          if (brkStart && brkEnd && t < brkEnd && slotEnd > brkStart) {
            t = brkEnd;
            continue;
          }
          const key = `${b.instructor_id}|${dateStr}|${t}`;
          const blackoutBlock = findBlackoutForSlot(b.instructor_id, dateStr, t, slotEnd);
          slots.push({
            date: dateStr,
            start: t,
            end: slotEnd,
            parentBlockId: b.id,
            instructor_id: b.instructor_id,
            booking: bookingMap.get(key),
            blocked: blackoutBlock ? { block_id: blackoutBlock.id } : undefined,
          });
          t = slotEnd;
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return slots;
  };

  const toggleBlockExpanded = (id: string) => {
    setExpandedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const instructorName = (id: string) => instructors.find((i) => i.id === id)?.name || "?";

  const callAdmin = async (body: any, busyKey: string) => {
    setBusy(busyKey);
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-private-booking", { body });
      if (error || (data as any)?.error) {
        throw new Error(error?.message || (data as any)?.error || "Action failed");
      }
      return data;
    } catch (e: any) {
      toast({ title: "Action failed", description: e?.message || "Try again", variant: "destructive" });
      throw e;
    } finally {
      setBusy(null);
    }
  };

  const chargeNow = async (booking: any, occurrence: any) => {
    try {
      const data: any = await callAdmin({
        action: "charge_occurrence",
        booking_id: booking.id,
        occurrence_id: occurrence.id,
        environment: getStripeEnvironment(),
      }, `charge-${occurrence.id}`);
      if (data?.success) toast({ title: "Card charged" });
      else toast({ title: "Charge not completed", description: `Stripe status: ${data?.stripe_status || "unknown"}`, variant: "destructive" });
      await load();
    } catch {}
  };

  const cancelBooking = async (booking: any) => {
    try {
      await callAdmin({ action: "cancel_booking", booking_id: booking.id }, `cancel-${booking.id}`);
      toast({ title: "Booking cancelled" });
      setConfirmCancel(null);
      setDetailBooking(null);
      await load();
    } catch {}
  };

  const deleteBooking = async (booking: any) => {
    try {
      await callAdmin({ action: "delete_booking", booking_id: booking.id }, `delete-${booking.id}`);
      toast({ title: "Booking deleted" });
      setConfirmDelete(null);
      setDetailBooking(null);
      await load();
    } catch {}
  };

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
                <Select value={draft.kind} onValueChange={(v: any) => setDraft({ ...draft, kind: v, start_date: "", end_date: "", day_of_week: 1 })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly recurring</SelectItem>
                    <SelectItem value="date_range">Date range</SelectItem>
                    <SelectItem value="one_time">One-time (single day)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {draft.kind === "weekly" && draft.start_date && (
                <div>
                  <Label>Day of week</Label>
                  <div className="mt-2 px-3 py-2 text-sm rounded-md border border-border bg-muted/40 text-muted-foreground">
                    {WEEKDAYS[new Date(draft.start_date + "T00:00").getDay()]} (auto from start date)
                  </div>
                </div>
              )}

              {draft.kind === "one_time" ? (
                <div>
                  <Label>Date</Label>
                  <Input type="date" required value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value, end_date: e.target.value })} />
                </div>
              ) : (
                <>
                  <div>
                    <Label>Start date</Label>
                    <Input type="date" required value={draft.start_date} onChange={(e) => {
                      const v = e.target.value;
                      setDraft((prev) => ({
                        ...prev,
                        start_date: v,
                        day_of_week: prev.kind === "weekly" && v
                          ? new Date(v + "T00:00").getDay()
                          : prev.day_of_week,
                      }));
                    }} />
                  </div>
                  <div>
                    <Label>End date</Label>
                    <Input type="date" required value={draft.end_date} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} />
                  </div>
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
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={draft.has_break} onCheckedChange={(v) => setDraft({ ...draft, has_break: v })} />
                <Label>Add a break</Label>
              </div>
              {draft.has_break && (
                <>
                  <div>
                    <Label>Break start</Label>
                    <Input type="time" value={draft.break_start_time} onChange={(e) => setDraft({ ...draft, break_start_time: e.target.value })} />
                  </div>
                  <div>
                    <Label>Break end</Label>
                    <Input type="time" value={draft.break_end_time} onChange={(e) => setDraft({ ...draft, break_end_time: e.target.value })} />
                  </div>
                  <div className="sm:col-span-3 -mt-2 text-xs text-muted-foreground">
                    Slots will pause during the break and resume right when it ends.
                  </div>
                </>
              )}
              <div className="sm:col-span-3"><Button onClick={addBlock} disabled={!draft.start_date || (draft.kind !== "one_time" && !draft.end_date)}><Plus className="w-4 h-4 mr-1" />Add block</Button></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Current blocks</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Instructor</TableHead><TableHead>Type</TableHead><TableHead>When</TableHead>
                  <TableHead>Time</TableHead><TableHead>Slot</TableHead><TableHead>Pool</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {blocks.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No availability set</TableCell></TableRow>}
                  {blocks.map((b) => {
                    const isOneTime = b.kind === "date_range" && b.start_date && b.start_date === b.end_date && b.day_of_week === null;
                    const typeLabel = b.is_blackout ? "Blackout" : b.kind === "weekly" ? "Weekly" : isOneTime ? "One-time" : "Date range";
                    const whenLabel = b.kind === "weekly"
                      ? `${WEEKDAYS[b.day_of_week ?? 0]}${b.start_date || b.end_date ? ` (${b.start_date || "…"} → ${b.end_date || "…"})` : ""}`
                      : isOneTime
                        ? fmtDate(b.start_date!)
                        : `${b.start_date || ""} → ${b.end_date || ""}${b.day_of_week !== null ? ` (${WEEKDAYS[b.day_of_week]})` : ""}`;
                    const isExpanded = expandedBlocks.has(b.id);
                    const slots = isExpanded ? computeBlockSlots(b) : [];
                    const booked = slots.filter((s) => s.booking).length;
                    return (
                      <>
                        <TableRow key={b.id} className={b.is_blackout ? "opacity-60" : ""}>
                          <TableCell>
                            {!b.is_blackout && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleBlockExpanded(b.id)} aria-label="Toggle slots">
                                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </Button>
                            )}
                          </TableCell>
                          <TableCell>{instructorName(b.instructor_id)}</TableCell>
                          <TableCell>{typeLabel}</TableCell>
                          <TableCell>{whenLabel}</TableCell>
                          <TableCell>
                            {b.start_time.slice(0,5)}–{b.end_time.slice(0,5)}
                            {b.break_start_time && b.break_end_time && (
                              <div className="text-[10px] text-muted-foreground">Break {b.break_start_time.slice(0,5)}–{b.break_end_time.slice(0,5)}</div>
                            )}
                          </TableCell>
                          <TableCell>{b.slot_minutes}m</TableCell>
                          <TableCell>{b.pool_area}</TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(b)} aria-label="Edit block"><Pencil className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => remove(b.id)} aria-label="Delete block"><Trash2 className="w-4 h-4" /></Button>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow key={b.id + "-slots"} className="bg-muted/30">
                            <TableCell></TableCell>
                            <TableCell colSpan={7} className="py-3">
                              <div className="text-xs text-muted-foreground mb-2">
                                {slots.length === 0
                                  ? "No upcoming slots in this block."
                                  : `${slots.length} slot${slots.length === 1 ? "" : "s"} · ${booked} booked · ${slots.length - booked} open${b.kind === "weekly" ? ` (next ${SLOT_WINDOW_DAYS} days)` : ""}`}
                              </div>
                              {slots.length > 0 && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                                  {slots.map((s) => (
                                    <div
                                      key={`${s.date}-${s.start}`}
                                      className={`flex items-center justify-between rounded border px-2 py-1.5 text-xs ${
                                        s.booking ? "bg-primary/5 border-primary/30" : "bg-background border-border"
                                      }`}
                                    >
                                      <div className="flex flex-col">
                                        <span className="font-medium">{fmtDate(s.date)}</span>
                                        <span className="text-muted-foreground">{fmtTime(s.start)} – {fmtTime(s.end)}</span>
                                      </div>
                                      {s.booking ? (
                                        <div className="flex flex-col items-end gap-0.5">
                                          <Badge variant="default" className="text-[10px]">Booked</Badge>
                                          <span className="text-[11px] font-medium truncate max-w-[140px]">{s.booking.child_name}</span>
                                          <span className="text-[10px] text-muted-foreground capitalize">
                                            {s.booking.auto_charge_status === "succeeded" ? "paid" : (s.booking.payment_status || "unpaid")}
                                          </span>
                                        </div>
                                      ) : (
                                        <Badge variant="outline" className="text-[10px]">Open</Badge>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
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
                  <TableHead>Lessons</TableHead><TableHead>Charged</TableHead><TableHead>Card</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {bookings.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No online private bookings yet</TableCell></TableRow>}
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
                        <TableCell className="capitalize">{b.status}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => setDetailBooking(b)}>
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Booking detail dialog with per-occurrence actions */}
      <Dialog open={!!detailBooking} onOpenChange={(o) => !o && setDetailBooking(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detailBooking?.child_name} · {detailBooking?.parent_name}</DialogTitle>
          </DialogHeader>
          {detailBooking && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {detailBooking.parent_email} · {detailBooking.parent_phone || "no phone"} ·
                Card: {detailBooking.stripe_payment_method_id ? "on file" : "missing"} ·
                Status: <span className="capitalize">{detailBooking.status}</span>
              </div>

              <div className="border border-border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(detailBooking.lesson_booking_occurrences || [])
                      .slice()
                      .sort((a: any, b: any) => a.occurrence_date.localeCompare(b.occurrence_date))
                      .map((o: any) => {
                        const canCharge = o.auto_charge_status !== "succeeded" && o.status !== "cancelled" && detailBooking.stripe_payment_method_id;
                        return (
                          <TableRow key={o.id}>
                            <TableCell>{new Date(o.occurrence_date + "T00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</TableCell>
                            <TableCell className="capitalize">{o.status}</TableCell>
                            <TableCell>
                              <span className="capitalize">{o.auto_charge_status === "succeeded" ? "paid" : o.auto_charge_status}</span>
                              {o.auto_charge_error && <div className="text-xs text-destructive">{o.auto_charge_error}</div>}
                            </TableCell>
                            <TableCell className="text-right">
                              {canCharge && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy === `charge-${o.id}`}
                                  onClick={() => chargeNow(detailBooking, o)}
                                >
                                  {busy === `charge-${o.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <CreditCard className="w-3 h-3 mr-1" />}
                                  Charge $65
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button
                  variant="outline"
                  onClick={() => setConfirmCancel(detailBooking)}
                  disabled={detailBooking.status === "cancelled"}
                >
                  <XCircle className="w-4 h-4 mr-1" /> Cancel booking
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setConfirmDelete(detailBooking)}
                >
                  <Trash2 className="w-4 h-4 mr-1" /> Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit availability block */}
      <Dialog open={!!editingBlock} onOpenChange={(o) => !o && setEditingBlock(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit availability block</DialogTitle>
          </DialogHeader>
          {editingBlock && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2 text-sm text-muted-foreground">
                Instructor: <span className="font-medium text-foreground">{instructorName(editingBlock.instructor_id)}</span>
              </div>
              <div>
                <Label>Type</Label>
                <Select value={editDraft.kind} onValueChange={(v: any) => setEditDraft({ ...editDraft, kind: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly recurring</SelectItem>
                    <SelectItem value="date_range">Date range</SelectItem>
                    <SelectItem value="one_time">One-time (single day)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editDraft.kind === "weekly" && editDraft.start_date && (
                <div>
                  <Label>Day of week</Label>
                  <div className="mt-2 px-3 py-2 text-sm rounded-md border border-border bg-muted/40 text-muted-foreground">
                    {WEEKDAYS[new Date(editDraft.start_date + "T00:00").getDay()]} (auto from start date)
                  </div>
                </div>
              )}
              {editDraft.kind === "one_time" ? (
                <div className="sm:col-span-2">
                  <Label>Date</Label>
                  <Input type="date" value={editDraft.start_date} onChange={(e) => setEditDraft({ ...editDraft, start_date: e.target.value, end_date: e.target.value })} />
                </div>
              ) : (
                <>
                  <div>
                    <Label>Start date</Label>
                    <Input type="date" value={editDraft.start_date} onChange={(e) => setEditDraft({ ...editDraft, start_date: e.target.value })} />
                  </div>
                  <div>
                    <Label>End date</Label>
                    <Input type="date" value={editDraft.end_date} onChange={(e) => setEditDraft({ ...editDraft, end_date: e.target.value })} />
                  </div>
                </>
              )}
              <div><Label>Start time</Label><Input type="time" value={editDraft.start_time} onChange={(e) => setEditDraft({ ...editDraft, start_time: e.target.value })} /></div>
              <div><Label>End time</Label><Input type="time" value={editDraft.end_time} onChange={(e) => setEditDraft({ ...editDraft, end_time: e.target.value })} /></div>
              <div><Label>Slot minutes</Label><Input type="number" min={15} step={5} value={editDraft.slot_minutes} onChange={(e) => setEditDraft({ ...editDraft, slot_minutes: Number(e.target.value) })} /></div>
              <div>
                <Label>Pool area</Label>
                <Select value={editDraft.pool_area} onValueChange={(v) => setEditDraft({ ...editDraft, pool_area: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shallow">Shallow</SelectItem>
                    <SelectItem value="deep">Deep</SelectItem>
                    <SelectItem value="full">Full</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={editDraft.is_blackout} onCheckedChange={(v) => setEditDraft({ ...editDraft, is_blackout: v })} />
                <Label>Blackout</Label>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={editDraft.has_break} onCheckedChange={(v) => setEditDraft({ ...editDraft, has_break: v })} />
                <Label>Add a break</Label>
              </div>
              {editDraft.has_break && (
                <>
                  <div>
                    <Label>Break start</Label>
                    <Input type="time" value={editDraft.break_start_time} onChange={(e) => setEditDraft({ ...editDraft, break_start_time: e.target.value })} />
                  </div>
                  <div>
                    <Label>Break end</Label>
                    <Input type="time" value={editDraft.break_end_time} onChange={(e) => setEditDraft({ ...editDraft, break_end_time: e.target.value })} />
                  </div>
                </>
              )}
              <div className="sm:col-span-2 flex justify-end gap-2 pt-2 border-t border-border">
                <Button variant="outline" onClick={() => setEditingBlock(null)}>Cancel</Button>
                <Button onClick={saveEdit} disabled={savingEdit}>
                  {savingEdit && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                  Save changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>



      <AlertDialog open={!!confirmCancel} onOpenChange={(o) => !o && setConfirmCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              All remaining lessons will be cancelled and no further charges will be made.
              Already-charged lessons are not refunded automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep booking</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmCancel && cancelBooking(confirmCancel)}>
              Cancel booking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this booking permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the booking and all its lesson records. Past charges in Stripe are not refunded.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && deleteBooking(confirmDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

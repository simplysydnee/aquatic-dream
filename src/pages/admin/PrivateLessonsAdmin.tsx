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
import { Trash2, Plus, MoreHorizontal, CreditCard, XCircle, Loader2, ChevronDown, ChevronRight, Pencil, CalendarClock } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { getStripeEnvironment } from "@/lib/stripe";
import { getPrivateLessonPrice, isJunePromoDate } from "@/lib/privateLessonPricing";
import ReschedulePrivateLessonDialog from "@/components/admin/booking/ReschedulePrivateLessonDialog";


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
  default_lesson_type?: string | null;
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
  defaultLessonType: string;
  booking?: { booking_id: string; occurrence_id: string; child_name: string; parent_name: string; payment_status: string; auto_charge_status: string; status: string; lesson_type: string };
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
  const [rescheduleState, setRescheduleState] = useState<{ booking: any; occurrenceId?: string; mode: "one" | "remaining" | "instructor" } | null>(null);

  const [editDraft, setEditDraft] = useState({
    kind: "weekly" as UiKind,
    day_of_week: 1, start_date: "", end_date: "",
    start_time: "15:00", end_time: "18:00", slot_minutes: 30,
    pool_area: "shallow", is_blackout: false, notes: "",
    has_break: false, break_start_time: "", break_end_time: "",
    default_lesson_type: "private",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [activeSlot, setActiveSlot] = useState<SlotRow | null>(null);
  const [slotBusy, setSlotBusy] = useState(false);
  const [confirmSlotCancel, setConfirmSlotCancel] = useState<SlotRow | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [bookingSlot, setBookingSlot] = useState<SlotRow | null>(null);
  const [bookForm, setBookForm] = useState({
    lesson_type: "private" as "private" | "semi_private",
    parent_name: "", parent_email: "", parent_phone: "",
    child_name: "", child_age: "",
    notes: "", recurring: false, series_end: "",
  });
  const [bookBusy, setBookBusy] = useState(false);
  const [draft, setDraft] = useState({
    instructor_id: "", kind: "weekly" as UiKind,
    day_of_week: 1, start_date: "", end_date: "",
    start_time: "15:00", end_time: "18:00", slot_minutes: 30,
    pool_area: "shallow", is_blackout: false, notes: "",
    has_break: false, break_start_time: "", break_end_time: "",
    default_lesson_type: "private",
  });

  const load = async () => {
    const [{ data: ins }, { data: bks }, { data: bkg }, { data: allBkg }] = await Promise.all([
      supabase.from("instructors").select("id, name").eq("is_active", true).order("name"),
      supabase.from("instructor_booking_blocks").select("*").order("created_at", { ascending: false }),
      supabase.from("lesson_bookings")
        .select("*, lesson_booking_occurrences(id, occurrence_date, status, auto_charge_status, payment_status, auto_charge_error)")
        .in("lesson_type", ["private", "semi_private"])
        .neq("status", "pending_card")
        .order("created_at", { ascending: false }).limit(200),
      supabase.from("lesson_bookings")
        .select("id, instructor_id, instructor_name, start_time, parent_name, child_name, status, lesson_type, lesson_booking_occurrences(id, occurrence_date, status, auto_charge_status, payment_status)")
        .in("lesson_type", ["private", "semi_private"])
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
      default_lesson_type: draft.default_lesson_type,
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
      default_lesson_type: b.default_lesson_type || "private",
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
      default_lesson_type: d.default_lesson_type,
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


  // Map of `${instructor_id}|${date}|${HH:MM}` -> booking info.
  // Some admin-created bookings store only instructor_name (instructor_id is null),
  // so we resolve the id via the active instructors list before keying.
  const bookingMap = useMemo(() => {
    const nameToId = new Map<string, string>();
    for (const i of instructors) nameToId.set(i.name.trim().toLowerCase(), i.id);
    const m = new Map<string, SlotRow["booking"]>();
    for (const b of allPrivateBookings) {
      const instructorId: string | null =
        b.instructor_id ||
        (b.instructor_name ? nameToId.get(String(b.instructor_name).trim().toLowerCase()) || null : null);
      if (!instructorId || !b.start_time) continue;
      const t = normTime(b.start_time);
      for (const o of (b.lesson_booking_occurrences || [])) {
        if (o.status === "cancelled") continue;
        m.set(`${instructorId}|${o.occurrence_date}|${t}`, {
          booking_id: b.id,
          occurrence_id: o.id,
          child_name: b.child_name || "—",
          parent_name: b.parent_name || "",
          payment_status: o.payment_status,
          auto_charge_status: o.auto_charge_status,
          status: o.status,
          lesson_type: b.lesson_type || "private",
        });
      }
    }
    return m;
  }, [allPrivateBookings, instructors]);

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
            defaultLessonType: b.default_lesson_type || "private",
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

  const cancelSlotOccurrence = async (slot: SlotRow) => {
    if (!slot.booking) return;
    setSlotBusy(true);
    try {
      const { error } = await supabase
        .from("lesson_booking_occurrences")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancel_reason: "Cancelled by admin",
          auto_charge_status: "skipped",
        })
        .eq("id", slot.booking.occurrence_id);
      if (error) throw error;
      toast({ title: "Lesson cancelled" });
      setConfirmSlotCancel(null);
      setActiveSlot(null);
      await load();
    } catch (e: any) {
      toast({ title: "Could not cancel", description: e?.message, variant: "destructive" });
    } finally {
      setSlotBusy(false);
    }
  };

  const blockSlot = async (slot: SlotRow, opts?: { silent?: boolean; skipReload?: boolean }) => {
    if (!opts?.silent) setSlotBusy(true);
    try {
      // Guard against duplicates: if a matching blackout already exists, treat as success.
      const existing = findBlackoutForSlot(slot.instructor_id, slot.date, slot.start, slot.end);
      if (existing) {
        if (!opts?.silent) {
          toast({ title: "Slot already closed" });
          setActiveSlot(null);
          await load();
        }
        return;
      }
      const parent = blocks.find((b) => b.id === slot.parentBlockId);
      const { error } = await supabase.from("instructor_booking_blocks").insert({
        instructor_id: slot.instructor_id,
        kind: "date_range",
        start_date: slot.date,
        end_date: slot.date,
        day_of_week: null,
        start_time: slot.start,
        end_time: slot.end,
        slot_minutes: parent?.slot_minutes || 30,
        pool_area: parent?.pool_area || "shallow",
        is_blackout: true,
        notes: "Closed from slot grid",
      });
      if (error) throw error;
      if (!opts?.silent) {
        toast({ title: "Slot closed" });
        setActiveSlot(null);
      }
      if (!opts?.skipReload) await load();
    } catch (e: any) {
      toast({ title: "Could not close slot", description: e?.message || "Unknown error", variant: "destructive" });
      throw e;
    } finally {
      if (!opts?.silent) setSlotBusy(false);
    }
  };

  const cancelAndCloseSlot = async (slot: SlotRow) => {
    if (!slot.booking) return;
    setSlotBusy(true);
    try {
      const { error } = await supabase
        .from("lesson_booking_occurrences")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancel_reason: "Cancelled by admin",
          auto_charge_status: "skipped",
        })
        .eq("id", slot.booking.occurrence_id);
      if (error) throw error;
      try {
        await blockSlot(slot, { silent: true, skipReload: true });
      } catch {}
      toast({ title: "Lesson cancelled and slot closed" });
      setConfirmSlotCancel(null);
      setActiveSlot(null);
      await load();
    } catch (e: any) {
      toast({ title: "Could not cancel & close", description: e?.message, variant: "destructive" });
    } finally {
      setSlotBusy(false);
    }
  };

  const unblockSlot = async (slot: SlotRow) => {
    if (!slot.blocked) return;
    setSlotBusy(true);
    try {
      const { error } = await supabase
        .from("instructor_booking_blocks")
        .delete()
        .eq("id", slot.blocked.block_id);
      if (error) throw error;
      toast({ title: "Slot reopened" });
      setActiveSlot(null);
      await load();
    } catch (e: any) {
      toast({ title: "Could not unblock", description: e?.message, variant: "destructive" });
    } finally {
      setSlotBusy(false);
    }
  };

  const { upcomingBookings, pastBookings } = useMemo(() => {
    const todayStr = isoDate(new Date());
    const upcoming: any[] = [];
    const past: any[] = [];
    for (const b of bookings) {
      const occs = b.lesson_booking_occurrences || [];
      const hasFuture = occs.some(
        (o: any) => o.status !== "cancelled" && o.occurrence_date >= todayStr,
      );
      if (hasFuture) upcoming.push(b);
      else past.push(b);
    }
    return { upcomingBookings: upcoming, pastBookings: past };
  }, [bookings]);

  const submitManualBooking = async () => {
    if (!bookingSlot) return;
    if (!bookForm.parent_name || !bookForm.parent_email) {
      toast({ title: "Parent name and email required", variant: "destructive" });
      return;
    }
    setBookBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-private-booking", {
        body: {
          instructor_id: bookingSlot.instructor_id,
          lesson_type: bookForm.lesson_type,
          start_date: bookingSlot.date,
          start_time: bookingSlot.start,
          end_time: bookingSlot.end,
          pool_area: blocks.find((b) => b.id === bookingSlot.parentBlockId)?.pool_area || "shallow",
          parent_name: bookForm.parent_name,
          parent_email: bookForm.parent_email,
          parent_phone: bookForm.parent_phone || null,
          child_name: bookForm.child_name || null,
          child_age: bookForm.child_age ? Number(bookForm.child_age) : null,
          notes: bookForm.notes || null,
          recurring: bookForm.recurring,
          series_end: bookForm.recurring && bookForm.series_end ? bookForm.series_end : null,
        },
      });
      if (error || (data as any)?.error) {
        throw new Error(error?.message || (data as any)?.error || "Failed to create");
      }
      toast({ title: "Lesson booked" });
      setBookingSlot(null);
      setActiveSlot(null);
      setBookForm({
        lesson_type: "private", parent_name: "", parent_email: "", parent_phone: "",
        child_name: "", child_age: "", notes: "", recurring: false, series_end: "",
      });
      await load();
    } catch (e: any) {
      toast({ title: "Could not book", description: e?.message, variant: "destructive" });
    } finally {
      setBookBusy(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="font-display text-2xl font-bold">Private & Semi-Private Lessons</h1>
        <Button onClick={() => (window.location.href = "/admin/private-lessons/new")}>
          <Plus className="w-4 h-4 mr-1" /> Book a lesson
        </Button>
      </div>
      <Tabs defaultValue="availability">
        <TabsList>
          <TabsTrigger value="availability">Availability</TabsTrigger>
          <TabsTrigger value="bookings">Bookings ({upcomingBookings.length})</TabsTrigger>
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
                <Label>Lesson type</Label>
                <Select value={draft.default_lesson_type} onValueChange={(v) => setDraft({ ...draft, default_lesson_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Private ($65)</SelectItem>
                    <SelectItem value="semi_private">Semi-Private ($45)</SelectItem>
                  </SelectContent>
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
                  <TableHead>Instructor</TableHead><TableHead>Lesson</TableHead><TableHead>Type</TableHead><TableHead>When</TableHead>
                  <TableHead>Time</TableHead><TableHead>Slot</TableHead><TableHead>Pool</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {blocks.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">No availability set</TableCell></TableRow>}
                  {blocks.map((b) => {
                    const isOneTime = b.kind === "date_range" && b.start_date && b.start_date === b.end_date && b.day_of_week === null;
                    const typeLabel = b.is_blackout ? "Blackout" : b.kind === "weekly" ? "Weekly" : isOneTime ? "One-time" : "Date range";
                    const lessonTypeLabel = b.default_lesson_type === "semi_private" ? "Semi-Private" : "Private";
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
                          <TableCell>
                            {b.is_blackout
                              ? <Badge variant="secondary" className="text-[10px]">—</Badge>
                              : <Badge variant="outline" className="text-[10px]">{lessonTypeLabel}</Badge>}
                          </TableCell>
                          <TableCell>{typeLabel}</TableCell>
                          <TableCell>{whenLabel}</TableCell>
                          <TableCell>
                            {fmtTime(b.start_time.slice(0,5))} – {fmtTime(b.end_time.slice(0,5))}
                            {b.break_start_time && b.break_end_time && (
                              <div className="text-[10px] text-muted-foreground">Break {fmtTime(b.break_start_time.slice(0,5))} – {fmtTime(b.break_end_time.slice(0,5))}</div>
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
                            <TableCell colSpan={8} className="py-3">
                              <div className="text-xs text-muted-foreground mb-2">
                                {slots.length === 0
                                  ? "No upcoming slots in this block."
                                  : `${slots.length} slot${slots.length === 1 ? "" : "s"} · ${booked} booked · ${slots.length - booked} open${b.kind === "weekly" ? ` (next ${SLOT_WINDOW_DAYS} days)` : ""}`}
                              </div>
                              {slots.length > 0 && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                                  {slots.map((s) => (
                                    <button
                                      key={`${s.date}-${s.start}`}
                                      type="button"
                                      onClick={() => setActiveSlot(s)}
                                      className={`flex items-center justify-between rounded border px-2 py-1.5 text-xs text-left transition-colors hover:ring-1 hover:ring-primary/40 cursor-pointer ${
                                        s.blocked
                                          ? "bg-muted/50 border-border opacity-70"
                                          : s.booking
                                            ? "bg-primary/5 border-primary/30 hover:bg-primary/10"
                                            : "bg-background border-border hover:bg-muted/50"
                                      }`}
                                    >
                                      <div className="flex flex-col">
                                        <span className={`font-medium ${s.blocked ? "line-through" : ""}`}>{fmtDate(s.date)}</span>
                                        <span className="text-muted-foreground">{fmtTime(s.start)} – {fmtTime(s.end)}</span>
                                      </div>
                                      {s.blocked ? (
                                        <Badge variant="secondary" className="text-[10px]">Closed</Badge>
                                      ) : s.booking ? (
                                        <div className="flex flex-col items-end gap-0.5">
                                          <Badge variant="default" className="text-[10px]">
                                            {s.booking.lesson_type === "semi_private" ? "Semi" : "Private"}
                                          </Badge>
                                          <span className="text-[11px] font-medium truncate max-w-[140px]">{s.booking.child_name}</span>
                                          <span className="text-[10px] text-muted-foreground capitalize">
                                            {s.booking.auto_charge_status === "succeeded" ? "paid" : (s.booking.payment_status || "unpaid")}
                                          </span>
                                        </div>
                                      ) : (
                                        <Badge variant="outline" className="text-[10px]">Open · {s.defaultLessonType === "semi_private" ? "Semi" : "Private"}</Badge>
                                      )}
                                    </button>
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

        <TabsContent value="bookings" className="mt-4 space-y-6">
          {(() => {
            const renderTable = (rows: any[], emptyMsg: string) => (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Parent</TableHead><TableHead>Swimmer</TableHead><TableHead>Lesson</TableHead>
                  <TableHead>Instructor</TableHead><TableHead>Lessons</TableHead><TableHead>Charged</TableHead>
                  <TableHead>Card</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {rows.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">{emptyMsg}</TableCell></TableRow>}
                  {rows.map((b) => {
                    const occs = b.lesson_booking_occurrences || [];
                    const paid = occs.filter((o: any) => o.auto_charge_status === "succeeded").length;
                    return (
                      <TableRow key={b.id}>
                        <TableCell>
                          <div className="font-medium">{b.parent_name}</div>
                          <div className="text-xs text-muted-foreground">{b.parent_email}</div>
                        </TableCell>
                        <TableCell>{b.child_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {b.lesson_type === "semi_private" ? "Semi-Private" : "Private"}
                          </Badge>
                        </TableCell>
                        <TableCell>{b.instructor_name || "—"}</TableCell>
                        <TableCell>{occs.length}</TableCell>
                        <TableCell>{paid} / {occs.length}</TableCell>
                        <TableCell>{b.stripe_payment_method_id ? "On file" : b.booking_source === "admin" ? "Manual" : "Pending"}</TableCell>
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
            );
            return (
              <>
                <Card>
                  <CardHeader><CardTitle className="text-base">Upcoming bookings ({upcomingBookings.length})</CardTitle></CardHeader>
                  <CardContent>{renderTable(upcomingBookings, "No upcoming bookings")}</CardContent>
                </Card>
                <Card>
                  <CardHeader className="cursor-pointer" onClick={() => setShowPast((v) => !v)}>
                    <CardTitle className="text-base flex items-center gap-2">
                      {showPast ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      Past bookings ({pastBookings.length})
                    </CardTitle>
                  </CardHeader>
                  {showPast && (
                    <CardContent>{renderTable(pastBookings, "No past bookings")}</CardContent>
                  )}
                </Card>
              </>
            );
          })()}
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
                              <div className="flex justify-end gap-1">
                                {o.status !== "cancelled" && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setRescheduleState({ booking: detailBooking, occurrenceId: o.id, mode: "one" })}
                                    title="Move this lesson to a different open slot"
                                  >
                                    <CalendarClock className="w-3 h-3 mr-1" /> Move
                                  </Button>
                                )}
                                {canCharge && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={busy === `charge-${o.id}`}
                                    onClick={() => chargeNow(detailBooking, o)}
                                  >
                                    {busy === `charge-${o.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <CreditCard className="w-3 h-3 mr-1" />}
                                    Charge ${getPrivateLessonPrice(detailBooking.lesson_type, o.occurrence_date)}
                                  </Button>
                                )}
                              </div>
                            </TableCell>

                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-border">
                <Button
                  variant="outline"
                  onClick={() => setRescheduleState({ booking: detailBooking, mode: "remaining" })}
                  disabled={detailBooking.status === "cancelled"}
                >
                  <CalendarClock className="w-4 h-4 mr-1" /> Reschedule remaining
                </Button>
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
                <Label>Lesson type</Label>
                <Select value={editDraft.default_lesson_type} onValueChange={(v) => setEditDraft({ ...editDraft, default_lesson_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Private ($65)</SelectItem>
                    <SelectItem value="semi_private">Semi-Private ($45)</SelectItem>
                  </SelectContent>
                </Select>
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

      {/* Slot action dialog */}
      <Dialog open={!!activeSlot} onOpenChange={(o) => !o && !slotBusy && setActiveSlot(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {activeSlot && `${fmtDate(activeSlot.date)} · ${fmtTime(activeSlot.start)} – ${fmtTime(activeSlot.end)}`}
            </DialogTitle>
          </DialogHeader>
          {activeSlot && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Instructor: <span className="font-medium text-foreground">{instructorName(activeSlot.instructor_id)}</span>
              </div>

              {activeSlot.booking ? (
                <div className="rounded-md border border-border p-3 text-sm space-y-1">
                  <div className="font-medium">{activeSlot.booking.child_name}</div>
                  <div className="text-muted-foreground">{activeSlot.booking.parent_name}</div>
                  <div className="text-xs capitalize">
                    Payment: {activeSlot.booking.auto_charge_status === "succeeded" ? "paid" : (activeSlot.booking.payment_status || "unpaid")}
                  </div>
                </div>
              ) : activeSlot.blocked ? (
                <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                  This slot is currently closed and not bookable on this date.
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                  This slot is open and available for booking.
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                These actions affect only {fmtDate(activeSlot.date)}. Other dates in any recurring booking are not changed.
              </p>

              <div className="flex flex-col gap-2">
                {activeSlot.booking && (
                  <>
                    <Button
                      variant="destructive"
                      disabled={slotBusy}
                      onClick={() => setConfirmSlotCancel(activeSlot)}
                    >
                      <XCircle className="w-4 h-4 mr-1" /> Cancel this lesson
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={slotBusy}
                      onClick={() => cancelAndCloseSlot(activeSlot)}
                    >
                      {slotBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
                      Cancel & close this slot
                    </Button>
                    <Button
                      variant="outline"
                      disabled={slotBusy}
                      onClick={async () => {
                        const bookingId = activeSlot.booking!.booking_id;
                        const { data, error } = await supabase
                          .from("lesson_bookings")
                          .select("*, lesson_booking_occurrences(id, occurrence_date, status, auto_charge_status, payment_status, auto_charge_error)")
                          .eq("id", bookingId)
                          .maybeSingle();
                        if (error || !data) {
                          toast({ title: "Booking details unavailable", variant: "destructive" });
                          return;
                        }
                        setActiveSlot(null);
                        setDetailBooking(data);
                      }}
                    >
                      Open full booking
                    </Button>
                  </>
                )}
                {!activeSlot.booking && !activeSlot.blocked && (
                  <>
                    <Button
                      variant="default"
                      disabled={slotBusy}
                      onClick={() => {
                        setBookForm((f) => ({
                          ...f,
                          lesson_type: (activeSlot.defaultLessonType === "semi_private" ? "semi_private" : "private"),
                        }));
                        setBookingSlot(activeSlot);
                      }}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Book a lesson here
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={slotBusy}
                      onClick={() => blockSlot(activeSlot)}
                    >
                      {slotBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <XCircle className="w-4 h-4 mr-1" />}
                      Close this slot
                    </Button>
                  </>
                )}
                {activeSlot.blocked && (
                  <Button
                    variant="default"
                    disabled={slotBusy}
                    onClick={() => unblockSlot(activeSlot)}
                  >
                    {slotBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
                    Reopen this slot
                  </Button>
                )}
                <Button variant="ghost" disabled={slotBusy} onClick={() => setActiveSlot(null)}>
                  Dismiss
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmSlotCancel} onOpenChange={(o) => !o && !slotBusy && setConfirmSlotCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this lesson?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmSlotCancel?.booking && (
                <>
                  {confirmSlotCancel.booking.child_name} · {fmtDate(confirmSlotCancel.date)} ·{" "}
                  {fmtTime(confirmSlotCancel.start)} – {fmtTime(confirmSlotCancel.end)}.
                  {" "}This cancels just this one occurrence and skips the auto-charge.
                  Already-charged lessons are not refunded automatically.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={slotBusy}>Keep lesson</AlertDialogCancel>
            <AlertDialogAction
              disabled={slotBusy}
              onClick={() => confirmSlotCancel && cancelSlotOccurrence(confirmSlotCancel)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {slotBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              Cancel lesson
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manual book lesson dialog */}
      <Dialog open={!!bookingSlot} onOpenChange={(o) => !o && !bookBusy && setBookingSlot(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Book a lesson
            </DialogTitle>
          </DialogHeader>
          {bookingSlot && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                {instructorName(bookingSlot.instructor_id)} · {fmtDate(bookingSlot.date)} · {fmtTime(bookingSlot.start)} – {fmtTime(bookingSlot.end)}
              </div>
              <div>
                <Label>Lesson type</Label>
                <Select value={bookForm.lesson_type} onValueChange={(v: any) => setBookForm({ ...bookForm, lesson_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">
                      Private (${getPrivateLessonPrice("private", bookingSlot.date)}{isJunePromoDate(bookingSlot.date) ? " · June Special" : ""})
                    </SelectItem>
                    <SelectItem value="semi_private">Semi-Private ($45)</SelectItem>
                  </SelectContent>
                </Select>
                {bookForm.lesson_type === "private" && isJunePromoDate(bookingSlot.date) && (
                  <p className="text-xs text-coral font-semibold mt-1">June promo — $50 per lesson (normally $65)</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Parent name *</Label>
                  <Input value={bookForm.parent_name} onChange={(e) => setBookForm({ ...bookForm, parent_name: e.target.value })} />
                </div>
                <div>
                  <Label>Parent email *</Label>
                  <Input type="email" value={bookForm.parent_email} onChange={(e) => setBookForm({ ...bookForm, parent_email: e.target.value })} />
                </div>
                <div>
                  <Label>Parent phone</Label>
                  <Input value={bookForm.parent_phone} onChange={(e) => setBookForm({ ...bookForm, parent_phone: e.target.value })} />
                </div>
                <div>
                  <Label>Child name</Label>
                  <Input value={bookForm.child_name} onChange={(e) => setBookForm({ ...bookForm, child_name: e.target.value })} />
                </div>
                <div>
                  <Label>Child age</Label>
                  <Input type="number" min={0} value={bookForm.child_age} onChange={(e) => setBookForm({ ...bookForm, child_age: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Input value={bookForm.notes} onChange={(e) => setBookForm({ ...bookForm, notes: e.target.value })} />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <Switch checked={bookForm.recurring} onCheckedChange={(v) => setBookForm({ ...bookForm, recurring: v })} />
                <Label>Repeat weekly</Label>
              </div>
              {bookForm.recurring && (
                <div>
                  <Label>Repeat until</Label>
                  <Input type="date" value={bookForm.series_end} min={bookingSlot.date} onChange={(e) => setBookForm({ ...bookForm, series_end: e.target.value })} />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                No card is collected — this is a manual booking. You can charge later from the booking detail view if a card is added.
              </p>
              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button variant="outline" disabled={bookBusy} onClick={() => setBookingSlot(null)}>Cancel</Button>
                <Button disabled={bookBusy} onClick={submitManualBooking}>
                  {bookBusy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                  Create booking
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}

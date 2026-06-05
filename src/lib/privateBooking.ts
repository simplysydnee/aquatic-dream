// Helpers to compute open slots from instructor_booking_blocks − existing
// occurrences − pool_events − active slot_holds.
import { supabase } from "@/integrations/supabase/client";

export interface Slot {
  instructor_id: string;
  instructor_name: string;
  slot_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string; // HH:MM
}

interface Block {
  id: string;
  instructor_id: string;
  kind: "weekly" | "date_range";
  day_of_week: number | null;
  start_date: string | null;
  end_date: string | null;
  start_time: string;
  end_time: string;
  slot_minutes: number;
  is_blackout: boolean;
  break_start_time: string | null;
  break_end_time: string | null;
}

interface Instructor { id: string; name: string }

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + mins;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function normTime(t: string): string {
  return t.length >= 5 ? t.substring(0, 5) : t;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function fetchInstructors(): Promise<Instructor[]> {
  const { data } = await supabase.rpc("get_active_instructors_public");
  return ((data as any[]) || []).map((d) => ({ id: d.id, name: d.name }));
}

export async function fetchOpenSlots(opts: {
  fromDate: Date;
  weeks: number;
  instructorIds?: string[];
  sessionToken: string;
}): Promise<Slot[]> {
  const toDate = new Date(opts.fromDate);
  toDate.setDate(toDate.getDate() + opts.weeks * 7);
  const fromIso = isoDate(opts.fromDate);
  const toIso = isoDate(toDate);

  // Fetch instructors via public RPC (id/name only)
  const { data: instData } = await supabase.rpc("get_active_instructors_public");
  const instructors = (instData as Instructor[]) || [];
  const instructorMap = Object.fromEntries(instructors.map((i) => [i.id, i.name]));
  const allowed = new Set(opts.instructorIds && opts.instructorIds.length ? opts.instructorIds : instructors.map((i) => i.id));

  // Fetch blocks
  const { data: blocks } = await supabase.from("instructor_booking_blocks")
    .select("*").in("instructor_id", Array.from(allowed));
  const blocksList = (blocks as Block[]) || [];

  // Fetch existing occurrences in window
  const { data: occs } = await supabase
    .from("lesson_booking_occurrences")
    .select("occurrence_date, lesson_bookings!inner(instructor_id, start_time, end_time)")
    .gte("occurrence_date", fromIso)
    .lte("occurrence_date", toIso)
    .neq("status", "cancelled");
  const takenSet = new Set<string>();
  for (const o of (occs as any[]) || []) {
    const b = o.lesson_bookings;
    if (!b?.instructor_id || !b?.start_time) continue;
    takenSet.add(`${b.instructor_id}|${o.occurrence_date}|${normTime(b.start_time)}`);
  }

  // Active holds (excluding mine)
  const { data: holds } = await supabase.from("slot_holds")
    .select("instructor_id, slot_date, start_time, session_token, held_until")
    .gte("slot_date", fromIso).lte("slot_date", toIso)
    .gt("held_until", new Date().toISOString());
  for (const h of (holds as any[]) || []) {
    if (h.session_token === opts.sessionToken) continue;
    takenSet.add(`${h.instructor_id}|${h.slot_date}|${normTime(h.start_time)}`);
  }

  // Build slots
  const out: Slot[] = [];
  const cursor = new Date(opts.fromDate);
  cursor.setHours(0, 0, 0, 0);
  for (let i = 0; i < opts.weeks * 7; i++) {
    const d = new Date(cursor);
    d.setDate(d.getDate() + i);
    const dateStr = isoDate(d);
    const dow = d.getDay();

    for (const blk of blocksList) {
      if (blk.is_blackout) continue;
      if (blk.kind === "weekly") {
        if (blk.day_of_week !== dow) continue;
        if (blk.start_date && dateStr < blk.start_date) continue;
        if (blk.end_date && dateStr > blk.end_date) continue;
      }
      if (blk.kind === "date_range") {
        if (blk.start_date && dateStr < blk.start_date) continue;
        if (blk.end_date && dateStr > blk.end_date) continue;
        if (blk.day_of_week !== null && blk.day_of_week !== dow) continue;
      }
      // Generate slots
      let t = normTime(blk.start_time);
      const end = normTime(blk.end_time);
      const brkStart = blk.break_start_time ? normTime(blk.break_start_time) : null;
      const brkEnd = blk.break_end_time ? normTime(blk.break_end_time) : null;
      while (addMinutes(t, blk.slot_minutes) <= end) {
        const slotEnd = addMinutes(t, blk.slot_minutes);
        if (brkStart && brkEnd && t < brkEnd && slotEnd > brkStart) {
          t = brkEnd;
          continue;
        }
        const key = `${blk.instructor_id}|${dateStr}|${t}`;
        if (!takenSet.has(key)) {
          out.push({
            instructor_id: blk.instructor_id,
            instructor_name: instructorMap[blk.instructor_id] || "Instructor",
            slot_date: dateStr,
            start_time: t,
            end_time: slotEnd,
          });
        }
        t = slotEnd;
      }
    }
  }

  // Dedupe (multiple blocks could overlap)
  const seen = new Set<string>();
  return out.filter((s) => {
    const k = `${s.instructor_id}|${s.slot_date}|${s.start_time}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function holdSlots(slots: Slot[], sessionToken: string): Promise<void> {
  await supabase.rpc("release_slot_holds", { p_session_token: sessionToken });
  if (!slots.length) return;
  await supabase.from("slot_holds").insert(slots.map((s) => ({
    session_token: sessionToken,
    instructor_id: s.instructor_id,
    slot_date: s.slot_date,
    start_time: s.start_time,
    end_time: s.end_time,
  })));
}

export async function releaseHolds(sessionToken: string): Promise<void> {
  await supabase.rpc("release_slot_holds", { p_session_token: sessionToken });
}


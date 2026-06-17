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

  // Fetch blocks via SECURITY DEFINER RPC (table is not publicly readable)
  const { data: blocks } = await supabase.rpc("get_public_booking_blocks", {
    _instructor_ids: Array.from(allowed),
  });
  const blocksList = (blocks as Block[]) || [];

  // Fetch existing taken occurrences via SECURITY DEFINER RPC.
  // The RPC resolves instructor/start/end overrides server-side, filters
  // cancelled and stale pending_card rows, and is callable by anon —
  // unlike a direct select on lesson_booking_occurrences, which RLS blocks
  // for the public booking page.
  const { data: occs } = await supabase.rpc("get_public_taken_occurrences", {
    p_from_date: fromIso,
    p_to_date: toIso,
  });
  const takenIntervals: { instructor_id: string; date: string; start: number; end: number }[] = [];
  for (const o of (occs as any[]) || []) {
    const startT = normTime(o.start_time || "");
    const endT = normTime(o.end_time || "");
    if (!o.instructor_id || !startT || !endT) continue;
    const [sh, sm] = startT.split(":").map(Number);
    const [eh, em] = endT.split(":").map(Number);
    takenIntervals.push({ instructor_id: o.instructor_id, date: o.occurrence_date, start: sh * 60 + sm, end: eh * 60 + em });
  }


  // Active holds (excluding mine) — via SECURITY DEFINER RPC; slot_holds is not publicly readable.
  const { data: holds } = await supabase.rpc("get_active_slot_holds", {
    p_from_date: fromIso,
    p_to_date: toIso,
    p_session_token: opts.sessionToken ?? null,
  });
  for (const h of (holds as any[]) || []) {
    const t = normTime(h.start_time);
    const [sh, sm] = t.split(":").map(Number);
    takenIntervals.push({ instructor_id: h.instructor_id, date: h.slot_date, start: sh * 60 + sm, end: sh * 60 + sm + 30 });
  }

  // Split availability vs blackout blocks (blackouts subtract from open slots)
  const availabilityBlocks = blocksList.filter((b) => !b.is_blackout);
  const blackoutBlocks = blocksList.filter((b) => b.is_blackout);

  const blockAppliesOnDate = (b: Block, dateStr: string, dow: number): boolean => {
    if (b.kind === "weekly") {
      if (b.day_of_week !== dow) return false;
      if (b.start_date && dateStr < b.start_date) return false;
      if (b.end_date && dateStr > b.end_date) return false;
      return true;
    }
    if (b.kind === "date_range") {
      if (b.start_date && dateStr < b.start_date) return false;
      if (b.end_date && dateStr > b.end_date) return false;
      if (b.day_of_week !== null && b.day_of_week !== dow) return false;
      return true;
    }
    return false;
  };

  // Build slots
  const out: Slot[] = [];
  const cursor = new Date(opts.fromDate);
  cursor.setHours(0, 0, 0, 0);
  for (let i = 0; i < opts.weeks * 7; i++) {
    const d = new Date(cursor);
    d.setDate(d.getDate() + i);
    const dateStr = isoDate(d);
    const dow = d.getDay();

    const blackoutsToday = blackoutBlocks
      .filter((b) => blockAppliesOnDate(b, dateStr, dow))
      .map((b) => {
        const [sh, sm] = normTime(b.start_time).split(":").map(Number);
        const [eh, em] = normTime(b.end_time).split(":").map(Number);
        return { instructor_id: b.instructor_id, start: sh * 60 + sm, end: eh * 60 + em };
      });

    for (const blk of availabilityBlocks) {
      if (!blockAppliesOnDate(blk, dateStr, dow)) continue;
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
        const [th, tm] = t.split(":").map(Number);
        const [eh, em] = slotEnd.split(":").map(Number);
        const sMin = th * 60 + tm;
        const eMin = eh * 60 + em;
        const overlaps = takenIntervals.some((iv) =>
          iv.instructor_id === blk.instructor_id && iv.date === dateStr && sMin < iv.end && eMin > iv.start
        );
        const blackedOut = blackoutsToday.some((bo) =>
          bo.instructor_id === blk.instructor_id && sMin < bo.end && eMin > bo.start
        );
        if (!overlaps && !blackedOut) {
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


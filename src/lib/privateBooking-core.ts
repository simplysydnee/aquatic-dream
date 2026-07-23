// Pure slot-composition helpers for private lesson availability.
// No supabase imports so this module is safe to reuse from server-side
// runtimes (MCP tool handlers) as well as the browser flow.

export interface Slot {
  instructor_id: string;
  instructor_name: string;
  slot_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string; // HH:MM
}

export interface Block {
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

export interface Instructor { id: string; name: string }

export interface TakenOccurrence {
  instructor_id: string | null;
  occurrence_date: string;
  start_time: string | null;
  end_time: string | null;
}

export interface ActiveHold {
  instructor_id: string;
  slot_date: string;
  start_time: string;
}

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

function blockAppliesOnDate(b: Block, dateStr: string, dow: number): boolean {
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
}

export function composeOpenSlots(input: {
  fromDate: Date;
  weeks: number;
  instructors: Instructor[];
  blocks: Block[];
  taken: TakenOccurrence[];
  holds: ActiveHold[];
}): Slot[] {
  const instructorMap = Object.fromEntries(input.instructors.map((i) => [i.id, i.name]));

  const takenIntervals: { instructor_id: string; date: string; start: number; end: number }[] = [];
  for (const o of input.taken) {
    const startT = normTime(o.start_time || "");
    const endT = normTime(o.end_time || "");
    if (!o.instructor_id || !startT || !endT) continue;
    const [sh, sm] = startT.split(":").map(Number);
    const [eh, em] = endT.split(":").map(Number);
    takenIntervals.push({ instructor_id: o.instructor_id, date: o.occurrence_date, start: sh * 60 + sm, end: eh * 60 + em });
  }
  for (const h of input.holds) {
    const t = normTime(h.start_time);
    const [sh, sm] = t.split(":").map(Number);
    takenIntervals.push({ instructor_id: h.instructor_id, date: h.slot_date, start: sh * 60 + sm, end: sh * 60 + sm + 30 });
  }

  const availabilityBlocks = input.blocks.filter((b) => !b.is_blackout);
  const blackoutBlocks = input.blocks.filter((b) => b.is_blackout);

  const out: Slot[] = [];
  const cursor = new Date(input.fromDate);
  cursor.setHours(0, 0, 0, 0);
  for (let i = 0; i < input.weeks * 7; i++) {
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

  const seen = new Set<string>();
  return out.filter((s) => {
    const k = `${s.instructor_id}|${s.slot_date}|${s.start_time}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Helpers to compute open slots from instructor_booking_blocks − existing
// occurrences − pool_events − active slot_holds.
import { supabase } from "@/integrations/supabase/client";
import { composeOpenSlots, type Slot, type Block } from "./privateBooking-core";

export type { Slot } from "./privateBooking-core";

interface Instructor { id: string; name: string }

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

  const { data: instData } = await supabase.rpc("get_active_instructors_public");
  const instructors = (instData as Instructor[]) || [];
  const allowed = new Set(opts.instructorIds && opts.instructorIds.length ? opts.instructorIds : instructors.map((i) => i.id));

  const { data: blocks } = await supabase.rpc("get_public_booking_blocks", {
    _instructor_ids: Array.from(allowed),
  });
  const { data: occs } = await supabase.rpc("get_public_taken_occurrences", {
    p_from_date: fromIso,
    p_to_date: toIso,
  });
  const { data: holds } = await supabase.rpc("get_active_slot_holds", {
    p_from_date: fromIso,
    p_to_date: toIso,
    p_session_token: opts.sessionToken ?? null,
  });

  return composeOpenSlots({
    fromDate: opts.fromDate,
    weeks: opts.weeks,
    instructors: instructors.filter((i) => allowed.has(i.id)),
    blocks: (blocks as Block[]) || [],
    taken: (occs as any[]) || [],
    holds: (holds as any[]) || [],
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


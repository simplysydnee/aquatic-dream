import { supabase } from "@/integrations/supabase/client";

export type StudioClosure = {
  id: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  label: string;
  closure_type: "planned" | "unplanned";
};

const LONG = { weekday: "long", month: "long", day: "numeric", year: "numeric" } as const;
const NO_WEEKDAY = { month: "long", day: "numeric", year: "numeric" } as const;

function fmt(dateStr: string, opts: Intl.DateTimeFormatOptions) {
  // Force noon Pacific to avoid TZ off-by-one on date-only strings.
  const d = new Date(`${dateStr}T12:00:00-08:00`);
  return d.toLocaleDateString("en-US", opts);
}

export function formatClosureLine(c: StudioClosure): string {
  if (c.start_date === c.end_date) {
    return `${c.label} — ${fmt(c.start_date, LONG)}`;
  }
  return `${c.label} — ${fmt(c.start_date, NO_WEEKDAY)} – ${fmt(c.end_date, NO_WEEKDAY)}`;
}

export function formatClosureSchedule(closures: StudioClosure[]): string {
  if (!closures || closures.length === 0) return "None posted yet.";
  return closures.map(formatClosureLine).join("\n");
}

export async function fetchUpcomingClosures(): Promise<StudioClosure[]> {
  const { data, error } = await supabase.rpc("get_upcoming_closures");
  if (error) {
    console.error("[closureSchedule] rpc failed", error.message);
    return [];
  }
  return (data ?? []) as StudioClosure[];
}

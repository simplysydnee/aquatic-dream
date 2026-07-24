import { createClient } from "npm:@supabase/supabase-js@2";

export type StudioClosure = {
  id: string;
  start_date: string;
  end_date: string;
  label: string;
  closure_type: "planned" | "unplanned";
};

const LONG: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric", year: "numeric" };
const NO_WEEKDAY: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", year: "numeric" };

function fmt(dateStr: string, opts: Intl.DateTimeFormatOptions) {
  const d = new Date(`${dateStr}T12:00:00-08:00`);
  return d.toLocaleDateString("en-US", opts);
}

export function formatClosureLine(c: StudioClosure): string {
  if (c.start_date === c.end_date) return `${c.label} — ${fmt(c.start_date, LONG)}`;
  return `${c.label} — ${fmt(c.start_date, NO_WEEKDAY)} – ${fmt(c.end_date, NO_WEEKDAY)}`;
}

export function formatClosureSchedule(closures: StudioClosure[]): string {
  if (!closures?.length) return "None posted yet.";
  return closures.map(formatClosureLine).join("\n");
}

export async function fetchClosureSchedule(): Promise<{ closures: StudioClosure[]; text: string }> {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, key);
  const { data, error } = await supabase.rpc("get_upcoming_closures");
  if (error) {
    console.error("[closure-schedule] rpc failed", error.message);
    return { closures: [], text: "None posted yet." };
  }
  const closures = (data ?? []) as StudioClosure[];
  return { closures, text: formatClosureSchedule(closures) };
}

export async function fetchClosureDateSet(): Promise<Set<string>> {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from("studio_closures")
    .select("start_date, end_date");
  if (error) {
    console.error("[closure-schedule] date set fetch failed", error.message);
    return new Set();
  }
  const out = new Set<string>();
  for (const row of (data ?? []) as { start_date: string; end_date: string }[]) {
    const start = new Date(`${row.start_date}T00:00:00Z`);
    const end = new Date(`${row.end_date}T00:00:00Z`);
    for (let d = start.getTime(); d <= end.getTime(); d += 86400000) {
      out.add(new Date(d).toISOString().slice(0, 10));
    }
  }
  return out;
}

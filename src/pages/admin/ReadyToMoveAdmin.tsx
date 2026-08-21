import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import LevelBadge from "@/components/LevelBadge";
import { LEVEL_GROUP_NAMES, type SwimLevel } from "@/components/swim-enrollment/types";
import { Info, Loader2, Waves } from "lucide-react";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface MembershipRow {
  id: string;
  status: string;
  swimmers: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    current_level: string | null;
  } | null;
  standing_slots: {
    id: string;
    swim_level: string | null;
    day_of_week: number | null;
    start_time: string | null;
    instructors: { name: string | null } | null;
  } | null;
}

interface ReadyRow {
  membershipId: string;
  swimmerName: string;
  currentLevel: SwimLevel;
  slotLevel: SwimLevel;
  day: string;
  time: string;
  instructor: string;
  sinceIso: string | null;
  daysAtLevel: number | null;
}

const formatTime = (value?: string | null) => {
  if (!value) return "Time not set";
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h)) return value;
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m ?? 0).padStart(2, "0")} ${suffix}`;
};

const isSwimLevel = (value: string | null | undefined): value is SwimLevel =>
  value === "white" || value === "red" || value === "yellow" || value === "blue" || value === "green";

const ReadyToMoveAdmin = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["ready-to-move"],
    queryFn: async (): Promise<ReadyRow[]> => {
      // Small Group only. Private and adult slots carry swim_level NULL by
      // design, so they must never appear here.
      const { data: memberships, error: membershipError } = await supabase
        .from("memberships")
        .select(
          `id, status,
           swimmers:swimmers!memberships_swimmer_id_fkey ( id, first_name, last_name, current_level ),
           standing_slots:standing_slots!memberships_standing_slot_id_fkey (
             id, swim_level, day_of_week, start_time,
             instructors:instructors!standing_slots_instructor_id_fkey ( name )
           )`
        )
        .eq("plan_key", "kid_group")
        .in("status", ["active", "pending_cancel", "paused"])
        .not("swimmer_id", "is", null)
        .not("standing_slot_id", "is", null);

      if (membershipError) throw membershipError;

      const rows = (memberships ?? []) as unknown as MembershipRow[];

      // Both NOT NULL guards plus the "they differ" comparison.
      const mismatched = rows.filter((row) => {
        const current = row.swimmers?.current_level ?? null;
        const slotLevel = row.standing_slots?.swim_level ?? null;
        return current !== null && slotLevel !== null && current !== slotLevel;
      });

      if (mismatched.length === 0) return [];

      const swimmerIds = Array.from(
        new Set(mismatched.map((row) => row.swimmers?.id).filter(Boolean) as string[])
      );

      const { data: history, error: historyError } = await supabase
        .from("swimmer_level_history")
        .select("swimmer_id, to_level, created_at")
        .in("swimmer_id", swimmerIds)
        .order("created_at", { ascending: false });

      if (historyError) throw historyError;

      // Newest history row for the level the swimmer is on right now.
      const sinceBySwimmer = new Map<string, string>();
      for (const h of history ?? []) {
        const key = `${h.swimmer_id}:${h.to_level}`;
        if (!sinceBySwimmer.has(key)) sinceBySwimmer.set(key, h.created_at as string);
      }

      const now = Date.now();

      const built: ReadyRow[] = mismatched
        .filter(
          (row) =>
            isSwimLevel(row.swimmers?.current_level) && isSwimLevel(row.standing_slots?.swim_level)
        )
        .map((row) => {
          const swimmer = row.swimmers!;
          const slot = row.standing_slots!;
          const sinceIso = sinceBySwimmer.get(`${swimmer.id}:${swimmer.current_level}`) ?? null;
          return {
            membershipId: row.id,
            swimmerName: [swimmer.first_name, swimmer.last_name].filter(Boolean).join(" ").trim(),
            currentLevel: swimmer.current_level as SwimLevel,
            slotLevel: slot.swim_level as SwimLevel,
            day: slot.day_of_week === null ? "Day not set" : DAY_NAMES[slot.day_of_week] ?? "Day not set",
            time: formatTime(slot.start_time),
            instructor: slot.instructors?.name || "Unassigned",
            sinceIso,
            daysAtLevel: sinceIso
              ? Math.max(0, Math.floor((now - new Date(sinceIso).getTime()) / 86400000))
              : null,
          };
        });

      // Longest waiting first. Unknown start dates sort last.
      built.sort((a, b) => (b.daysAtLevel ?? -1) - (a.daysAtLevel ?? -1));
      return built;
    },
  });

  const rows = data ?? [];

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="font-display text-2xl font-semibold text-foreground">Ready to move</h2>
        <p className="text-sm text-muted-foreground">
          Small Group swimmers whose level no longer matches the class time they sit in. This list is
          informational.
        </p>
      </header>

      <div className="flex items-start gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Moving a swimmer is done from Admin &gt; Memberships, not here. That flow regenerates the
          lesson schedule, so a shortcut on this page would leave the calendar out of sync.
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading swimmers
        </div>
      )}

      {error && <p className="text-sm text-destructive">We could not load this list. Try again.</p>}

      {!isLoading && !error && rows.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <Waves className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="text-base font-medium text-foreground">
              Nobody is waiting for a new class time.
            </p>
            <p className="text-sm text-muted-foreground">
              Every Small Group swimmer is in a class that matches their level.
            </p>
          </CardContent>
        </Card>
      )}

      {rows.length > 0 && (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Swimmer</th>
                <th className="px-3 py-2 font-medium">Current level</th>
                <th className="px-3 py-2 font-medium">Class level</th>
                <th className="px-3 py-2 font-medium">Class time</th>
                <th className="px-3 py-2 font-medium">Instructor</th>
                <th className="px-3 py-2 font-medium">Time at level</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.membershipId} className="border-t align-middle">
                  <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">
                    {row.swimmerName}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      <LevelBadge level={row.currentLevel} size={24} />
                      {LEVEL_GROUP_NAMES[row.currentLevel]}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Badge variant="outline">{LEVEL_GROUP_NAMES[row.slotLevel]}</Badge>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {row.day} {row.time}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.instructor}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {row.daysAtLevel === null ? "Not recorded" : `${row.daysAtLevel} days`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ReadyToMoveAdmin;

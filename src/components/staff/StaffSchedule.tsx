import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import LevelBadge from "@/components/LevelBadge";
import { LEVEL_GROUP_NAMES, type SwimLevel } from "@/components/swim-enrollment/types";
import { formatDateLabel, formatTime, programLabel, shiftDate, todayPacific } from "@/lib/staffDate";
import { isSupervisor, type StaffSession } from "./staffTypes";

interface ScheduleRow {
  occurrence_id: string;
  start_time: string;
  end_time: string | null;
  status: string;
  cancel_reason: string | null;
  swimmer_id: string | null;
  swimmer_first: string | null;
  swimmer_last: string | null;
  plan_key: string | null;
  current_level: string | null;
  has_medical: boolean;
  needs_review: boolean;
}

interface InstructorOption {
  instructor_id: string;
  instructor_name: string;
  lesson_count: number;
}

interface StaffScheduleProps {
  session: StaffSession;
}

const isSwimLevel = (value: string | null): value is SwimLevel =>
  value === "white" || value === "red" || value === "yellow" || value === "blue" || value === "green";

/** Screen 2: the day's lessons for one instructor. */
export const StaffSchedule = ({ session }: StaffScheduleProps) => {
  const [date, setDate] = useState(todayPacific());
  const [viewInstructorId, setViewInstructorId] = useState(session.instructorId);
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [instructors, setInstructors] = useState<InstructorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canSwitch = isSupervisor(session.role);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const { data, error: rpcError } = await supabase.rpc("staff_schedule", {
        p_instructor_id: viewInstructorId,
        p_date: date,
      });
      if (!active) return;
      setError(rpcError ? rpcError.message : null);
      setRows(rpcError ? [] : ((data ?? []) as ScheduleRow[]));
      setLoading(false);
    };
    void load();
    return () => {
      active = false;
    };
  }, [viewInstructorId, date]);

  useEffect(() => {
    if (!canSwitch) return;
    let active = true;
    void supabase
      .rpc("staff_instructors_for_date", { p_date: date })
      .then(({ data }) => {
        if (active) setInstructors((data ?? []) as InstructorOption[]);
      });
    return () => {
      active = false;
    };
  }, [canSwitch, date]);

  const viewingName = useMemo(() => {
    if (viewInstructorId === session.instructorId) return session.instructorName;
    return (
      instructors.find((i) => i.instructor_id === viewInstructorId)?.instructor_name ?? "Instructor"
    );
  }, [viewInstructorId, instructors, session]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          className="h-12 w-12"
          aria-label="Previous day"
          onClick={() => setDate((d) => shiftDate(d, -1))}
        >
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <div className="min-w-[12rem] text-center">
          <p className="text-xl font-semibold text-foreground">{formatDateLabel(date)}</p>
          {date !== todayPacific() && (
            <button
              type="button"
              className="text-sm font-medium text-primary underline"
              onClick={() => setDate(todayPacific())}
            >
              Back to today
            </button>
          )}
        </div>
        <Button
          variant="outline"
          size="icon"
          className="h-12 w-12"
          aria-label="Next day"
          onClick={() => setDate((d) => shiftDate(d, 1))}
        >
          <ChevronRight className="h-6 w-6" />
        </Button>

        {canSwitch && (
          <Select value={viewInstructorId} onValueChange={setViewInstructorId}>
            <SelectTrigger className="h-12 w-full text-base sm:w-64">
              <SelectValue placeholder="View instructor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={session.instructorId}>
                {session.instructorName} (me)
              </SelectItem>
              {instructors
                .filter((i) => i.instructor_id !== session.instructorId)
                .map((i) => (
                  <SelectItem key={i.instructor_id} value={i.instructor_id}>
                    {i.instructor_name} ({i.lesson_count})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <p className="text-base text-muted-foreground">Schedule for {viewingName}</p>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5 p-5 text-base text-destructive">
          {error}
        </Card>
      )}

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : rows.length === 0 && !error ? (
        <Card className="p-10 text-center text-xl text-muted-foreground">
          No lessons scheduled for this date.
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <ScheduleRowCard key={row.occurrence_id} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
};

const ScheduleRowCard = ({ row }: { row: ScheduleRow }) => {
  const inactive = row.status !== "scheduled";
  const tappable = !inactive && !row.needs_review;
  const level = isSwimLevel(row.current_level) ? row.current_level : null;
  const name = row.needs_review
    ? "Unmatched swimmer"
    : [row.swimmer_first, row.swimmer_last].filter(Boolean).join(" ") || "Swimmer";

  return (
    <li>
      <div
        className={[
          "flex flex-wrap items-center gap-4 rounded-2xl border-2 p-5",
          inactive ? "border-border bg-muted/50 opacity-60" : "border-border bg-card",
          tappable ? "cursor-pointer hover:border-primary" : "",
        ].join(" ")}
      >
        <div className="w-24 shrink-0 text-xl font-bold text-foreground">
          {formatTime(row.start_time)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-semibold text-foreground">{name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-base text-muted-foreground">
            <span>{programLabel(row.plan_key)}</span>
            {inactive && (
              <span className="rounded-full bg-muted px-3 py-0.5 text-sm font-medium">
                {row.cancel_reason || row.status}
              </span>
            )}
            {row.has_medical && (
              <span className="rounded-full bg-destructive/10 px-3 py-0.5 text-sm font-semibold text-destructive">
                Medical
              </span>
            )}
            {row.needs_review && (
              <span className="rounded-full bg-amber-100 px-3 py-0.5 text-sm font-semibold text-amber-800">
                Needs review
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {level ? (
            <>
              <LevelBadge level={level} size={44} />
              <span className="text-base font-medium text-foreground">
                {LEVEL_GROUP_NAMES[level]}
              </span>
            </>
          ) : (
            !row.needs_review && (
              <span className="rounded-full border-2 border-dashed border-primary/50 px-4 py-2 text-base font-medium text-primary">
                Set level
              </span>
            )
          )}
        </div>
      </div>
    </li>
  );
};

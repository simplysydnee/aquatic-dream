import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import LevelBadge from "@/components/LevelBadge";
import { LEVEL_GROUP_NAMES, type SwimLevel } from "@/components/swim-enrollment/types";
import { formatDateLabel, formatTimeLabel, shiftDate, todayPacific } from "@/lib/staffDate";
import {
  PLAN_LABELS,
  isNotAuthorized,
  type StaffInstructorForDate,
  type StaffScheduleRow,
  type StaffSession,
} from "./staffTypes";

interface Props {
  session: StaffSession;
  onOpenSwimmer: (row: StaffScheduleRow) => void;
}

export function StaffSchedule({ session, onOpenSwimmer }: Props) {
  const [date, setDate] = useState<string>(todayPacific());
  const [viewInstructorId, setViewInstructorId] = useState<string>(session.instructorId);
  const [rows, setRows] = useState<StaffScheduleRow[]>([]);
  const [instructors, setInstructors] = useState<StaffInstructorForDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [notAuthorized, setNotAuthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSwitchInstructor = session.role === "supervisor" || session.role === "admin";

  useEffect(() => {
    if (!canSwitchInstructor) return;
    let cancelled = false;
    void supabase
      .rpc("staff_instructors_for_date", { p_date: date })
      .then(({ data, error: rpcError }) => {
        if (cancelled) return;
        if (isNotAuthorized(rpcError?.message)) {
          setNotAuthorized(true);
          return;
        }
        setInstructors((data ?? []) as StaffInstructorForDate[]);
      });
    return () => {
      cancelled = true;
    };
  }, [date, canSwitchInstructor]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      const { data, error: rpcError } = await supabase.rpc("staff_schedule", {
        p_instructor_id: viewInstructorId,
        p_date: date,
      });
      if (cancelled) return;
      if (isNotAuthorized(rpcError?.message)) {
        setNotAuthorized(true);
        setLoading(false);
        return;
      }
      if (rpcError) setError(rpcError.message);
      setRows(((data ?? []) as StaffScheduleRow[]).slice().sort((a, b) => a.start_time.localeCompare(b.start_time)));
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [viewInstructorId, date]);

  const viewingName = useMemo(() => {
    if (viewInstructorId === session.instructorId) return session.instructorName;
    return instructors.find((i) => i.instructor_id === viewInstructorId)?.instructor_name ?? "";
  }, [viewInstructorId, instructors, session]);

  if (notAuthorized) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <h1 className="text-2xl font-semibold">Staff mode is not set up on this device.</h1>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" className="h-14 w-14" onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day">
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <div className="flex-1 min-w-[12rem]">
          <Input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="h-14 text-lg"
            aria-label="Schedule date"
          />
        </div>
        <Button variant="outline" className="h-14 w-14" onClick={() => setDate(shiftDate(date, 1))} aria-label="Next day">
          <ChevronRight className="h-6 w-6" />
        </Button>
        <Button variant="secondary" className="h-14 px-5 text-base" onClick={() => setDate(todayPacific())}>
          Today
        </Button>
      </div>

      {canSwitchInstructor && (
        <div className="mt-4">
          <Select value={viewInstructorId} onValueChange={setViewInstructorId}>
            <SelectTrigger className="h-14 text-lg">
              <SelectValue placeholder="Select instructor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={session.instructorId}>{session.instructorName} (me)</SelectItem>
              {instructors
                .filter((i) => i.instructor_id !== session.instructorId)
                .map((i) => (
                  <SelectItem key={i.instructor_id} value={i.instructor_id}>
                    {i.instructor_name} · {i.lesson_count}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <h2 className="mt-5 text-xl font-semibold">
        {formatDateLabel(date)}
        {viewingName ? ` · ${viewingName}` : ""}
      </h2>

      {error && <p className="mt-3 text-destructive">{error}</p>}

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <Card className="mt-6 p-10 text-center text-xl text-muted-foreground">
          No lessons scheduled for this date.
        </Card>
      ) : (
        <div className="mt-5 space-y-3">
          {rows.map((row) => {
            const notScheduled = row.status !== "scheduled";
            const tappable = !notScheduled && !row.needs_review && !!row.swimmer_id;
            const level = row.current_level as SwimLevel | null;
            const name = [row.swimmer_first, row.swimmer_last].filter(Boolean).join(" ") || "Swimmer";

            const content = (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="w-24 shrink-0 text-xl font-bold tabular-nums">
                  {formatTimeLabel(row.start_time)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xl font-semibold">{name}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-base text-muted-foreground">
                    <span>{PLAN_LABELS[row.plan_key] ?? row.plan_key}</span>
                    {level ? (
                      <span className="inline-flex items-center gap-2 text-foreground">
                        <LevelBadge level={level} size={28} />
                        {LEVEL_GROUP_NAMES[level]}
                      </span>
                    ) : (
                      <span className="rounded-full border border-dashed border-primary/50 px-3 py-1 text-sm font-medium text-primary">
                        Set level
                      </span>
                    )}
                    {row.has_medical && (
                      <span className="rounded-full bg-destructive/10 px-3 py-1 text-sm font-semibold text-destructive">
                        Medical
                      </span>
                    )}
                    {row.needs_review && (
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
                        Needs review
                      </span>
                    )}
                    {notScheduled && (
                      <span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold">
                        {row.cancel_reason ? `${row.status} · ${row.cancel_reason}` : row.status}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );

            return tappable ? (
              <button
                key={row.occurrence_id}
                type="button"
                onClick={() => onOpenSwimmer(row)}
                className="w-full rounded-xl border-2 border-border bg-card p-5 text-left transition hover:border-primary hover:bg-accent focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
              >
                {content}
              </button>
            ) : (
              <div
                key={row.occurrence_id}
                className="w-full rounded-xl border-2 border-dashed border-border bg-muted/40 p-5 opacity-70"
              >
                {content}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

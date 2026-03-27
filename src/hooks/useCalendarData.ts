import { useState, useEffect, useCallback } from "react";
import { format, startOfWeek, endOfWeek, addDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

export interface CalendarSwimSession {
  id: string;
  swim_level: string;
  age_group: string | null;
  start_time: string;
  end_time: string;
  max_students: number;
  session_name: string | null;
  day_of_week: string;
}

export interface CalendarEnrollment {
  id: string;
  child_name: string;
  child_age: number;
  parent_name: string;
  parent_phone: string | null;
  swim_level: string;
  session_id: string | null;
  status: string;
}

export interface CalendarPoolEvent {
  id: string;
  event_type: string;
  title: string;
  event_date: string;
  start_time: string;
  end_time: string;
  pool_area: string;
  instructor_name: string | null;
  notes: string | null;
  is_recurring: boolean;
}

export interface AttendanceRecord {
  id: string;
  enrollment_id: string;
  session_id: string;
  lesson_date: string;
  checked_in: boolean;
  checked_in_at: string | null;
  checked_in_by: string | null;
}

export function useCalendarData(currentDate: Date, view: "day" | "week") {
  const [swimSessions, setSwimSessions] = useState<CalendarSwimSession[]>([]);
  const [enrollments, setEnrollments] = useState<CalendarEnrollment[]>([]);
  const [poolEvents, setPoolEvents] = useState<CalendarPoolEvent[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const dateStr = format(currentDate, "yyyy-MM-dd");
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });

    // Determine which days of week we need
    const dayName = format(currentDate, "EEEE");
    const daysNeeded = view === "week"
      ? ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
      : [dayName];

    const [sessionsRes, enrollmentsRes, eventsRes, attendanceRes] = await Promise.all([
      supabase
        .from("swim_sessions")
        .select("id, swim_level, age_group, start_time, end_time, max_students, session_name, day_of_week")
        .eq("is_active", true)
        .in("day_of_week", daysNeeded),
      supabase
        .from("swim_enrollments")
        .select("id, child_name, child_age, parent_name, parent_phone, swim_level, session_id, status")
        .in("status", ["pending", "confirmed"]),
      supabase
        .from("pool_events")
        .select("*")
        .gte("event_date", view === "week" ? format(weekStart, "yyyy-MM-dd") : dateStr)
        .lte("event_date", view === "week" ? format(weekEnd, "yyyy-MM-dd") : dateStr),
      supabase
        .from("attendance")
        .select("*")
        .gte("lesson_date", view === "week" ? format(weekStart, "yyyy-MM-dd") : dateStr)
        .lte("lesson_date", view === "week" ? format(weekEnd, "yyyy-MM-dd") : dateStr),
    ]);

    if (sessionsRes.data) setSwimSessions(sessionsRes.data);
    if (enrollmentsRes.data) setEnrollments(enrollmentsRes.data);
    if (eventsRes.data) setPoolEvents(eventsRes.data);
    if (attendanceRes.data) setAttendance(attendanceRes.data);

    setLoading(false);
  }, [currentDate, view]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { swimSessions, enrollments, poolEvents, attendance, loading, refetch: fetchData };
}

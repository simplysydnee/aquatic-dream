import { useState, useEffect, useCallback } from "react";
import { format, startOfWeek, endOfWeek } from "date-fns";
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
  instructor_id: string | null;
  registration_status: string;
  instructors: { name: string } | null;
}

export interface CalendarEnrollment {
  id: string;
  child_name: string;
  child_age: number;
  parent_name: string;
  parent_phone: string | null;
  parent_email: string;
  swim_level: string;
  session_id: string | null;
  status: string;
  payment_status: string;
  is_first_time: boolean;
  medical_notes: string | null;
  waiver_signed_at: string | null;
  waiver_token: string | null;
  session_fee_status: string;
  payment_reminder_sent_at: string | null;
  reg_fee_link_sent_at: string | null;
  payment_method: string | null;
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

export interface EnrollmentAgreement {
  id: string;
  enrollment_id: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
}

export interface LessonDate {
  id: string;
  session_id: string;
  lesson_date: string;
  is_cancelled: boolean;
}

export interface PrivateLessonBooking {
  occurrence_id: string;
  booking_id: string;
  lesson_type: "private" | "semi_private" | string;
  instructor_id: string | null;
  instructor_name: string | null;
  parent_name: string;
  parent_email: string;
  parent_phone: string | null;
  child_name: string | null;
  child_age: number | null;
  start_time: string;
  end_time: string;
  pool_area: string;
  occurrence_date: string;
  price_per_session: number;
  payment_status: string;
  status: string;
  auto_charge_status: string;
  waiver_token: string | null;
  waiver_signed_at: string | null;
  recurring: boolean;
  notes: string | null;
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
}

export interface OpenPrivateSlot {
  instructor_id: string;
  instructor_name: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  slot_minutes: number;
  pool_area: string;
  default_lesson_type: string;
}

export interface ICSSession {
  id: string;
  start_time: string;
  end_time: string;
  location: string;
  session_type: string;
  status: string;
  max_capacity: number;
  instructor_name: string | null;
  confirmed_bookings: number;
  client_name?: string | null;
  parent_name?: string | null;
  parent_email?: string | null;
  parent_phone?: string | null;
}


export function useCalendarData(currentDate: Date, view: "day" | "week") {
  const [swimSessions, setSwimSessions] = useState<CalendarSwimSession[]>([]);
  const [enrollments, setEnrollments] = useState<CalendarEnrollment[]>([]);
  const [poolEvents, setPoolEvents] = useState<CalendarPoolEvent[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [agreements, setAgreements] = useState<EnrollmentAgreement[]>([]);
  const [icsSessions, setIcsSessions] = useState<ICSSession[]>([]);
  const [lessonDates, setLessonDates] = useState<LessonDate[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const dateStr = format(currentDate, "yyyy-MM-dd");
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
    const rangeStart = view === "week" ? format(weekStart, "yyyy-MM-dd") : dateStr;
    const rangeEnd = view === "week" ? format(weekEnd, "yyyy-MM-dd") : dateStr;

    const dayName = format(currentDate, "EEEE");
    const daysNeeded = view === "week"
      ? ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
      : [dayName];

    const [sessionsRes, enrollmentsRes, eventsRes, attendanceRes, agreementsRes, lessonDatesRes] = await Promise.all([
      supabase
        .from("swim_sessions")
        .select("id, swim_level, age_group, start_time, end_time, max_students, session_name, day_of_week, instructor_id, registration_status, instructors(name)")
        .eq("is_active", true),
      supabase
        .from("swim_enrollments")
        .select("id, child_name, child_age, parent_name, parent_phone, parent_email, swim_level, session_id, status, payment_status, is_first_time, medical_notes, waiver_signed_at, waiver_token, session_fee_status, payment_reminder_sent_at, reg_fee_link_sent_at, payment_method")
        .in("status", ["pending", "confirmed", "enrolled", "pending_payment"]),
      supabase
        .from("pool_events")
        .select("*")
        .gte("event_date", rangeStart)
        .lte("event_date", rangeEnd),
      supabase
        .from("attendance")
        .select("*")
        .gte("lesson_date", rangeStart)
        .lte("lesson_date", rangeEnd),
      supabase
        .from("enrollment_agreements")
        .select("id, enrollment_id, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship"),
      supabase
        .from("session_lesson_dates")
        .select("id, session_id, lesson_date, is_cancelled")
        .gte("lesson_date", rangeStart)
        .lte("lesson_date", rangeEnd),
    ]);

    if (sessionsRes.data) setSwimSessions(sessionsRes.data);
    if (enrollmentsRes.data) setEnrollments(enrollmentsRes.data);
    if (eventsRes.data) setPoolEvents(eventsRes.data);
    if (attendanceRes.data) setAttendance(attendanceRes.data);
    if (agreementsRes.data) setAgreements(agreementsRes.data);
    if (lessonDatesRes.data) setLessonDates(lessonDatesRes.data);

    // Show the calendar immediately — ICS data loads in the background
    setLoading(false);

    // Fetch I Can Swim sessions from edge function (non-blocking)
    try {
      const { data } = await supabase.functions.invoke("i-can-swim-schedule", {
        body: { startDate: rangeStart, endDate: rangeEnd },
      });
      if (data?.sessions) {
        setIcsSessions(data.sessions);
      }
    } catch {
      // silently fail — ICS data is supplementary
    }
  }, [currentDate, view]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { swimSessions, enrollments, poolEvents, attendance, agreements, icsSessions, lessonDates, loading, refetch: fetchData };
}

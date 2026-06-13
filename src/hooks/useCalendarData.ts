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
  photo_release_accepted?: boolean | null;
}

export interface LessonDate {
  id: string;
  session_id: string;
  lesson_date: string;
  is_cancelled: boolean;
  instructor_override_id?: string | null;
  instructor_override_name?: string | null;
}

export interface EnrollmentDateMove {
  id: string;
  enrollment_id: string;
  lesson_date: string;
  target_session_id: string;
  reason: string | null;
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
  booking_status: string;
  auto_charge_status: string;
  waiver_token: string | null;
  waiver_signed_at: string | null;
  recurring: boolean;
  notes: string | null;
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
  confirmation_email_status: string | null;
  confirmation_email_sent_at: string | null;
  confirmation_email_error: string | null;
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
  const [privateLessons, setPrivateLessons] = useState<PrivateLessonBooking[]>([]);
  const [openPrivateSlots, setOpenPrivateSlots] = useState<OpenPrivateSlot[]>([]);
  const [enrollmentDateMoves, setEnrollmentDateMoves] = useState<EnrollmentDateMove[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const dateStr = format(currentDate, "yyyy-MM-dd");
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
    const rangeStart = view === "week" ? format(weekStart, "yyyy-MM-dd") : dateStr;
    const rangeEnd = view === "week" ? format(weekEnd, "yyyy-MM-dd") : dateStr;

    const [
      sessionsRes, enrollmentsRes, eventsRes, attendanceRes, agreementsRes, lessonDatesRes,
      privateOccRes, blocksRes, instructorsRes, movesRes,
    ] = await Promise.all([
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
        .select("id, enrollment_id, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, photo_release_accepted"),
      supabase
        .from("session_lesson_dates")
        .select("id, session_id, lesson_date, is_cancelled, instructor_override_id")
        .gte("lesson_date", rangeStart)
        .lte("lesson_date", rangeEnd),
      supabase
        .from("lesson_booking_occurrences")
        .select("id, booking_id, occurrence_date, status, payment_status, auto_charge_status, created_at, start_time_override, end_time_override, instructor_override_id, instructor_override_name, lesson_bookings!inner(id, lesson_type, instructor_id, instructor_name, parent_name, parent_email, parent_phone, child_name, child_age, start_time, end_time, pool_area, price_per_session, recurring, notes, waiver_token, waiver_signed_at, stripe_customer_id, stripe_payment_method_id, confirmation_email_status, confirmation_email_sent_at, confirmation_email_error, status, booking_source)")
        .gte("occurrence_date", rangeStart)
        .lte("occurrence_date", rangeEnd)
        .neq("status", "cancelled"),
      supabase.rpc("get_public_booking_blocks", { _instructor_ids: null }),
      supabase.rpc("get_active_instructors_public"),
      supabase
        .from("enrollment_date_moves")
        .select("id, enrollment_id, lesson_date, target_session_id, reason")
        .gte("lesson_date", rangeStart)
        .lte("lesson_date", rangeEnd),
    ]);

    if (sessionsRes.data) setSwimSessions(sessionsRes.data);
    if (enrollmentsRes.data) setEnrollments(enrollmentsRes.data);
    if (eventsRes.data) setPoolEvents(eventsRes.data);
    if (attendanceRes.data) setAttendance(attendanceRes.data);
    if (agreementsRes.data) setAgreements(agreementsRes.data);
    if (movesRes.data) setEnrollmentDateMoves(movesRes.data as EnrollmentDateMove[]);
    else setEnrollmentDateMoves([]);
    const _instructorNameMap = new Map<string, string>(
      ((instructorsRes.data as any[]) || []).map((i) => [i.id, i.name])
    );
    if (lessonDatesRes.data) {
      setLessonDates((lessonDatesRes.data as any[]).map((d) => ({
        ...d,
        instructor_override_name: d.instructor_override_id
          ? (_instructorNameMap.get(d.instructor_override_id) || null)
          : null,
      })));
    }

    // ── Map private lesson occurrences ──
    // Hide stale pending_card rows (abandoned self-serve checkouts > 30 min old)
    // so they don't appear as real bookings on the calendar.
    // Admin-created bookings are NEVER hidden — admin manually placed the slot
    // and it must stay visible until they explicitly cancel it.
    const STALE_PENDING_MS = 30 * 60 * 1000;
    const _now = Date.now();
    const privates: PrivateLessonBooking[] = ((privateOccRes.data as any[]) || [])
      .filter((o) => {
        if (o.status !== "pending_card") return true;
        const src = o.lesson_bookings?.booking_source;
        if (src === "admin" || src === "admin_manual") return true;
        const created = o.created_at ? new Date(o.created_at).getTime() : 0;
        return (_now - created) <= STALE_PENDING_MS;
      })
      .map((o) => {
      const b = o.lesson_bookings;
      const effInstructorId = o.instructor_override_id || b?.instructor_id || null;
      const effInstructorName = o.instructor_override_name
        || (o.instructor_override_id ? (_instructorNameMap.get(o.instructor_override_id) || null) : null)
        || b?.instructor_name
        || null;
      const effStart = (o.start_time_override || b?.start_time || "").slice(0, 5);
      const effEnd = (o.end_time_override || b?.end_time || "").slice(0, 5);
      return {
        occurrence_id: o.id,
        booking_id: o.booking_id,
        lesson_type: b?.lesson_type || "private",
        instructor_id: effInstructorId,
        instructor_name: effInstructorName,
        parent_name: b?.parent_name || "",
        parent_email: b?.parent_email || "",
        parent_phone: b?.parent_phone || null,
        child_name: b?.child_name || null,
        child_age: b?.child_age ?? null,
        start_time: effStart,
        end_time: effEnd,
        pool_area: b?.pool_area || "shallow",
        occurrence_date: o.occurrence_date,
        price_per_session: Number(b?.price_per_session ?? 0),
        payment_status: o.payment_status,
        status: o.status,
        auto_charge_status: o.auto_charge_status,
        booking_status: b?.status || "",
        waiver_token: b?.waiver_token || null,
        waiver_signed_at: b?.waiver_signed_at || null,
        recurring: !!b?.recurring,
        notes: b?.notes || null,
        stripe_customer_id: b?.stripe_customer_id || null,
        stripe_payment_method_id: b?.stripe_payment_method_id || null,
        confirmation_email_status: b?.confirmation_email_status || null,
        confirmation_email_sent_at: b?.confirmation_email_sent_at || null,
        confirmation_email_error: b?.confirmation_email_error || null,
      };
    });
    setPrivateLessons(privates);

    // ── Compute open private slots from booking blocks minus taken occurrences ──
    const instructorMap = new Map<string, string>(
      ((instructorsRes.data as any[]) || []).map((i) => [i.id, i.name])
    );
    const taken = new Set<string>();
    for (const p of privates) {
      if (!p.instructor_id) continue;
      taken.add(`${p.instructor_id}|${p.occurrence_date}|${p.start_time}`);
    }

    const allBlocks = (blocksRes.data as any[]) || [];
    const blocks = allBlocks.filter((b) => !b.is_blackout);
    const blackouts = allBlocks.filter((b) => b.is_blackout);
    const open: OpenPrivateSlot[] = [];
    const fromD = new Date(rangeStart + "T00:00:00");
    const toD = new Date(rangeEnd + "T00:00:00");
    const addMin = (t: string, m: number): string => {
      const [h, mm] = t.split(":").map(Number);
      const total = h * 60 + mm + m;
      return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
    };
    const toMin = (t: string) => {
      const [h, mm] = t.split(":").map(Number);
      return h * 60 + (mm || 0);
    };
    const blockApplies = (blk: any, ds: string, dow: number): boolean => {
      if (blk.kind === "weekly" && blk.day_of_week !== dow) return false;
      if (blk.start_date && ds < blk.start_date) return false;
      if (blk.end_date && ds > blk.end_date) return false;
      if (blk.kind === "date_range" && blk.day_of_week !== null && blk.day_of_week !== dow) return false;
      return true;
    };
    for (let d = new Date(fromD); d <= toD; d.setDate(d.getDate() + 1)) {
      const ds = format(d, "yyyy-MM-dd");
      const dow = d.getDay();
      const blackoutsToday = blackouts
        .filter((b) => blockApplies(b, ds, dow))
        .map((b) => ({
          instructor_id: b.instructor_id,
          start: toMin((b.start_time as string).slice(0, 5)),
          end: toMin((b.end_time as string).slice(0, 5)),
        }));
      for (const blk of blocks) {
        if (!blockApplies(blk, ds, dow)) continue;
        let t = (blk.start_time as string).slice(0, 5);
        const end = (blk.end_time as string).slice(0, 5);
        const bs = blk.break_start_time ? (blk.break_start_time as string).slice(0, 5) : null;
        const be = blk.break_end_time ? (blk.break_end_time as string).slice(0, 5) : null;
        while (addMin(t, blk.slot_minutes) <= end) {
          const se = addMin(t, blk.slot_minutes);
          if (bs && be && t < be && se > bs) { t = be; continue; }
          const sMin = toMin(t);
          const eMin = toMin(se);
          const blackedOut = blackoutsToday.some(
            (bo) => bo.instructor_id === blk.instructor_id && sMin < bo.end && eMin > bo.start,
          );
          const key = `${blk.instructor_id}|${ds}|${t}`;
          if (!taken.has(key) && !blackedOut) {
            open.push({
              instructor_id: blk.instructor_id,
              instructor_name: instructorMap.get(blk.instructor_id) || "Instructor",
              slot_date: ds,
              start_time: t,
              end_time: se,
              slot_minutes: blk.slot_minutes,
              pool_area: blk.pool_area || "shallow",
              default_lesson_type: blk.default_lesson_type || "private",
            });
          }
          t = se;
        }
      }
    }
    // Dedupe overlapping blocks
    const seen = new Set<string>();
    setOpenPrivateSlots(open.filter((s) => {
      const k = `${s.instructor_id}|${s.slot_date}|${s.start_time}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }));

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

  return {
    swimSessions, enrollments, poolEvents, attendance, agreements,
    icsSessions, lessonDates, privateLessons, openPrivateSlots, enrollmentDateMoves,
    loading, refetch: fetchData,
  };
}


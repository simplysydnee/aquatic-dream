import { useState, useEffect, useCallback } from "react";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { DEAD_STATUS_FILTER, isRealLessonOccurrence } from "@/lib/lessonBookingStatus";


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
  charge_status: string;
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

export interface MembershipLesson {
  occurrence_id: string;
  membership_id: string;
  plan_key: string;
  plan_name: string;
  instructor_id: string | null;
  instructor_name: string | null;
  swimmer_name: string;
  parent_name: string;
  parent_email: string;
  parent_phone: string | null;
  occurrence_date: string;
  start_time: string;
  end_time: string;
  location: string | null;
  swim_level: string | null;
  notes: string | null;
  medical_notes: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
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
  const [membershipLessons, setMembershipLessons] = useState<MembershipLesson[]>([]);
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
      privateOccRes, blocksRes, instructorsRes, movesRes, membershipOccRes, plansRes,
    ] = await Promise.all([
      supabase
        .from("swim_sessions")
        .select("id, swim_level, age_group, start_time, end_time, max_students, session_name, day_of_week, instructor_id, registration_status, instructors(name)")
        .eq("is_active", true),
      supabase
        .from("swim_enrollments")
        .select("id, child_name, child_first_name, child_last_name, child_dob, child_age, parent_name, parent_phone, parent_email, swim_level, session_id, status, payment_status, is_first_time, medical_notes, waiver_signed_at, waiver_token, session_fee_status, payment_reminder_sent_at, reg_fee_link_sent_at, payment_method")
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
        .select("id, booking_id, occurrence_date, status, payment_status, charge_status, created_at, start_time_override, end_time_override, instructor_override_id, instructor_override_name, lesson_bookings!inner(id, lesson_type, instructor_id, instructor_name, parent_name, parent_email, parent_phone, child_name, child_age, start_time, end_time, pool_area, price_per_session, recurring, notes, waiver_token, waiver_signed_at, stripe_customer_id, stripe_payment_method_id, confirmation_email_status, confirmation_email_sent_at, confirmation_email_error, status, booking_source)")
        .gte("occurrence_date", rangeStart)
        .lte("occurrence_date", rangeEnd)
        .not("status", "in", DEAD_STATUS_FILTER),
      supabase.rpc("get_public_booking_blocks", { _instructor_ids: null }),
      supabase.rpc("get_active_instructors_public"),
      supabase
        .from("enrollment_date_moves")
        .select("id, enrollment_id, lesson_date, target_session_id, reason")
        .gte("lesson_date", rangeStart)
        .lte("lesson_date", rangeEnd),
      supabase
        .from("membership_occurrences")
        .select("id, membership_id, occurrence_date, start_time, end_time, instructor_id, status, memberships!inner(id, plan_key, child_first_name, child_last_name, parent_first_name, parent_last_name, parent_email, parent_phone, notes, medical_notes, standing_slots(id, start_time, end_time, instructor_id, location, swim_level), visitor_waivers(emergency_contact_first_name, emergency_contact_last_name, emergency_contact_phone, emergency_contact_relationship))")
        .gte("occurrence_date", rangeStart)
        .lte("occurrence_date", rangeEnd)
        .eq("status", "scheduled"),
      supabase.from("membership_plans").select("plan_key, name"),
    ]);

    if (sessionsRes.data) setSwimSessions(sessionsRes.data);
    if (enrollmentsRes.data) {
      // Merge family-wide waiver status so a waiver signed on any prior
      // enrollment, lesson booking, or visitor waiver still counts on newer
      // enrollment rows. Uses the same RPC as the check-in flow (last+dob
      // primary, email/phone fallback) so waiver status is consistent across
      // every admin surface.
      const rows = enrollmentsRes.data as any[];
      const ids = rows.map((r) => r.id).filter(Boolean);
      let hasMap = new Map<string, boolean>();
      if (ids.length) {
        try {
          const { data } = await supabase.rpc(
            "enrollments_waiver_status" as any,
            { _ids: ids },
          );
          ((data as any[]) || []).forEach((r) =>
            hasMap.set(r.enrollment_id, !!r.has_waiver),
          );
        } catch {
          hasMap = new Map();
        }
      }
      const nowIso = new Date().toISOString();
      const merged = rows.map((r) => ({
        ...r,
        waiver_signed_at:
          r.waiver_signed_at || (hasMap.get(r.id) ? nowIso : null),
      }));
      setEnrollments(merged);
    }
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
    // Abandoned self-serve checkouts never count as real bookings.
    // Admin-created bookings are NEVER hidden — admin placed the slot on purpose
    // and simply needs to collect a card at the front desk.
    const _now = Date.now();
    const privates: PrivateLessonBooking[] = ((privateOccRes.data as any[]) || [])
      .filter((o) =>
        isRealLessonOccurrence({
          occurrenceStatus: o.status,
          bookingStatus: o.lesson_bookings?.status,
          bookingSource: o.lesson_bookings?.booking_source,
          createdAt: o.created_at,
          now: _now,
        })
      )

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
        charge_status: o.charge_status,
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
    // Enrich waiver_signed_at using the family-wide RPC so a waiver signed on
    // any prior booking / enrollment / visitor waiver counts here too.
    const bookingIds = Array.from(
      new Set(privates.map((p) => p.booking_id).filter(Boolean)),
    ) as string[];
    if (bookingIds.length) {
      try {
        const { data } = await supabase.rpc(
          "bookings_waiver_status" as any,
          { _ids: bookingIds },
        );
        const bHas = new Map<string, boolean>();
        ((data as any[]) || []).forEach((r) =>
          bHas.set(r.booking_id, !!r.has_waiver),
        );
        const nowIso = new Date().toISOString();
        for (const p of privates) {
          if (!p.waiver_signed_at && bHas.get(p.booking_id)) {
            p.waiver_signed_at = nowIso;
          }
        }
      } catch {
        // Best-effort enrichment; keep raw values on failure.
      }
    }
    setPrivateLessons(privates);

    // ── Map membership occurrences (scheduled only; closed/cancelled excluded) ──
    // Scheduling only: membership_occurrences intentionally carries no payment
    // data, so nothing here reads or exposes charge / card state.
    const planNameByKey = new Map<string, string>(
      ((plansRes.data as any[]) || []).map((p) => [p.plan_key, p.name]),
    );
    const memberships: MembershipLesson[] = ((membershipOccRes.data as any[]) || []).map((o) => {
      const m = o.memberships || {};
      const slot = m.standing_slots || null;
      const waiver = m.visitor_waivers || null;
      const instructorId = o.instructor_id || slot?.instructor_id || null;
      const emergencyName = waiver
        ? [waiver.emergency_contact_first_name, waiver.emergency_contact_last_name]
            .filter(Boolean)
            .join(" ")
            .trim()
        : "";
      return {
        occurrence_id: o.id,
        membership_id: o.membership_id,
        plan_key: m.plan_key || "",
        plan_name: planNameByKey.get(m.plan_key) || "Membership lesson",
        instructor_id: instructorId,
        instructor_name: instructorId
          ? (_instructorNameMap.get(instructorId) || null)
          : null,
        swimmer_name: [m.child_first_name, m.child_last_name].filter(Boolean).join(" ").trim(),
        parent_name: [m.parent_first_name, m.parent_last_name].filter(Boolean).join(" ").trim(),
        parent_email: m.parent_email || "",
        parent_phone: m.parent_phone || null,
        occurrence_date: o.occurrence_date,
        start_time: (o.start_time || slot?.start_time || "").slice(0, 5),
        end_time: (o.end_time || slot?.end_time || "").slice(0, 5),
        location: slot?.location || null,
        swim_level: slot?.swim_level || null,
        notes: m.notes || null,
        medical_notes: m.medical_notes || null,
        emergency_contact_name: emergencyName || null,
        emergency_contact_phone: waiver?.emergency_contact_phone || null,
        emergency_contact_relationship: waiver?.emergency_contact_relationship || null,
      };
    });
    setMembershipLessons(memberships);



    // ── Compute open private slots from booking blocks minus taken occurrences ──
    const instructorMap = new Map<string, string>(
      ((instructorsRes.data as any[]) || []).map((i) => [i.id, i.name])
    );
    const taken = new Set<string>();
    for (const p of privates) {
      if (!p.instructor_id) continue;
      taken.add(`${p.instructor_id}|${p.occurrence_date}|${p.start_time}`);
    }

    setOpenPrivateSlots(composeOpenPrivateSlots({
      rangeStart,
      rangeEnd,
      blocks: ((blocksRes.data as any[]) || []) as Record<string, unknown>[],
      instructorNames: instructorMap,
      takenKeys: taken,
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
    icsSessions, lessonDates, privateLessons, membershipLessons, openPrivateSlots, enrollmentDateMoves,
    loading, refetch: fetchData,
  };
}


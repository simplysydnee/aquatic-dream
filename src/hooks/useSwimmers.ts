import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SwimmerRequest {
  id: string;
  status: string;
  lesson_type: string;
  preferred_times: string | null;
  notes: string | null;
  created_at: string;
  child_age: number;
  child_dob: string | null;
  parent_name: string;
  parent_email: string;
  parent_phone: string | null;
  child_name: string;
  last_replied_at: string | null;
  last_reply_message: string | null;
}

export interface SwimmerEnrollment {
  id: string;
  session_id: string | null;
  status: string;
  payment_status: string;
  session_fee_status: string;
  swim_level: string;
  lesson_type: string;
  is_first_time: boolean;
  notes: string | null;
  medical_notes: string | null;
  created_at: string;
  child_age: number;
  child_dob: string | null;
  parent_name: string;
  parent_email: string;
  parent_phone: string | null;
  child_name: string;
  payment_amount: number | null;
  stripe_payment_id: string | null;
  payment_due_date: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  payment_reminder_sent_at: string | null;
  reg_fee_link_sent_at: string | null;
  session_fee_stripe_id: string | null;
  session_fee_paid_at: string | null;
  registration_fee: number | null;
  waiver_token: string | null;
  waiver_signed_at: string | null;
  session?: {
    id: string;
    swim_level: string;
    day_of_week: string;
    start_time: string;
    end_time: string;
    age_group: string | null;
    session_period_id: string | null;
    session_price: number | null;
    total_lessons: number | null;
    price_per_lesson: number | null;
    period?: { name: string; start_date: string; end_date: string } | null;
  } | null;
}

export interface SwimmerBooking {
  id: string;
  lesson_type: string;
  status: string;
  series_start: string;
  series_end: string | null;
  recurring: boolean;
  start_time: string;
  end_time: string;
  instructor_name: string | null;
  parent_name: string;
  parent_email: string;
  parent_phone: string | null;
  child_name: string | null;
  child_first_name?: string | null;
  child_last_name?: string | null;
  price_per_session: number | null;
  created_at: string;
}

export type SwimmerStatusKey =
  | "lesson_requested_new"
  | "lesson_requested_contacted"
  | "lesson_requested_scheduled"
  | "enrolled_active"
  | "enrolled_upcoming"
  | "booking_active"
  | "unpaid"
  | "past_client"
  | "new_inquiry";

export interface SwimmerStatus {
  key: SwimmerStatusKey;
  label: string;
  tone: "info" | "success" | "warn" | "muted" | "danger";
}

export interface Swimmer {
  key: string; // child name + email
  child_name: string;
  child_age: number | null;
  child_dob: string | null;
  parent_name: string;
  parent_email: string;
  parent_phone: string | null;
  swim_level: string | null;
  requests: SwimmerRequest[];
  enrollments: SwimmerEnrollment[];
  bookings: SwimmerBooking[];
  statuses: SwimmerStatus[];
  last_activity: string; // ISO
  primary_status: SwimmerStatus;
  has_card_on_file: boolean;
}

const normalizeName = (name: string | null | undefined) =>
  (name || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeEmail = (email: string | null | undefined) =>
  (email || "").trim().toLowerCase();

const swimmerKey = (childName: string, parentEmail: string) =>
  `${normalizeName(childName)}|${normalizeEmail(parentEmail)}`;

const todayISO = () => new Date().toISOString().slice(0, 10);

function computeStatuses(s: Omit<Swimmer, "statuses" | "primary_status" | "last_activity">): {
  statuses: SwimmerStatus[];
  primary: SwimmerStatus;
} {
  const today = todayISO();
  const statuses: SwimmerStatus[] = [];

  // Bookings (computed first so we can suppress request badges when a booking is active)
  const hasActiveBooking = s.bookings.some(
    (b) => (b.series_end ? b.series_end >= today : b.recurring) && b.status !== "cancelled",
  );

  // Lesson request statuses (open ones) — suppressed entirely when a booking is active
  if (!hasActiveBooking) {
    const openRequest = s.requests.find((r) => r.status !== "scheduled" && r.status !== "closed");
    if (openRequest) {
      if (openRequest.status === "new") {
        statuses.push({ key: "lesson_requested_new", label: "Lesson Requested · New", tone: "warn" });
      } else if (openRequest.status === "contacted") {
        statuses.push({ key: "lesson_requested_contacted", label: "Lesson Requested · Contacted", tone: "info" });
      } else {
        statuses.push({ key: "lesson_requested_scheduled", label: `Lesson Requested · ${openRequest.status}`, tone: "info" });
      }
    } else {
      const scheduled = s.requests.find((r) => r.status === "scheduled");
      if (scheduled) {
        statuses.push({ key: "lesson_requested_scheduled", label: "Lesson Requested · Scheduled", tone: "info" });
      }
    }
  }

  // Enrollments
  let hasActiveEnroll = false;
  let hasUpcomingEnroll = false;
  let hasPastEnroll = false;
  let hasUnpaid = false;
  for (const e of s.enrollments) {
    const start = e.session?.period?.start_date;
    const end = e.session?.period?.end_date;
    const isActive = end ? end >= today && (!start || start <= today) : false;
    const isUpcoming = start ? start > today : false;
    const isPast = end ? end < today : false;
    if (isActive) hasActiveEnroll = true;
    if (isUpcoming) hasUpcomingEnroll = true;
    if (isPast) hasPastEnroll = true;
    if (
      (isActive || isUpcoming) &&
      (e.payment_status !== "paid" || (e.is_first_time && e.session_fee_status !== "paid"))
    ) {
      hasUnpaid = true;
    }
  }
  if (hasActiveEnroll) statuses.push({ key: "enrolled_active", label: "Enrolled · Active", tone: "success" });
  if (hasUpcomingEnroll && !hasActiveEnroll)
    statuses.push({ key: "enrolled_upcoming", label: "Enrolled · Upcoming", tone: "success" });

  if (hasActiveBooking) statuses.push({ key: "booking_active", label: "Booking Active", tone: "success" });

  if (hasUnpaid) statuses.push({ key: "unpaid", label: "Unpaid", tone: "danger" });

  // Past client / New inquiry fallback
  if (statuses.length === 0) {
    if (hasPastEnroll || s.bookings.length > 0) {
      statuses.push({ key: "past_client", label: "Past Client", tone: "muted" });
    } else if (s.requests.length > 0) {
      statuses.push({ key: "new_inquiry", label: "New Inquiry", tone: "warn" });
    } else {
      statuses.push({ key: "past_client", label: "Past Client", tone: "muted" });
    }
  }

  return { statuses, primary: statuses[0] };
}

function lastActivityISO(s: { requests: SwimmerRequest[]; enrollments: SwimmerEnrollment[]; bookings: SwimmerBooking[] }) {
  const dates: string[] = [];
  s.requests.forEach((r) => dates.push(r.last_replied_at || r.created_at));
  s.enrollments.forEach((e) => dates.push(e.created_at));
  s.bookings.forEach((b) => dates.push(b.created_at));
  return dates.sort().reverse()[0] || new Date(0).toISOString();
}

export function useSwimmers() {
  const [swimmers, setSwimmers] = useState<Swimmer[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [requestsRes, enrollmentsRes, bookingsRes] = await Promise.all([
      supabase.from("lesson_requests").select("*").order("created_at", { ascending: false }),
      supabase
        .from("swim_enrollments")
        .select(
          `*, session:swim_sessions(id, swim_level, day_of_week, start_time, end_time, age_group, session_period_id, session_price, total_lessons, price_per_lesson, period:session_periods(name, start_date, end_date))`,
        )
        .order("created_at", { ascending: false }),
      supabase.from("lesson_bookings").select("*, stripe_payment_method_id").order("created_at", { ascending: false }),
    ]);

    const map = new Map<string, Swimmer>();

    const ensure = (childName: string, parentEmail: string, base: Partial<Swimmer>) => {
      const key = swimmerKey(childName, parentEmail);
      let s = map.get(key);
      if (!s) {
        s = {
          key,
          child_name: childName.trim(),
          child_age: base.child_age ?? null,
          child_dob: base.child_dob ?? null,
          parent_name: base.parent_name ?? "",
          parent_email: parentEmail.trim(),
          parent_phone: base.parent_phone ?? null,
          swim_level: base.swim_level ?? null,
          requests: [],
          enrollments: [],
          bookings: [],
          statuses: [],
          last_activity: new Date(0).toISOString(),
          primary_status: { key: "past_client", label: "Past Client", tone: "muted" },
          has_card_on_file: false,
        };
        map.set(key, s);
      } else {
        // Prefer most recent non-empty values
        if (base.parent_name && !s.parent_name) s.parent_name = base.parent_name;
        if (base.parent_phone && !s.parent_phone) s.parent_phone = base.parent_phone;
        if (base.child_age != null && s.child_age == null) s.child_age = base.child_age;
        if (base.child_dob && !s.child_dob) s.child_dob = base.child_dob;
        if (base.swim_level && !s.swim_level) s.swim_level = base.swim_level;
      }
      return s;
    };

    (requestsRes.data || []).forEach((r: any) => {
      if (!r.parent_email || !r.child_name) return;
      const s = ensure(r.child_name, r.parent_email, {
        child_age: r.child_age,
        child_dob: r.child_dob,
        parent_name: r.parent_name,
        parent_phone: r.parent_phone,
      });
      s.requests.push(r as SwimmerRequest);
    });

    (enrollmentsRes.data || []).forEach((e: any) => {
      if (!e.parent_email || !e.child_name) return;
      const s = ensure(e.child_name, e.parent_email, {
        child_age: e.child_age,
        child_dob: e.child_dob,
        parent_name: e.parent_name,
        parent_phone: e.parent_phone,
        swim_level: e.swim_level,
      });
      s.enrollments.push(e as SwimmerEnrollment);
    });

    (bookingsRes.data || []).forEach((b: any) => {
      if (!b.parent_email) return;

      // Prefer first+last when present (cleaner than the raw child_name field
      // which is sometimes set to the parent's name for semi-private bookings).
      const composedName =
        b.child_first_name && b.child_last_name
          ? `${b.child_first_name} ${b.child_last_name}`
          : b.child_name || "";

      const parentEmailNorm = normalizeEmail(b.parent_email);
      const parentNameNorm = normalizeName(b.parent_name);
      const childNorm = normalizeName(composedName);
      const childFirstNorm = normalizeName(b.child_first_name);

      // Booking has no real child identity (e.g. semi-private where child_name
      // was set to the parent's own name). Try to attach to an existing
      // swimmer for the same parent.
      const childIsParent =
        !b.child_first_name &&
        !b.child_last_name &&
        (!childNorm || childNorm === parentNameNorm);

      // 1) Exact normalized match
      let target = map.get(swimmerKey(composedName, b.parent_email));

      // 2) Fuzzy match against existing swimmers under same parent
      if (!target) {
        const sameParent = Array.from(map.values()).filter(
          (s) => normalizeEmail(s.parent_email) === parentEmailNorm,
        );

        if (!target && childNorm) {
          target =
            sameParent.find((s) => normalizeName(s.child_name) === childNorm) ||
            sameParent.find((s) => {
              const sn = normalizeName(s.child_name);
              return (
                sn &&
                (sn.startsWith(childNorm + " ") ||
                  childNorm.startsWith(sn + " ") ||
                  (childFirstNorm && sn.split(" ")[0] === childFirstNorm))
              );
            });
        }

        // 3) Booking with no real child name → attach to the parent's sole swimmer
        if (!target && childIsParent && sameParent.length === 1) {
          target = sameParent[0];
        }
      }

      if (!target) {
        const displayName = composedName.trim() || b.child_name || b.parent_name || "Unknown";
        target = ensure(displayName, b.parent_email, {
          parent_name: b.parent_name,
          parent_phone: b.parent_phone,
        });
      } else {
        if (b.parent_name && !target.parent_name) target.parent_name = b.parent_name;
        if (b.parent_phone && !target.parent_phone) target.parent_phone = b.parent_phone;
      }

      target.bookings.push(b as SwimmerBooking);
    });

    // Build email→hasCard map from bookings (stripe_payment_method_id)
    // and profiles (stripe_default_pm_id), keyed by normalized email.
    const cardEmails = new Set<string>();
    (bookingsRes.data || []).forEach((b: any) => {
      if (b.stripe_payment_method_id && b.parent_email) {
        cardEmails.add(normalizeEmail(b.parent_email));
      }
    });
    const dedupedEmails = Array.from(
      new Set(Array.from(map.values()).map((s) => normalizeEmail(s.parent_email)).filter(Boolean)),
    );
    if (dedupedEmails.length > 0) {
      const { data: profRows } = await supabase
        .from("profiles")
        .select("email,stripe_default_pm_id")
        .in("email", dedupedEmails)
        .not("stripe_default_pm_id", "is", null);
      (profRows || []).forEach((p: any) => {
        if (p.email) cardEmails.add(normalizeEmail(p.email));
      });
    }

    const list = Array.from(map.values()).map((s) => {
      // Sort bookings newest-first by series_start (fallback created_at)
      s.bookings.sort((a, b) => {
        const ad = a.series_start || a.created_at;
        const bd = b.series_start || b.created_at;
        return ad < bd ? 1 : -1;
      });
      const { statuses, primary } = computeStatuses(s);
      return {
        ...s,
        statuses,
        primary_status: primary,
        last_activity: lastActivityISO(s),
        has_card_on_file: cardEmails.has(normalizeEmail(s.parent_email)),
      };
    });
    list.sort((a, b) => (a.last_activity < b.last_activity ? 1 : -1));
    setSwimmers(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("clients-aggregated")
      .on("postgres_changes", { event: "*", schema: "public", table: "lesson_requests" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "swim_enrollments" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "lesson_bookings" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  return { swimmers, loading, refetch: load };
}

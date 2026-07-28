import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { LEVEL_DISPLAY, type SwimLevel } from "@/components/swim-enrollment/types";
import {
  CARD_AT_DESK_LABEL,
  DEAD_STATUS_FILTER,
  isRealLessonOccurrence,
  needsCardAtDesk,
} from "@/lib/lessonBookingStatus";
import { format } from "date-fns";


interface Session {
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

interface Enrollment {
  id: string;
  child_name: string;
  child_age: number;
  parent_name: string;
  parent_phone: string | null;
  parent_email: string;
  swim_level: string;
  session_id: string | null;
  status: string;
  medical_notes: string | null;
}

interface Agreement {
  enrollment_id: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
}

const LEVEL_STRIPE: Record<string, string> = {
  white: "#b0a890",
  red: "#c53030",
  yellow: "#d69e2e",
  blue: "#2563eb",
  green: "#16a34a",
};

const PRIVATE_STRIPE = "#26215C";
const SEMI_PRIVATE_STRIPE = "#4B1528";
const MEMBERSHIP_STRIPE: Record<string, string> = {
  private: "#2a5e84",
  adult_group: "#F58B76",
  kid_group: "#1a3a8a",
};

interface PrivateOccurrence {
  id: string;
  instructor_id: string | null;
  instructor_name: string | null;
  lesson_type: string;
  start_time: string;
  end_time: string;
  pool_area: string | null;
  child_name: string;
  child_age: number | null;
  parent_name: string;
  parent_phone: string | null;
  notes: string | null;
  needs_card: boolean;
}

interface MembershipOccurrence {
  id: string;
  instructor_id: string | null;
  instructor_name: string | null;
  plan_key: string;
  plan_name: string;
  start_time: string;
  end_time: string;
  location: string | null;
  swim_level: string | null;
  swimmer_name: string;
  parent_name: string;
  parent_phone: string | null;
  notes: string | null;
  medical_notes: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
}


function fmtTime(t: string) {
  const [h, m] = t.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m}${ampm}`;
}

function firstName(full: string) {
  return (full || "").trim().split(/\s+/)[0] || full;
}

export default function PrintDaySchedule() {
  const [params] = useSearchParams();
  const date = params.get("date") || format(new Date(), "yyyy-MM-dd");
  const instructorParam = params.get("instructor") || "all";
  const allowedInstructorIds = useMemo(() => {
    if (instructorParam === "all") return null;
    return new Set(instructorParam.split(",").map((s) => s.trim()).filter(Boolean));
  }, [instructorParam]);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [lessonDates, setLessonDates] = useState<{ session_id: string; is_cancelled: boolean }[]>([]);
  const [privateOccs, setPrivateOccs] = useState<PrivateOccurrence[]>([]);
  const [loading, setLoading] = useState(true);

  const dayName = format(new Date(date + "T12:00:00"), "EEEE");
  const dateLabel = format(new Date(date + "T12:00:00"), "EEE · MMM d, yyyy");

  useEffect(() => {
    (async () => {
      const [s, e, a, ld, po] = await Promise.all([
        supabase
          .from("swim_sessions")
          .select(
            "id, swim_level, age_group, start_time, end_time, max_students, session_name, day_of_week, instructor_id, registration_status, instructors(name)"
          )
          .eq("is_active", true),
        supabase
          .from("swim_enrollments")
          .select(
            "id, child_name, child_age, parent_name, parent_phone, parent_email, swim_level, session_id, status, medical_notes"
          )
          .in("status", ["pending", "confirmed", "enrolled", "pending_payment"]),
        supabase
          .from("enrollment_agreements")
          .select("enrollment_id, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship"),
        supabase
          .from("session_lesson_dates")
          .select("session_id, is_cancelled")
          .eq("lesson_date", date),
        supabase
          .from("lesson_booking_occurrences")
          .select("id, status, created_at, start_time_override, end_time_override, instructor_override_id, instructor_override_name, lesson_bookings!inner(id, lesson_type, instructor_id, instructor_name, parent_name, parent_phone, child_name, child_age, start_time, end_time, pool_area, notes, status, booking_source, stripe_payment_method_id)")
          .eq("occurrence_date", date)
          .not("status", "in", DEAD_STATUS_FILTER),

      ]);
      if (s.data) setSessions(s.data as Session[]);
      if (e.data) setEnrollments(e.data as Enrollment[]);
      if (a.data) setAgreements(a.data as Agreement[]);
      if (ld.data) setLessonDates(ld.data as any);
      if (po.data) {
        const now = Date.now();
        const mapped: PrivateOccurrence[] = (po.data as any[])
          .filter((o) =>
            o.lesson_bookings &&
            isRealLessonOccurrence({
              occurrenceStatus: o.status,
              bookingStatus: o.lesson_bookings.status,
              bookingSource: o.lesson_bookings.booking_source,
              createdAt: o.created_at,
              now,
            })
          )
          .map((o) => {
            const b = o.lesson_bookings;
            return {
              id: o.id,
              instructor_id: o.instructor_override_id || b.instructor_id || null,
              instructor_name: o.instructor_override_name || b.instructor_name || null,
              lesson_type: b.lesson_type || "private",
              start_time: (o.start_time_override || b.start_time || "").slice(0, 8),
              end_time: (o.end_time_override || b.end_time || "").slice(0, 8),
              pool_area: b.pool_area || null,
              child_name: b.child_name || "",
              child_age: b.child_age ?? null,
              parent_name: b.parent_name || "",
              parent_phone: b.parent_phone || null,
              notes: b.notes || null,
              needs_card:
                needsCardAtDesk({
                  bookingStatus: b.status,
                  bookingSource: b.booking_source,
                }) || !b.stripe_payment_method_id,
            };
          });

        setPrivateOccs(mapped);
      }
      setLoading(false);
    })();
  }, [date]);

  const activeIds = useMemo(
    () => new Set(lessonDates.filter((l) => !l.is_cancelled).map((l) => l.session_id)),
    [lessonDates]
  );

  const todaySessions = useMemo(() => {
    return sessions
      .filter(
        (s) =>
          s.day_of_week.toLowerCase().includes(dayName.toLowerCase()) &&
          activeIds.has(s.id) &&
          (allowedInstructorIds === null ||
            (s.instructor_id !== null && allowedInstructorIds.has(s.instructor_id)))
      )
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [sessions, activeIds, dayName, allowedInstructorIds]);

  const todayPrivate = useMemo(() => {
    return privateOccs
      .filter((p) => allowedInstructorIds === null || (p.instructor_id !== null && allowedInstructorIds.has(p.instructor_id)))
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [privateOccs, allowedInstructorIds]);

  const agreementByEnrollment = useMemo(() => {
    const m = new Map<string, Agreement>();
    for (const a of agreements) if (a.enrollment_id) m.set(a.enrollment_id, a);
    return m;
  }, [agreements]);

  type Item =
    | { kind: "group"; start_time: string; session: Session }
    | { kind: "private"; start_time: string; occ: PrivateOccurrence };

  // Group by instructor; include group sessions and private/semi-private occurrences
  const grouped = useMemo(() => {
    const m = new Map<string, { name: string; items: Item[] }>();
    for (const s of todaySessions) {
      const key = s.instructor_id || "unassigned";
      const name = s.instructors?.name || "Unassigned";
      if (!m.has(key)) m.set(key, { name, items: [] });
      m.get(key)!.items.push({ kind: "group", start_time: s.start_time, session: s });
    }
    for (const p of todayPrivate) {
      const key = p.instructor_id || "unassigned";
      const name = p.instructor_name || "Unassigned";
      if (!m.has(key)) m.set(key, { name, items: [] });
      m.get(key)!.items.push({ kind: "private", start_time: p.start_time, occ: p });
    }
    return [...m.values()]
      .map((g) => {
        const items = [...g.items].sort((a, b) => a.start_time.localeCompare(b.start_time));
        let classCount = 0;
        let swimmerCount = 0;
        for (const it of items) {
          classCount++;
          if (it.kind === "group") {
            swimmerCount += enrollments.filter((e) => e.session_id === it.session.id).length;
          } else {
            swimmerCount += 1;
          }
        }
        return { name: g.name, items, classCount, totalSwimmers: swimmerCount };
      })
      .filter((g) => g.totalSwimmers > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [todaySessions, todayPrivate, enrollments]);

  useEffect(() => {
    if (!loading && grouped.length > 0) {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [loading, grouped.length]);

  if (loading) {
    return <div style={{ padding: 40, fontFamily: "system-ui" }}>Loading schedule…</div>;
  }

  return (
    <div className="print-root">
      <style>{`
        @page { size: letter portrait; margin: 0.35in; }
        body { background: white !important; }
        .print-root {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #1a1a1a;
          background: white;
          font-size: 9pt;
          line-height: 1.25;
        }
        .tip {
          background: #fff8e1; border: 1px solid #f0d27a; color: #6b5800;
          padding: 10px 14px; border-radius: 6px; font-size: 12px;
          margin: 0 auto 14px; max-width: 7.5in;
        }
        .instructor-page {
          page-break-before: always;
          padding: 0;
        }
        .instructor-page:first-of-type { page-break-before: auto; }
        .ipage-head {
          display: flex; justify-content: space-between; align-items: flex-end;
          border-bottom: 2.5px solid #1a3a8a; padding-bottom: 6px; margin-bottom: 8px;
        }
        .ipage-head .iname {
          font-size: 20pt; font-weight: 800; color: #1a3a8a;
          letter-spacing: -0.01em; line-height: 1; text-transform: uppercase;
        }
        .ipage-head .isub { font-size: 9pt; color: #555; margin-top: 4px; }
        .ipage-head .idate {
          text-align: right; font-size: 11pt; font-weight: 700; color: #2a5e84;
        }
        .ipage-head .ibrand { font-size: 8pt; color: #888; margin-top: 2px; }
        table.sched { width: 100%; border-collapse: collapse; table-layout: fixed; }
        table.sched th {
          font-size: 7.5pt; font-weight: 700; color: #fff; background: #1a3a8a;
          text-transform: uppercase; letter-spacing: 0.04em;
          padding: 4px 6px; text-align: left; border: 1px solid #1a3a8a;
        }
        table.sched td {
          padding: 3px 6px; border: 1px solid #d8dee6;
          vertical-align: top; font-size: 9pt;
        }
        table.sched col.c-time   { width: 11%; }
        table.sched col.c-class  { width: 18%; }
        table.sched col.c-swim   { width: 19%; }
        table.sched col.c-parent { width: 17%; }
        table.sched col.c-emerg  { width: 19%; }
        table.sched col.c-notes  { width: 16%; }
        td.time-cell {
          font-weight: 700; font-size: 9pt; color: #1a1a1a;
          border-left-width: 5px !important; border-left-style: solid !important;
        }
        td.time-cell .cap {
          display: inline-block; font-size: 7.5pt; font-weight: 700;
          background: #1a3a8a; color: #fff; padding: 1px 5px; border-radius: 8px;
          margin-top: 2px;
        }
        td.time-cell .cap.full { background: #c53030; }
        td.class-cell .lvl { font-weight: 700; }
        td.class-cell .ag { font-size: 7.5pt; color: #666; }
        td.swimmer-cell { font-weight: 700; }
        td.swimmer-cell .age { font-weight: 400; color: #666; }
        td.medical { color: #c53030; font-weight: 600; }
        .class-group-first td { border-top: 2px solid #b0b8c4 !important; }
        .ifoot {
          margin-top: 8px; padding-top: 4px; border-top: 1px solid #e5e7eb;
          font-size: 7.5pt; color: #888; display: flex; justify-content: space-between;
        }
        @media print {
          .no-print { display: none !important; }
          .instructor-page { break-before: page; }
          .instructor-page:first-of-type { break-before: auto; }
          table.sched thead { display: table-header-group; }
          tr { page-break-inside: avoid; }
        }
      `}</style>

      <div className="no-print tip">
        <strong>Tip:</strong> In the print dialog, open <em>More settings</em> and turn off
        <em> Headers and footers</em> so the URL/date strip doesn't print. Each instructor prints on its own page.
      </div>

      {grouped.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#888" }}>
          No classes with enrolled swimmers for {dateLabel}.
        </div>
      ) : (
        grouped.map((g) => {
          const classCount = g.classCount;
          return (
            <section key={g.name} className="instructor-page">
              <div className="ipage-head">
                <div>
                  <div className="iname">{g.name}</div>
                  <div className="isub">
                    {classCount} class{classCount === 1 ? "" : "es"} · {g.totalSwimmers} swimmer
                    {g.totalSwimmers === 1 ? "" : "s"}
                  </div>
                </div>
                <div>
                  <div className="idate">{dateLabel}</div>
                  <div className="ibrand">Aquatic Dreams Swim · aquaticdreamsswim.com</div>
                </div>
              </div>

              <table className="sched">
                <colgroup>
                  <col className="c-time" />
                  <col className="c-class" />
                  <col className="c-swim" />
                  <col className="c-parent" />
                  <col className="c-emerg" />
                  <col className="c-notes" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Class</th>
                    <th>Swimmer</th>
                    <th>Parent</th>
                    <th>Emergency</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.flatMap((it) => {
                    if (it.kind === "group") {
                      const s = it.session;
                      const sEnr = enrollments.filter((e) => e.session_id === s.id);
                      const level = LEVEL_DISPLAY[s.swim_level as SwimLevel]?.name || s.swim_level;
                      const stripe = LEVEL_STRIPE[s.swim_level] || "#999";
                      const isFull = sEnr.length >= s.max_students;
                      const ageLabel =
                        s.age_group === "preschool-3-5"
                          ? "Preschool 3–5"
                          : s.age_group === "school-age-6-12"
                          ? "School-Age 6–12"
                          : s.age_group || "";
                      const rowCount = Math.max(sEnr.length, 1);

                      const rows: JSX.Element[] = [];
                      for (let i = 0; i < rowCount; i++) {
                        const e = sEnr[i];
                        const ag = e ? agreementByEnrollment.get(e.id) : undefined;
                        rows.push(
                          <tr key={`${s.id}-${i}`} className={i === 0 ? "class-group-first" : ""}>
                            {i === 0 && (
                              <>
                                <td
                                  className="time-cell"
                                  rowSpan={rowCount}
                                  style={{ borderLeftColor: stripe }}
                                >
                                  {fmtTime(s.start_time)}<br />
                                  <span style={{ fontWeight: 400, color: "#666" }}>
                                    {fmtTime(s.end_time)}
                                  </span>
                                  <div>
                                    <span className={`cap ${isFull ? "full" : ""}`}>
                                      {sEnr.length}/{s.max_students}
                                    </span>
                                  </div>
                                </td>
                                <td className="class-cell" rowSpan={rowCount}>
                                  <div className="lvl">{level}</div>
                                  {s.session_name && (
                                    <div style={{ fontSize: "7.5pt", color: "#555" }}>{s.session_name}</div>
                                  )}
                                  <div className="ag">{ageLabel}</div>
                                </td>
                              </>
                            )}
                            {e ? (
                              <>
                                <td className="swimmer-cell">
                                  {e.child_name} <span className="age">({e.child_age})</span>
                                </td>
                                <td>
                                  {firstName(e.parent_name)}
                                  <div style={{ color: "#555" }}>{e.parent_phone || "—"}</div>
                                </td>
                                <td>
                                  {ag ? (
                                    <>
                                      {ag.emergency_contact_name}
                                      {ag.emergency_contact_relationship
                                        ? ` (${ag.emergency_contact_relationship})`
                                        : ""}
                                      <div style={{ color: "#555" }}>{ag.emergency_contact_phone}</div>
                                    </>
                                  ) : (
                                    <span style={{ color: "#aaa" }}>Not on file</span>
                                  )}
                                </td>
                                <td className={e.medical_notes ? "medical" : ""}>
                                  {e.medical_notes || "—"}
                                </td>
                              </>
                            ) : (
                              <td colSpan={4} style={{ color: "#aaa", fontStyle: "italic" }}>
                                No swimmers enrolled
                              </td>
                            )}
                          </tr>
                        );
                      }
                      return rows;
                    }

                    // private / semi-private occurrence
                    const p = it.occ;
                    const isSemi = p.lesson_type === "semi_private" || p.lesson_type === "semi-private";
                    const stripe = isSemi ? SEMI_PRIVATE_STRIPE : PRIVATE_STRIPE;
                    const typeLabel = isSemi ? "Semi-private lesson" : "Private lesson";
                    const cap = isSemi ? "1/2" : "1/1";
                    const poolLabel = p.pool_area
                      ? p.pool_area.charAt(0).toUpperCase() + p.pool_area.slice(1) + " pool"
                      : "";
                    return [
                      <tr key={p.id} className="class-group-first">
                        <td
                          className="time-cell"
                          style={{ borderLeftColor: stripe }}
                        >
                          {fmtTime(p.start_time)}<br />
                          <span style={{ fontWeight: 400, color: "#666" }}>{fmtTime(p.end_time)}</span>
                          <div>
                            <span className="cap">{cap}</span>
                          </div>
                        </td>
                        <td className="class-cell">
                          <div className="lvl">{typeLabel}</div>
                          {poolLabel && (
                            <div style={{ fontSize: "7.5pt", color: "#555" }}>{poolLabel}</div>
                          )}
                        </td>
                        <td className="swimmer-cell">
                          {p.child_name}
                          {p.child_age != null && <span className="age"> ({p.child_age})</span>}
                        </td>
                        <td>
                          {firstName(p.parent_name)}
                          <div style={{ color: "#555" }}>{p.parent_phone || "—"}</div>
                        </td>
                        <td><span style={{ color: "#aaa" }}>—</span></td>
                        <td>
                          {p.needs_card && (
                            <div style={{ fontWeight: 700, color: "#92400e" }}>
                              ⚠ {CARD_AT_DESK_LABEL}
                            </div>
                          )}
                          {p.notes || (p.needs_card ? "" : "—")}
                        </td>

                      </tr>,
                    ];
                  })}
                </tbody>
              </table>

              <div className="ifoot">
                <span>Printed {format(new Date(), "MMM d, yyyy h:mm a")}</span>
                <span>Aquatic Dreams Swim School</span>
              </div>
            </section>
          );
        })
      )}

      <div className="no-print" style={{ marginTop: 20, textAlign: "center" }}>
        <button
          onClick={() => window.print()}
          style={{
            padding: "10px 20px",
            background: "#1a3a8a",
            color: "white",
            border: "none",
            borderRadius: 6,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Print
        </button>
      </div>
    </div>
  );
}

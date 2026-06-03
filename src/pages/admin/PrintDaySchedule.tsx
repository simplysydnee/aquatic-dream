import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { LEVEL_DISPLAY, type SwimLevel } from "@/components/swim-enrollment/types";
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

function fmtTime(t: string) {
  const [h, m] = t.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m} ${ampm}`;
}

export default function PrintDaySchedule() {
  const [params] = useSearchParams();
  const date = params.get("date") || format(new Date(), "yyyy-MM-dd");
  const instructorId = params.get("instructor") || "all";

  const [sessions, setSessions] = useState<Session[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [lessonDates, setLessonDates] = useState<{ session_id: string; is_cancelled: boolean }[]>([]);
  const [loading, setLoading] = useState(true);

  const dayName = format(new Date(date + "T12:00:00"), "EEEE");
  const dateLabel = format(new Date(date + "T12:00:00"), "EEEE, MMMM d, yyyy");

  useEffect(() => {
    (async () => {
      const [s, e, a, ld] = await Promise.all([
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
      ]);
      if (s.data) setSessions(s.data as Session[]);
      if (e.data) setEnrollments(e.data as Enrollment[]);
      if (a.data) setAgreements(a.data as Agreement[]);
      if (ld.data) setLessonDates(ld.data as any);
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
          (instructorId === "all" || s.instructor_id === instructorId)
      )
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [sessions, activeIds, dayName, instructorId]);

  // group by instructor when "all"
  const grouped = useMemo(() => {
    const m = new Map<string, { name: string; sessions: Session[] }>();
    for (const s of todaySessions) {
      const key = s.instructor_id || "unassigned";
      const name = s.instructors?.name || "Unassigned";
      if (!m.has(key)) m.set(key, { name, sessions: [] });
      m.get(key)!.sessions.push(s);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [todaySessions]);

  const agreementByEnrollment = useMemo(() => {
    const m = new Map<string, Agreement>();
    for (const a of agreements) if (a.enrollment_id) m.set(a.enrollment_id, a);
    return m;
  }, [agreements]);

  useEffect(() => {
    if (!loading && todaySessions.length > 0) {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [loading, todaySessions.length]);

  if (loading) {
    return <div style={{ padding: 40, fontFamily: "system-ui" }}>Loading schedule…</div>;
  }

  return (
    <div className="print-root">
      <style>{`
        @page { size: letter portrait; margin: 0.5in; }
        body { background: white !important; }
        .print-root {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #1a1a1a;
          max-width: 7.5in;
          margin: 0 auto;
          padding: 24px;
          background: white;
        }
        .header {
          border-bottom: 3px solid #2a5e84;
          padding-bottom: 12px;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .header h1 {
          font-size: 22px; font-weight: 700; color: #1a3a8a; margin: 0;
          letter-spacing: -0.01em;
        }
        .header .sub { font-size: 13px; color: #555; margin-top: 2px; }
        .header .logo { font-size: 11px; color: #2a5e84; font-weight: 600; text-align: right; }
        .instructor-group { margin-bottom: 28px; page-break-inside: avoid; }
        .instructor-group h2 {
          font-size: 16px; font-weight: 700; color: #1a3a8a;
          margin: 0 0 10px; padding: 6px 10px;
          background: #eef3fa; border-radius: 4px;
        }
        .class-card {
          margin-bottom: 14px;
          border: 1px solid #d1d5db;
          border-left: 5px solid #999;
          border-radius: 6px;
          overflow: hidden;
          page-break-inside: avoid;
        }
        .class-head {
          padding: 8px 12px;
          background: #fafafa;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #e5e7eb;
        }
        .class-title { font-weight: 700; font-size: 14px; color: #1a1a1a; }
        .class-meta { font-size: 11px; color: #555; margin-top: 2px; }
        .class-cap {
          font-size: 11px; font-weight: 700;
          background: #1a3a8a; color: white;
          padding: 3px 8px; border-radius: 999px;
        }
        .class-cap.full { background: #c53030; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td {
          padding: 6px 8px; text-align: left; vertical-align: top;
          border-bottom: 1px solid #f0f0f0;
        }
        th { font-size: 10px; font-weight: 700; color: #555; text-transform: uppercase; background: #fafafa; }
        td.swimmer { font-weight: 600; color: #1a1a1a; }
        td.medical { color: #c53030; font-style: italic; }
        .empty { padding: 14px; text-align: center; color: #888; font-size: 12px; font-style: italic; }
        .footer {
          margin-top: 30px; padding-top: 10px; border-top: 1px solid #e5e7eb;
          font-size: 10px; color: #888; text-align: center;
        }
        @media print {
          .no-print { display: none !important; }
          .class-card { break-inside: avoid; }
          .instructor-group { break-inside: avoid; }
        }
      `}</style>

      <div className="header">
        <div>
          <h1>Daily Class Schedule</h1>
          <div className="sub">{dateLabel}</div>
        </div>
        <div className="logo">
          Aquatic Dreams<br />
          <span style={{ color: "#888", fontWeight: 400 }}>aquaticdreamsswim.com</span>
        </div>
      </div>

      {todaySessions.length === 0 ? (
        <div className="empty">No classes scheduled for this day.</div>
      ) : (
        grouped.map((g) => (
          <div key={g.name} className="instructor-group">
            <h2>👤 {g.name}</h2>
            {g.sessions.map((s) => {
              const sEnr = enrollments.filter((e) => e.session_id === s.id);
              const level = LEVEL_DISPLAY[s.swim_level as SwimLevel]?.name || s.swim_level;
              const stripe = LEVEL_STRIPE[s.swim_level] || "#999";
              const isFull = sEnr.length >= s.max_students;
              return (
                <div key={s.id} className="class-card" style={{ borderLeftColor: stripe }}>
                  <div className="class-head">
                    <div>
                      <div className="class-title">
                        {level}
                        {s.session_name ? ` · ${s.session_name}` : ""}
                        <span style={{ fontWeight: 400, color: "#555" }}>
                          {" "}· {fmtTime(s.start_time)} – {fmtTime(s.end_time)}
                        </span>
                      </div>
                      <div className="class-meta">
                        {s.age_group === "preschool-3-5"
                          ? "Preschool 3–5"
                          : s.age_group === "school-age-6-12"
                          ? "School-Age 6–12"
                          : s.age_group || ""}
                      </div>
                    </div>
                    <div className={`class-cap ${isFull ? "full" : ""}`}>
                      {sEnr.length}/{s.max_students}
                    </div>
                  </div>
                  {sEnr.length === 0 ? (
                    <div className="empty">No swimmers enrolled.</div>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Swimmer</th>
                          <th>Age</th>
                          <th>Parent</th>
                          <th>Parent Phone</th>
                          <th>Emergency Contact</th>
                          <th>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sEnr.map((e) => {
                          const ag = agreementByEnrollment.get(e.id);
                          return (
                            <tr key={e.id}>
                              <td className="swimmer">{e.child_name}</td>
                              <td>{e.child_age}</td>
                              <td>
                                {e.parent_name}
                                <div style={{ color: "#666", fontSize: 10 }}>{e.parent_email}</div>
                              </td>
                              <td>{e.parent_phone || "—"}</td>
                              <td>
                                {ag ? (
                                  <>
                                    {ag.emergency_contact_name}
                                    {ag.emergency_contact_relationship
                                      ? ` (${ag.emergency_contact_relationship})`
                                      : ""}
                                    <div style={{ color: "#666", fontSize: 10 }}>
                                      {ag.emergency_contact_phone}
                                    </div>
                                  </>
                                ) : (
                                  <span style={{ color: "#aaa" }}>Not on file</span>
                                )}
                              </td>
                              <td className={e.medical_notes ? "medical" : ""}>
                                {e.medical_notes || "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}

      <div className="footer">
        Printed {format(new Date(), "MMM d, yyyy h:mm a")} · Aquatic Dreams Swim School
      </div>

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

import { useEffect, useState } from "react";
import SEO from "@/components/SEO";
import StarfishCurriculumBadge from "@/components/StarfishCurriculumBadge";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Star, ChevronRight, DollarSign, Calendar, Clock, ShoppingBag, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import LevelBadge from "@/components/LevelBadge";
import type { SwimLevel } from "@/components/swim-enrollment/types";

/* ───────── curriculum data ───────── */

const preschoolCurriculum = [
  {
    group: "Little Fins",
    level: "Preschool 1",
    color: "White",
    diveStatus: "Beginner",
    gradient: "from-gray-50 to-gray-100/60",
    borderColor: "border-gray-300",
    accentColor: "text-gray-600",
    badgeBg: "bg-white",
    badgeRing: "ring-gray-300",
    letter: "BM",
    skills: [
      "Water comfort & safety introduction",
      "Guided submersion practice",
      "Supported floating",
      "Water entry & exit",
    ],
  },
  {
    group: "Reef Explorers",
    level: "Preschool 2",
    color: "Red",
    diveStatus: "Foundations",
    gradient: "from-red-50 to-red-100/60",
    borderColor: "border-red-200",
    accentColor: "text-red-600",
    badgeBg: "bg-red-50",
    badgeRing: "ring-red-300",
    letter: "RE",
    skills: [
      "Submersion for 5+ seconds",
      "Beginning independent floating",
      "Front & back float introduction",
      "Basic water safety skills",
    ],
  },
];

const schoolAgeCurriculum = [
  {
    group: "Sea Scouts",
    level: "School Age 1",
    color: "Yellow",
    diveStatus: "Beginner",
    gradient: "from-yellow-50 to-yellow-100/60",
    borderColor: "border-yellow-200",
    accentColor: "text-yellow-600",
    badgeBg: "bg-yellow-50",
    badgeRing: "ring-yellow-300",
    letter: "SS",
    skills: [
      "Beginner water comfort & submersion",
      "Independent floating introduction",
      "Basic kick drills",
      "Water safety fundamentals",
    ],
  },
  {
    group: "Deep Sea Divers",
    level: "School Age 2",
    color: "Blue",
    diveStatus: "Intermediate",
    gradient: "from-sky-50 to-sky-100/60",
    borderColor: "border-sky-200",
    accentColor: "text-sky-600",
    badgeBg: "bg-sky-50",
    badgeRing: "ring-sky-300",
    letter: "DD",
    skills: [
      "Independent front & back float",
      "Introduction to kicking drills",
      "Treading water introduction",
      "Basic stroke mechanics",
    ],
  },
  {
    group: "Ocean Masters",
    level: "School Age 3",
    color: "Green",
    diveStatus: "Advanced",
    gradient: "from-green-50 to-green-100/60",
    borderColor: "border-green-200",
    accentColor: "text-green-600",
    badgeBg: "bg-green-50",
    badgeRing: "ring-green-300",
    letter: "OM",
    skills: [
      "Treading water 10+ seconds",
      "Side-roll-side kick drill",
      "Multiple stroke development",
      "Endurance & swim completion",
    ],
  },
];

/* ───────── helpers ───────── */

interface SessionPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

interface SwimSession {
  id: string;
  swim_level: string;
  age_group: string | null;
  start_time: string;
  end_time: string;
  max_students: number;
  session_name: string | null;
  session_period_id: string | null;
  registration_status: string;
}

interface EnrollmentCount {
  session_id: string;
  count: number;
}

const levelOrder: Record<string, number> = { white: 0, red: 1, yellow: 2, blue: 3, green: 4 };

function formatTime(t: string) {
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${ampm}`;
}

function formatDate(d: string) {
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

const groupColors: Record<string, { bg: string; text: string; dot: string }> = {
  white: { bg: "bg-gray-100", text: "text-gray-700", dot: "bg-gray-400" },
  red: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-400" },
  yellow: { bg: "bg-yellow-50", text: "text-yellow-700", dot: "bg-yellow-400" },
  blue: { bg: "bg-sky-50", text: "text-sky-700", dot: "bg-sky-400" },
  green: { bg: "bg-green-50", text: "text-green-700", dot: "bg-green-400" },
};

/* ───────── curriculum card ───────── */

function CurriculumCard({ item, index }: { item: typeof preschoolCurriculum[0]; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1 }}
    >
      <Card className={`h-full border ${item.borderColor} bg-gradient-to-br ${item.gradient} hover:shadow-xl transition-all duration-300 overflow-hidden`}>
        <CardContent className="p-0">
          <div className="flex flex-col items-center pt-8 pb-4 px-6">
            <div className="mb-4 drop-shadow-md">
              <LevelBadge level={item.color.toLowerCase() as SwimLevel} size={112} />
            </div>
            <h3 className="font-display text-2xl font-bold text-foreground">{item.group}</h3>
            <div className="flex items-center gap-2 mt-1 mb-0.5">
              <span className={`text-sm font-semibold ${item.accentColor}`}>{item.level}</span>
              <span className="text-muted-foreground/40">•</span>
              <span className="text-xs text-muted-foreground font-medium">{item.color} Level</span>
            </div>
            <span className={`text-[11px] font-semibold uppercase tracking-wider ${item.accentColor}`}>
              🤿 {item.diveStatus}
            </span>
          </div>
          <div className="px-6 pb-6">
            <div className="border-t border-foreground/10 pt-4">
              <ul className="space-y-2.5">
                {item.skills.map((skill) => (
                  <li key={skill} className="flex items-start gap-2.5 text-sm text-foreground/80">
                    <Star className={`w-4 h-4 mt-0.5 shrink-0 fill-current ${item.accentColor}`} />
                    {skill}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ───────── schedule section ───────── */

function ScheduleSection() {
  const [periods, setPeriods] = useState<SessionPeriod[]>([]);
  const [sessions, setSessions] = useState<SwimSession[]>([]);
  const [counts, setCounts] = useState<EnrollmentCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const today = new Date().toISOString().slice(0, 10);
      const [periodsRes, sessionsRes] = await Promise.all([
        (supabase as any).from("session_periods_public").select("id, name, start_date, end_date").eq("is_active", true).gte("end_date", today).order("start_date"),
        supabase.from("swim_sessions").select("id, swim_level, age_group, start_time, end_time, max_students, session_name, session_period_id, registration_status").eq("is_active", true).eq("registration_status", "open").order("start_time"),
      ]);
      if (periodsRes.data) setPeriods(periodsRes.data);
      if (sessionsRes.data) setSessions(sessionsRes.data);
      const sessionIds = (sessionsRes.data || []).map((s) => s.id);
      if (sessionIds.length) {
        const { data: countsData } = await supabase.rpc("get_session_enrollment_counts", { _session_ids: sessionIds } as any);
        if (countsData) {
          setCounts((countsData as any[]).map((r: any) => ({ session_id: r.session_id, count: r.enrolled_count })));
        }
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (periods.length === 0) {
    return <p className="text-center text-muted-foreground">Schedule coming soon — check back later!</p>;
  }

  const getCount = (id: string) => counts.find((c) => c.session_id === id)?.count ?? 0;

  // Group sessions by time slot within a period, then by age group
  function renderPeriod(period: SessionPeriod) {
    const periodSessions = sessions.filter((s) => s.session_period_id === period.id);
    const preschool = periodSessions
      .filter((s) => s.age_group === "preschool-3-5")
      .sort((a, b) => a.start_time.localeCompare(b.start_time) || (levelOrder[a.swim_level] ?? 99) - (levelOrder[b.swim_level] ?? 99));
    const schoolAge = periodSessions
      .filter((s) => s.age_group === "school-age-6-12")
      .sort((a, b) => a.start_time.localeCompare(b.start_time) || (levelOrder[a.swim_level] ?? 99) - (levelOrder[b.swim_level] ?? 99));

    // Group by unique start_time
    function groupByTime(list: SwimSession[]) {
      const grouped = new Map<string, SwimSession[]>();
      list.forEach((s) => {
        const key = s.start_time;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(s);
      });
      return Array.from(grouped);
    }

    const preschoolTimes = groupByTime(preschool);
    const schoolAgeTimes = groupByTime(schoolAge);

    if (preschoolTimes.length === 0 && schoolAgeTimes.length === 0) return null;

    return (
      <Card key={period.id} className="p-6">
        <div className="flex items-center gap-2 mb-1">
          <Calendar className="w-5 h-5 text-primary" />
          <h3 className="font-display text-xl font-bold text-foreground">{period.name}</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          {formatDate(period.start_date)} – {formatDate(period.end_date)} · Mon & Wed · 30 min lessons
        </p>

        {preschoolTimes.length > 0 && (
          <>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              🐠 Preschool (Ages 3–5)
            </h4>
            <div className="space-y-2 mb-5">
              {preschoolTimes.map(([time, slots]) => (
                <TimeSlotRow key={time} time={time} slots={slots} getCount={getCount} />
              ))}
            </div>
          </>
        )}

        {schoolAgeTimes.length > 0 && (
          <>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              🏊 School-Age (Ages 6–12)
            </h4>
            <div className="space-y-2">
              {schoolAgeTimes.map(([time, slots]) => (
                <TimeSlotRow key={time} time={time} slots={slots} getCount={getCount} />
              ))}
            </div>
          </>
        )}
      </Card>
    );
  }

  return (
    <div className="grid gap-8 md:grid-cols-2 max-w-5xl mx-auto">
      {periods.map(renderPeriod)}
    </div>
  );
}

function TimeSlotRow({ time, slots, getCount }: { time: string; slots: SwimSession[]; getCount: (id: string) => number }) {
  return (
    <div className="flex items-start gap-3 py-2.5 px-3 rounded-lg bg-muted/50">
      <div className="flex items-center gap-1.5 min-w-[80px] pt-0.5">
        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">{formatTime(time)}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {slots.map((s) => {
          const enrolled = getCount(s.id);
          const spotsLeft = s.max_students - enrolled;
          const full = spotsLeft <= 0;
          const colors = groupColors[s.swim_level] ?? groupColors.blue;
          return (
            <span
              key={s.id}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                full ? "bg-muted text-muted-foreground line-through" : `${colors.bg} ${colors.text}`
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${full ? "bg-muted-foreground/40" : colors.dot}`} />
              {s.session_name || s.swim_level}
              {!full && (
                <span className="text-[10px] opacity-70">· {spotsLeft} {spotsLeft === 1 ? "spot" : "spots"}</span>
              )}
              {full && <span className="text-[10px]">Full</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ───────── main page ───────── */

const SwimLessons = () => {
  return (
    <main>
      <SEO
        title="Swim Lesson Levels & Pricing — Aquatic Dreams Swim Modesto"
        description="Explore our 5 color-coded swim levels for ages 3–12 with pricing, weekly schedule, and the Starfish Aquatics curriculum. Max 3 students per instructor."
        path="/swim-lessons"
      />
      {/* Hero */}
      <section className="bg-gradient-to-br from-primary/10 to-background py-20">
        <div className="container">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl">
            <p className="text-primary font-medium tracking-wider uppercase text-sm mb-3">Swim Lessons</p>
            <h1 className="font-display text-4xl md:text-6xl font-bold text-foreground mb-6">
              Where Every Swimmer<br />
              <span className="text-primary">Thrives</span>
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-xl">
              Five progressive groups based on the Starfish Aquatics system,
              maximum 3 students per instructor — because every child deserves to be seen in the water.
            </p>
            <Button asChild className="bg-coral hover:bg-coral/90 text-coral-foreground rounded-xl px-8 py-6 text-base">
              <Link to="/swim-enrollment">Find Your Level & Enroll</Link>
            </Button>
            <div className="mt-10 max-w-xl">
              <StarfishCurriculumBadge variant="stacked" className="md:items-start md:text-left" />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Key stats */}
      <section className="bg-secondary text-secondary-foreground py-12">
        <div className="container">
          <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16">
            <div className="text-center">
              <p className="text-sm text-secondary-foreground/60 uppercase tracking-wider mb-1">Max Class Size</p>
              <p className="font-display text-5xl font-bold text-primary">3</p>
              <p className="text-sm text-secondary-foreground/70">students per instructor</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-secondary-foreground/60 uppercase tracking-wider mb-1">Lesson Duration</p>
              <p className="font-display text-5xl font-bold text-primary">30</p>
              <p className="text-sm text-secondary-foreground/70">minutes per lesson</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-secondary-foreground/60 uppercase tracking-wider mb-1">Group Lesson</p>
              <p className="font-display text-5xl font-bold text-primary">$30</p>
              <p className="text-sm text-secondary-foreground/70">per lesson</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-secondary-foreground/60 uppercase tracking-wider mb-1">Private</p>
              <p className="font-display text-5xl font-bold text-primary">$65</p>
              <p className="text-sm text-secondary-foreground/70">per lesson</p>
            </div>
          </div>
          <div className="text-center mt-8 space-y-2">
            <p className="text-secondary-foreground/60 text-sm max-w-md mx-auto">
              Smaller classes mean more attention, faster progress, and a safer learning environment for every child.
            </p>
            <p className="text-secondary-foreground/70 text-sm flex items-center justify-center gap-1">
              <ShoppingBag className="w-4 h-4" />
              $45 registration fee — includes swim bag, swim cap & goggles
            </p>
          </div>
        </div>
      </section>

      {/* Refund Policy */}
      <section className="py-12 bg-background">
        <div className="container max-w-4xl">
          <div className="rounded-xl border border-border bg-card p-6 md:p-8">
            <h3 className="font-display text-2xl font-bold text-foreground mb-4">
              Pricing & Refund Policy
            </h3>
            <ul className="space-y-3 text-sm md:text-base text-muted-foreground leading-relaxed">
              <li>
                <strong className="text-foreground">Registration fee ($45):</strong> One-time and{" "}
                <strong>non-refundable</strong>. Includes swim bag, cap, and goggles.
              </li>
              <li>
                <strong className="text-foreground">New swimmers:</strong> $240 session fee is due on the{" "}
                <strong>first day of lessons</strong> (cash, check, or secure payment link).
              </li>
              <li>
                <strong className="text-foreground">Returning swimmers:</strong> $240 session fee is paid at the time of enrollment.
              </li>
              <li>
                <strong className="text-foreground">Session fee refunds:</strong> Non-refundable once paid, except in documented circumstances (illness with doctor's note, injury, relocation). Email{" "}
                <a href="mailto:info@aquaticdreamsswim.com" className="text-primary underline">
                  info@aquaticdreamsswim.com
                </a>{" "}
                <strong>before the second lesson</strong>; reviewed case-by-case and prorated when approved.
              </li>
              <li>
                <strong className="text-foreground">Missed lessons / no-shows:</strong> Not refunded, credited, or rescheduled as makeups.
              </li>
              <li>
                <strong className="text-foreground">Cancellations by Aquatic Dreams</strong> (weather, facility, instructor): We reschedule the lesson or issue a session credit.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Preschool Curriculum */}
      <section className="py-20">
        <div className="container">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-2">Ages 3–5</p>
            <h2 className="font-display text-3xl md:text-5xl font-bold text-foreground mb-4">Preschool Program</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              White & Red levels — building water comfort and safety foundations for our youngest swimmers.
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-2 max-w-3xl mx-auto">
            {preschoolCurriculum.map((item, i) => (
              <CurriculumCard key={item.group} item={item} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* School-Age Curriculum */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-2">Ages 6–12</p>
            <h2 className="font-display text-3xl md:text-5xl font-bold text-foreground mb-4">School-Age Program</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              Yellow → Blue → Green levels — progressing from beginner fundamentals through intermediate skills to advanced swimming.
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-3 max-w-5xl mx-auto">
            {schoolAgeCurriculum.map((item, i) => (
              <CurriculumCard key={item.group} item={item} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* Private lessons CTA */}
      <section className="bg-secondary text-secondary-foreground py-16">
        <div className="container text-center">
          <h2 className="font-display text-3xl font-bold mb-4">Private Lessons</h2>
          <p className="text-secondary-foreground/70 max-w-xl mx-auto mb-6">
            Want one on one attention? Book a private lesson online at $65 per lesson
            and pick your instructor, day, and time.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button asChild className="bg-coral hover:bg-coral/90 text-coral-foreground rounded-xl">
              <Link to="/book-private-lesson">Book a Private Lesson <ChevronRight className="ml-1 w-4 h-4" /></Link>
            </Button>
          </div>
        </div>
      </section>


      {/* Schedule */}
      <section className="py-20">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl font-bold text-foreground mb-3">Class Schedule</h2>
            <p className="text-muted-foreground">Monday & Wednesday · 30 minute lessons · Max 3 students per class</p>
            <p className="text-xs text-muted-foreground mt-1">Preschool and school-age times are staggered to ease parking</p>
            <Button asChild className="bg-coral hover:bg-coral/90 text-coral-foreground rounded-xl px-8 py-6 text-base mt-6">
              <Link to="/swim-enrollment">Enroll Now</Link>
            </Button>
          </div>

          <ScheduleSection />

          <div className="text-center mt-8">
            <p className="text-muted-foreground text-sm mb-2">
              <Users className="w-4 h-4 inline mr-1" /> Every class has a maximum of 3 students per instructor.
            </p>
            <p className="text-muted-foreground text-sm flex items-center justify-center gap-1">
              <DollarSign className="w-4 h-4" /> $30/lesson (group) · $65 (private)
            </p>
          </div>
        </div>
      </section>
    </main>
  );
};

export default SwimLessons;

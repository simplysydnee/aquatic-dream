import { useEffect, useState } from "react";
import SEO from "@/components/SEO";
import StarfishCurriculumBadge from "@/components/StarfishCurriculumBadge";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Users, Loader2, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import LevelBadge from "@/components/LevelBadge";
import type { SwimLevel } from "@/components/swim-enrollment/types";
import { MEMBERSHIP_AGREEMENT_TEXT } from "@/components/swim-enrollment/membership-agreement";

/* ───────── types ───────── */

type PlanKey = "private" | "kid_group" | "adult_group";

interface OpenSlot {
  id: string;
  plan_key: PlanKey;
  plan_name: string;
  monthly_price_cents: number | null;
  instructor_name: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  swim_level: string | null;
  accepted_levels: string[] | null;
  spots_left: number;
  is_full: boolean;
  /** Display-only private lesson gating from get-open-slots. */
  gated?: boolean;
}


/* ───────── static copy ─────────
   Prices, days and times are read live from standing_slots and
   membership_plans through the get-open-slots function. Only the
   descriptive one-liners below are hardcoded. */

const PROGRAM_ORDER: PlanKey[] = ["private", "kid_group", "adult_group"];

const PROGRAM_COPY: Record<PlanKey, { name: string; blurb: string }> = {
  private: { name: "Private Swim", blurb: "One-on-one · Ages 3 and up" },
  kid_group: { name: "Small Group", blurb: "Max 3 swimmers · Ages 3 to 17" },
  adult_group: { name: "Adult Swim", blurb: "2 adults max · 18 and over" },
};

const LEVELS: { level: SwimLevel; group: string; line: string }[] = [
  { level: "white", group: "Little Fins", line: "Water comfort, guided submersion, supported floating" },
  { level: "red", group: "Reef Explorers", line: "Longer submersion and beginning independent floating" },
  { level: "yellow", group: "Sea Scouts", line: "Independent floating and first kick drills" },
  { level: "blue", group: "Deep Sea Divers", line: "Treading water and basic stroke mechanics" },
  { level: "green", group: "Ocean Masters", line: "Multiple strokes, endurance, swim completion" },
];

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/* ───────── helpers ───────── */

function formatTime(t: string) {
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${ampm}`;
}

function meridiem(t: string) {
  return parseInt(t.split(":")[0], 10) >= 12 ? "PM" : "AM";
}

function bareTime(t: string) {
  return formatTime(t).replace(/ (AM|PM)$/, "");
}

/** "4:00 – 7:00 PM" (suffix collapsed when both ends share a meridiem). */
function formatRange(start: string, end: string) {
  return meridiem(start) === meridiem(end)
    ? `${bareTime(start)} – ${formatTime(end)}`
    : `${formatTime(start)} – ${formatTime(end)}`;
}

/** "4:00, 5:00, 6:00 PM" (trailing suffix only when all share a meridiem). */
function formatTimeList(times: string[]) {
  if (times.length === 0) return "";
  const all = meridiem(times[0]);
  if (times.every((t) => meridiem(t) === all)) {
    return `${times.map(bareTime).join(", ")} ${all}`;
  }
  return times.map(formatTime).join(", ");
}

/** Level rows for Small Group: Divers and Masters share a line. */
const LEVEL_ROWS: { label: string; levels: string[] }[] = [
  { label: "Little Fins", levels: ["white"] },
  { label: "Reef Explorers", levels: ["red"] },
  { label: "Sea Scouts", levels: ["yellow"] },
  { label: "Divers + Masters", levels: ["blue", "green"] },
];


function formatDollars(cents: number | null | undefined) {
  if (cents == null) return null;
  return `$${Math.round(cents / 100)}`;
}

/** Collapses a program's slots into "Tue, Wed, Thu 4:00-7:00 PM · Saturday 10:00 AM-1:00 PM". */
function summarizeWhen(slots: OpenSlot[]) {
  const byDay = new Map<number, { start: string; end: string }>();
  for (const s of slots) {
    const cur = byDay.get(s.day_of_week);
    if (!cur) {
      byDay.set(s.day_of_week, { start: s.start_time, end: s.end_time });
    } else {
      if (s.start_time < cur.start) cur.start = s.start_time;
      if (s.end_time > cur.end) cur.end = s.end_time;
    }
  }
  // Group consecutive-listed days that share the same window.
  const entries = Array.from(byDay.entries()).sort((a, b) => a[0] - b[0]);
  const groups: { days: number[]; start: string; end: string }[] = [];
  for (const [day, win] of entries) {
    const last = groups[groups.length - 1];
    if (last && last.start === win.start && last.end === win.end) {
      last.days.push(day);
    } else {
      groups.push({ days: [day], start: win.start, end: win.end });
    }
  }
  return groups
    .map((g) => {
      const days =
        g.days.length === 1
          ? DAY_NAMES[g.days[0]]
          : g.days.map((d) => DAY_NAMES[d].slice(0, 3)).join(", ");
      return `${days} ${formatTime(g.start)}–${formatTime(g.end)}`;
    })
    .join(" · ");
}

/* ───────── data ───────── */

function useOpenSlots() {
  const [slots, setSlots] = useState<OpenSlot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase.functions.invoke("get-open-slots", { body: {} });
      if (cancelled) return;
      const rows = ((data as { slots?: OpenSlot[] } | null)?.slots ?? []).filter((s) =>
        PROGRAM_ORDER.includes(s.plan_key),
      );
      setSlots(rows);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { slots, loading };
}

/* ───────── program cards ───────── */

function ProgramCards({ slots, loading }: { slots: OpenSlot[]; loading: boolean }) {
  return (
    <section className="py-16 bg-card border-y">
      <div className="container">
        <div className="text-center mb-10">
          <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-2">
            When each program runs
          </h2>
          <p className="text-muted-foreground">
            One weekly lesson, the same time and the same coach, billed monthly.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
            {PROGRAM_ORDER.map((key, i) => {
              const programSlots = slots.filter((s) => s.plan_key === key);
              const price = formatDollars(programSlots[0]?.monthly_price_cents);
              const when = summarizeWhen(programSlots);
              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                >
                  <Link to="/join" className="block h-full">
                    <Card className="h-full p-7 border-2 hover:border-primary/40 transition-all duration-300">
                      <div className="flex items-baseline justify-between gap-3 mb-1">
                        <h3 className="font-display text-2xl font-bold text-foreground">
                          {PROGRAM_COPY[key].name}
                        </h3>
                        {price && (
                          <span className="font-display text-2xl font-bold text-primary whitespace-nowrap">
                            {price}
                            <span className="text-sm font-medium text-muted-foreground">/mo</span>
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-4">{PROGRAM_COPY[key].blurb}</p>
                      <p className="text-sm font-medium text-foreground">
                        {when || "Times announced soon"}
                      </p>
                      <span className="mt-5 inline-flex items-center text-sm font-semibold text-coral">
                        Join <ChevronRight className="w-4 h-4 ml-1" />
                      </span>
                    </Card>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

/* ───────── schedule ───────── */

function FullNotice({ name }: { name: string }) {
  return (
    <p className="text-sm text-muted-foreground">
      {name} is currently full.{" "}
      <Link to="/join" className="text-primary underline underline-offset-4">
        Join the waitlist
      </Link>
      .
    </p>
  );
}

function OpenTimes({ slots, loading }: { slots: OpenSlot[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto items-start">
      {PROGRAM_ORDER.map((key) => {
        // Availability drives the times we list. Private lesson gating is
        // display only and must never make a program read as full, so the
        // FullNotice branch below is computed from the ungated list.
        const openAll = slots.filter((s) => s.plan_key === key && !s.is_full);
        const ungated = openAll.filter((s) => !s.gated);
        if (openAll.length > 0 && ungated.length === 0) {
          console.error("slot gating hid every open time — showing ungated list", key);
        }
        const open = ungated.length > 0 ? ungated : openAll;
        const days = Array.from(new Set(open.map((s) => s.day_of_week))).sort((a, b) => a - b);
        const isGroup = key === "kid_group";


        return (
          <Card key={key} className="p-5">
            <h3 className="font-display text-lg font-bold text-foreground mb-3">
              {PROGRAM_COPY[key].name}
              {isGroup && days.length === 1 && (
                <span className="font-sans text-sm font-medium text-muted-foreground">
                  {" "}
                  ({DAY_NAMES[days[0]]})
                </span>
              )}
            </h3>

            {open.length === 0 ? (
              <FullNotice name={PROGRAM_COPY[key].name} />
            ) : isGroup ? (
              <div className="space-y-3">
                {days.map((day) => {
                  const daySlots = open.filter((s) => s.day_of_week === day);
                  return (
                    <div key={day}>
                      {days.length > 1 && (
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                          {DAY_NAMES[day]}
                        </p>
                      )}
                      <dl className="space-y-1">
                        {LEVEL_ROWS.map((row) => {
                          const times = Array.from(
                            new Set(
                              daySlots
                                .filter((s) => s.swim_level && row.levels.includes(s.swim_level))
                                .map((s) => s.start_time),
                            ),
                          ).sort();
                          if (times.length === 0) return null;
                          return (
                            <div key={row.label} className="flex justify-between gap-3 text-sm">
                              <dt className="text-muted-foreground">{row.label}</dt>
                              <dd className="font-medium text-foreground text-right">
                                {formatTimeList(times)}
                              </dd>
                            </div>
                          );
                        })}
                      </dl>
                    </div>
                  );
                })}
              </div>
            ) : (
              <dl className="space-y-1">
                {days.map((day) => {
                  const daySlots = open.filter((s) => s.day_of_week === day);
                  const start = daySlots.reduce(
                    (min, s) => (s.start_time < min ? s.start_time : min),
                    daySlots[0].start_time,
                  );
                  const end = daySlots.reduce(
                    (max, s) => (s.end_time > max ? s.end_time : max),
                    daySlots[0].end_time,
                  );
                  return (
                    <div key={day} className="flex justify-between gap-3 text-sm">
                      <dt className="text-muted-foreground">{DAY_NAMES[day]}</dt>
                      <dd className="font-medium text-foreground text-right">
                        {formatRange(start, end)}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            )}
          </Card>
        );
      })}
    </div>
  );
}


/* ───────── page ───────── */

const SwimLessons = () => {
  const { slots, loading } = useOpenSlots();

  return (
    <main>
      <SEO
        title="Swim Memberships: Times & Monthly Pricing — Aquatic Dreams"
        description="Weekly swim lessons for kids and adults in Modesto on a flat monthly membership. See private, small group, and adult swim times, pricing, and open spots."
        path="/swim-lessons"
      />

      {/* Hero */}
      <section className="bg-gradient-to-br from-primary/10 to-background py-20">
        <div className="container">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl">
            <p className="text-primary font-medium tracking-wider uppercase text-sm mb-3">Times & pricing</p>
            <h1 className="font-display text-4xl md:text-6xl font-bold text-foreground mb-6">
              Your weekly spot,<br />
              <span className="text-primary">billed monthly</span>
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-xl">
              One lesson a week at the same time with the same coach, for kids and adults. A flat monthly
              rate, no re-registering, and a maximum of 3 swimmers per instructor.
            </p>
            <Button asChild className="bg-coral hover:bg-coral/90 text-coral-foreground rounded-xl px-8 py-6 text-base">
              <Link to="/join">Join</Link>
            </Button>
            <div className="mt-10 max-w-xl">
              <StarfishCurriculumBadge variant="stacked" className="md:items-start md:text-left" />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Programs */}
      <ProgramCards slots={slots} loading={loading} />

      {/* Open times */}
      <section className="py-12">
        <div className="container">
          <div className="text-center mb-6">
            <h2 className="font-display text-2xl md:text-3xl font-bold text-foreground mb-1">Open times</h2>
            <p className="text-sm text-muted-foreground">Live availability.</p>
          </div>

          <OpenTimes slots={slots} loading={loading} />

          <div className="text-center mt-8">

            <Button asChild className="bg-coral hover:bg-coral/90 text-coral-foreground rounded-xl px-8 py-6 text-base">
              <Link to="/join">Join</Link>
            </Button>
            <p className="text-muted-foreground text-sm mt-4 flex items-center justify-center gap-1">
              <Users className="w-4 h-4" /> Maximum of 3 swimmers per instructor.
            </p>
          </div>
        </div>
      </section>

      {/* Levels */}
      <section className="py-16 bg-muted/30">
        <div className="container max-w-5xl">
          <div className="text-center mb-10">
            <h2 className="font-display text-3xl font-bold text-foreground mb-3">Our levels</h2>
            <p className="text-muted-foreground">
              Not sure which level? The signup will ask a few questions and recommend one.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {LEVELS.map((l) => (
              <div key={l.level} className="flex items-center gap-3 rounded-xl border bg-card p-4">
                <LevelBadge level={l.level} size={48} className="shrink-0" />
                <div>
                  <p className="font-semibold text-foreground leading-tight">{l.group}</p>
                  <p className="text-sm text-muted-foreground leading-snug">{l.line}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Billing summary */}
      <section className="py-16">
        <div className="container max-w-4xl">
          <div className="rounded-xl border border-border bg-card p-6 md:p-8">
            <h2 className="font-display text-2xl font-bold text-foreground mb-4">
              Billing, closures, and cancellation
            </h2>
            <ul className="space-y-3 text-sm md:text-base text-muted-foreground leading-relaxed">
              <li>
                <strong className="text-foreground">Flat monthly rate.</strong> Your membership renews
                automatically on the 1st of each month. Some months have 4 lessons and some have 5; the
                rate does not change.
              </li>
              <li>
                <strong className="text-foreground">Cancel anytime with 30 days notice.</strong> You are
                charged for one more monthly cycle and stay enrolled through the end of that final paid
                month. Final months are charged in full and no partial refunds are issued.
              </li>
              <li>
                <strong className="text-foreground">Missed lessons.</strong> Lessons your swimmer misses
                are not refunded, credited, or made up.
              </li>
              <li>
                <strong className="text-foreground">Planned holiday closures.</strong> No class and no
                credit. Holiday weeks are already accounted for in the monthly rate.
              </li>
              <li>
                <strong className="text-foreground">Unexpected closures on our end.</strong> We issue an
                account credit for that lesson, applied to your next invoice. We do not schedule makeups.
              </li>
            </ul>
            <p className="text-sm text-muted-foreground mt-6">
              This is a summary. Where it and the membership agreement disagree, the agreement wins.{" "}
              <Dialog>
                <DialogTrigger asChild>
                  <button type="button" className="text-primary underline underline-offset-4">
                    Read the full membership agreement
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Membership agreement</DialogTitle>
                  </DialogHeader>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed">
                    {MEMBERSHIP_AGREEMENT_TEXT}
                  </p>
                </DialogContent>
              </Dialog>
              .
            </p>
          </div>
        </div>
      </section>
    </main>
  );
};

export default SwimLessons;

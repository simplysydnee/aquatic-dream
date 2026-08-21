import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import LevelBadge from "@/components/LevelBadge";
import { LEVEL_GROUP_NAMES, type SwimLevel } from "@/components/swim-enrollment/types";
import { LEVEL_FILL_CLASS } from "@/components/staff/staffTypes";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Check, ChevronDown, Waves } from "lucide-react";
import { cn } from "@/lib/utils";

const LEVEL_ORDER: SwimLevel[] = ["white", "red", "yellow", "blue", "green"];

const isLevel = (value: string | null | undefined): value is SwimLevel =>
  !!value && (LEVEL_ORDER as string[]).includes(value);

interface ChartSkill {
  skill_id: string;
  swim_level: string;
  position: number;
  kind: string;
  name: string;
  success_goal: string | null;
  mastered: boolean;
  met_at: string | null;
  met_by_first_name: string | null;
}

interface ChartNote {
  note_id: string;
  body: string;
  swim_level: string | null;
  instructor_first_name: string | null;
  created_at: string;
}

interface ChartResponse {
  swimmer: { first_name: string | null; current_level: string | null; is_active: boolean };
  skills: ChartSkill[];
  notes: ChartNote[];
  level_history: { from_level: string | null; to_level: string | null; reason: string | null; created_at: string }[];
}

const formatDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";

const formatLongDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

const SkillRow = ({ skill }: { skill: ChartSkill }) => (
  <li className="flex items-start gap-3 rounded-lg border bg-card p-3">
    <span
      className={cn(
        "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
        skill.mastered ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30 bg-muted",
      )}
      aria-hidden="true"
    >
      {skill.mastered ? <Check className="h-4 w-4" /> : <Waves className="h-3.5 w-3.5 text-muted-foreground" />}
    </span>
    <span className="min-w-0">
      <span className="block font-medium leading-snug text-foreground">{skill.name}</span>
      <span className="mt-0.5 block text-sm text-muted-foreground">
        {skill.mastered
          ? skill.met_by_first_name
            ? `Mastered by ${skill.met_by_first_name}, ${formatDate(skill.met_at)}`
            : `Mastered ${formatDate(skill.met_at)}`
          : "Still working on it"}
      </span>
    </span>
  </li>
);

const SwimmerChart = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<ChartResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data: res, error: fnError } = await supabase.functions.invoke<ChartResponse>(
        "get-swimmer-chart",
        { body: { token } },
      );
      if (cancelled) return;
      if (fnError || !res || !("swimmer" in (res as object))) {
        setError("This progress chart is not available.");
      } else {
        setData(res);
      }
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const currentLevel = isLevel(data?.swimmer.current_level) ? (data!.swimmer.current_level as SwimLevel) : null;
  const firstName = data?.swimmer.first_name ?? "your swimmer";

  const byLevel = useMemo(() => {
    const map = new Map<SwimLevel, ChartSkill[]>();
    for (const level of LEVEL_ORDER) map.set(level, []);
    for (const s of data?.skills ?? []) {
      if (isLevel(s.swim_level)) map.get(s.swim_level)!.push(s);
    }
    for (const list of map.values()) list.sort((a, b) => a.position - b.position);
    return map;
  }, [data]);

  const notesByLevel = useMemo(() => {
    const map = new Map<string, ChartNote[]>();
    for (const n of data?.notes ?? []) {
      const key = n.swim_level ?? "other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    }
    return map;
  }, [data]);

  const priorLevels = useMemo(() => {
    if (!currentLevel) return [];
    const currentIndex = LEVEL_ORDER.indexOf(currentLevel);
    return LEVEL_ORDER.slice(0, currentIndex).filter((level) =>
      (byLevel.get(level) ?? []).some((s) => s.mastered)
    );
  }, [currentLevel, byLevel]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <p className="text-muted-foreground">Loading progress…</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <p className="max-w-sm text-center text-muted-foreground">
          This progress chart is not available. Please check the link you were sent.
        </p>
      </main>
    );
  }

  const currentSkills = currentLevel ? byLevel.get(currentLevel) ?? [] : [];
  const masteredCount = currentSkills.filter((s) => s.mastered).length;
  const total = currentSkills.length || 6;
  const percent = Math.round((masteredCount / total) * 100);

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-lg space-y-8">
        <header className="text-center">
          <p className="text-sm uppercase tracking-wide text-muted-foreground">Swim progress</p>
          <h1 className="mt-1 text-3xl font-bold text-foreground">{firstName}</h1>
        </header>

        {currentLevel ? (
          <section className="rounded-2xl border bg-card p-6 text-center shadow-sm">
            <LevelBadge level={currentLevel} size={120} className="mx-auto" />
            <h2 className="mt-3 text-xl font-semibold text-foreground">{LEVEL_GROUP_NAMES[currentLevel]}</h2>
            <p className="mt-4 text-3xl font-bold text-foreground">
              {masteredCount} of {total} mastered
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{percent}% of this level</p>
            <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-all", LEVEL_FILL_CLASS[currentLevel])}
                style={{ width: `${percent}%` }}
              />
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border bg-card p-6 text-center shadow-sm">
            <Waves className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
            <h2 className="mt-3 text-xl font-semibold text-foreground">
              We are getting to know {firstName} in the water
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Once their instructor sets a level, every skill they master will show up right here.
            </p>
          </section>
        )}

        {currentLevel && (
          <section>
            <h3 className="mb-3 text-lg font-semibold text-foreground">Skills at this level</h3>
            <ul className="space-y-2">
              {currentSkills.map((skill) => (
                <SkillRow key={skill.skill_id} skill={skill} />
              ))}
            </ul>
          </section>
        )}

        {priorLevels.length > 0 && (
          <section>
            <h3 className="mb-3 text-lg font-semibold text-foreground">Earlier levels</h3>
            <div className="space-y-2">
              {priorLevels.map((level) => {
                const skills = byLevel.get(level) ?? [];
                const done = skills.filter((s) => s.mastered).length;
                return (
                  <Collapsible key={level} className="rounded-xl border bg-card">
                    <CollapsibleTrigger className="flex w-full items-center gap-3 p-4 text-left">
                      <LevelBadge level={level} size={44} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-foreground">{LEVEL_GROUP_NAMES[level]}</span>
                        <span className="block text-sm text-muted-foreground">
                          {done} of {skills.length} mastered
                        </span>
                      </span>
                      <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="px-4 pb-4">
                      <ul className="space-y-2">
                        {skills.map((skill) => (
                          <SkillRow key={skill.skill_id} skill={skill} />
                        ))}
                      </ul>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          </section>
        )}

        {data.notes.length > 0 && (
          <section>
            <h3 className="mb-3 text-lg font-semibold text-foreground">Notes from the instructors</h3>
            <div className="space-y-4">
              {[...notesByLevel.entries()].map(([level, notes]) => (
                <div key={level} className="rounded-xl border bg-card p-4">
                  <p className="mb-2 text-sm font-medium text-muted-foreground">
                    {isLevel(level) ? LEVEL_GROUP_NAMES[level] : "Lesson notes"}
                  </p>
                  <ul className="space-y-3">
                    {notes.map((note) => (
                      <li key={note.note_id}>
                        <p className="whitespace-pre-wrap text-foreground">{note.body}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {note.instructor_first_name ? `${note.instructor_first_name} · ` : ""}
                          {formatLongDate(note.created_at)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        <p className="pb-4 text-center text-xs text-muted-foreground">Aquatic Dreams · Swim. Dive. Dream.</p>
      </div>
    </main>
  );
};

export default SwimmerChart;

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { Check, Loader2 } from "lucide-react";
import LevelBadge from "@/components/LevelBadge";
import { LEVEL_GROUP_NAMES, type SwimLevel } from "@/components/swim-enrollment/types";
import { formatPhone, phoneHref } from "@/lib/phone";
import { StaffSwimmerNotes } from "./StaffSwimmerNotes";
import { StaffSkillCommentThread } from "./StaffSkillCommentThread";
import {
  LEVEL_BORDER_CLASS,
  LEVEL_FILL_CLASS,
  PLAN_LABELS,
  SKILL_KIND_LABELS,
  SKILL_STATE_LABELS,
  isNotAuthorized,
  type SkillDefinition,
  type SkillState,
  type StaffNoteRow,
  type StaffScheduleRow,
  type StaffSession,
  type StaffSkillCommentRow,
  type StaffSkillStateRow,
  type StaffSwimmerHeaderRow,
} from "./staffTypes";

const LEVEL_ORDER: SwimLevel[] = ["white", "red", "yellow", "blue", "green"];
const SKILL_STATES: SkillState[] = ["not_started", "emerging", "met"];
const UNDO_MS = 8000;

const ageFromDob = (dob: string | null): number | null => {
  if (!dob) return null;
  const [y, m, d] = dob.split("-").map(Number);
  if (!y || !m || !d) return null;
  const today = new Date();
  let age = today.getFullYear() - y;
  const beforeBirthday = today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
};

const formatMetDate = (iso: string | null): string => {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
};

interface Props {
  row: StaffScheduleRow;
  session: StaffSession;
  onBack: () => void;
}

export function StaffSwimmerScreen({ row, session, onBack }: Props) {
  const { toast } = useToast();
  const swimmerId = row.swimmer_id ?? "";

  const [header, setHeader] = useState<StaffSwimmerHeaderRow | null>(null);
  const [definitions, setDefinitions] = useState<SkillDefinition[]>([]);
  const [states, setStates] = useState<Record<string, StaffSkillStateRow>>({});
  const [notes, setNotes] = useState<StaffNoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notAuthorized, setNotAuthorized] = useState(false);
  const [showMedical, setShowMedical] = useState(false);
  const [savingSkillId, setSavingSkillId] = useState<string | null>(null);
  const [settingLevel, setSettingLevel] = useState(false);
  const [milestone, setMilestone] = useState<3 | 6 | null>(null);
  const [pendingMilestone, setPendingMilestone] = useState<3 | 6 | null>(null);

  const level = (header?.current_level as SwimLevel | null) ?? null;
  /** Skills may only be marked on a lesson that is still scheduled. */
  const canMark = row.status === "scheduled";

  const load = useCallback(async () => {
    if (!swimmerId) return;
    setLoading(true);
    setError(null);
    const [headerRes, skillsRes, notesRes] = await Promise.all([
      supabase.rpc("staff_swimmer_header", { p_swimmer_id: swimmerId }),
      supabase.rpc("staff_swimmer_skills", { p_swimmer_id: swimmerId }),
      supabase.rpc("staff_swimmer_notes", { p_swimmer_id: swimmerId }),
    ]);
    const rpcError = headerRes.error ?? skillsRes.error ?? notesRes.error;
    if (isNotAuthorized(rpcError?.message)) {
      setNotAuthorized(true);
      setLoading(false);
      return;
    }
    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }
    const headerRow = (headerRes.data as StaffSwimmerHeaderRow[] | null)?.[0] ?? null;
    setHeader(headerRow);
    const stateRows = (skillsRes.data ?? []) as StaffSkillStateRow[];
    setStates(Object.fromEntries(stateRows.map((s) => [s.skill_id, s])));
    setNotes((notesRes.data ?? []) as StaffNoteRow[]);
    setLoading(false);
  }, [swimmerId]);

  useEffect(() => {
    void load();
  }, [load]);

  // skill_definitions is public reference data and the only direct table read here.
  useEffect(() => {
    if (!level) {
      setDefinitions([]);
      return;
    }
    let cancelled = false;
    void supabase
      .from("skill_definitions")
      .select("id, swim_level, position, kind, name, success_goal")
      .eq("swim_level", level)
      .eq("is_active", true)
      .order("position", { ascending: true })
      .then(({ data, error: defError }) => {
        if (cancelled) return;
        if (defError) setError(defError.message);
        setDefinitions((data ?? []) as SkillDefinition[]);
      });
    return () => {
      cancelled = true;
    };
  }, [level]);

  const masteredCount = useMemo(
    () => definitions.filter((d) => states[d.id]?.state === "met").length,
    [definitions, states],
  );
  const total = definitions.length;
  const percent = total > 0 ? Math.round((masteredCount / total) * 100) : 0;

  const stateOf = (skillId: string): SkillState => states[skillId]?.state ?? "not_started";

  const applyState = (skillId: string, next: SkillState) => {
    setStates((prev) => {
      const existing = prev[skillId];
      const swimLevel = existing?.swim_level ?? level ?? "";
      return {
        ...prev,
        [skillId]: {
          skill_id: skillId,
          swim_level: swimLevel,
          state: next,
          met_at: next === "met" ? existing?.met_at ?? new Date().toISOString() : null,
          met_by_instructor_id: next === "met" ? existing?.met_by_instructor_id ?? session.instructorId : null,
          met_by_first_name: next === "met" ? existing?.met_by_first_name ?? session.instructorName.split(" ")[0] : null,
          updated_at: new Date().toISOString(),
        },
      };
    });
  };

  const deleteState = (skillId: string) => {
    setStates((prev) => {
      const copy = { ...prev };
      delete copy[skillId];
      return copy;
    });
  };

  const saveSkillState = async (skillId: string, next: SkillState): Promise<boolean> => {
    const { error: rpcError } = await supabase.rpc("staff_mark_skill", {
      p_swimmer_id: swimmerId,
      p_skill_id: skillId,
      p_state: next,
      p_instructor_id: session.instructorId,
      p_occurrence_id: row.occurrence_id,
    });
    if (rpcError) {
      toast({
        title: "Not saved",
        description: `${rpcError.message}. Check the wifi and tap again.`,
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  /** Optimistic mark with rollback on failure, plus an 8 second undo. */
  const markSkill = async (skillId: string, next: SkillState) => {
    if (!canMark) return;
    const snapshot = states[skillId];
    const previous: SkillState = snapshot?.state ?? "not_started";
    if (previous === next) return;

    const prevCount = definitions.filter((d) => states[d.id]?.state === "met").length;

    applyState(skillId, next); // optimistic
    setSavingSkillId(skillId);
    const saved = await saveSkillState(skillId, next);
    setSavingSkillId(null);

    if (!saved) {
      // rollback to the exact previous row
      setStates((prev) => {
        const copy = { ...prev };
        if (snapshot) copy[skillId] = snapshot;
        else delete copy[skillId];
        return copy;
      });
      return;
    }

    toast({
      title: `Marked ${SKILL_STATE_LABELS[next].toLowerCase()}`,
      duration: UNDO_MS,
      action: (
        <ToastAction
          altText="Undo"
          onClick={() => {
            // Restore the captured previous state locally, then persist it.
            if (previous === "not_started" && !snapshot) {
              deleteState(skillId);
            } else {
              applyState(skillId, previous);
            }
            void saveSkillState(skillId, previous).then((ok) => {
              if (!ok) {
                // The undo itself failed; restore the value we just showed.
                applyState(skillId, next);
              }
            });
          }}
        >
          Undo
        </ToastAction>
      ),
    });

    // Milestone check on the recomputed mastered count for the current level.
    // Only celebrate when the count INCREASES across a threshold.
    const nextCount = definitions.filter((d) =>
      d.id === skillId ? next === "met" : states[d.id]?.state === "met",
    ).length;
    if ((prevCount < 3 && nextCount === 3) || (prevCount < 6 && nextCount === 6)) {
      setMilestone(nextCount as 3 | 6);
      setPendingMilestone(null);
    }
  };

  const chooseLevel = async (nextLevel: SwimLevel) => {
    setSettingLevel(true);
    const { error: rpcError } = await supabase.rpc("staff_set_level", {
      p_swimmer_id: swimmerId,
      p_level: nextLevel,
      p_instructor_id: session.instructorId,
      p_reason: "initial",
    });
    setSettingLevel(false);
    if (rpcError) {
      toast({ title: "Level not set", description: rpcError.message, variant: "destructive" });
      return;
    }
    toast({ title: `Level set to ${LEVEL_GROUP_NAMES[nextLevel]}` });
    void load();
  };

  if (notAuthorized) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <h1 className="text-2xl font-semibold">Staff mode is not set up on this device.</h1>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const name = [header?.first_name, header?.last_name].filter(Boolean).join(" ") || "Swimmer";
  const age = ageFromDob(header?.dob ?? null);
  const programs = (header?.plan_keys ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => PLAN_LABELS[p] ?? p);

  return (
    <div className="mx-auto max-w-3xl p-4 pb-16 sm:p-6">
      <Button variant="outline" className="h-12 px-5 text-base" onClick={onBack}>
        Back to schedule
      </Button>

      {error && <p className="mt-4 text-destructive">{error}</p>}

      <Card className="mt-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold sm:text-4xl">{name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-base text-muted-foreground">
              {age !== null && <span>Age {age}</span>}
              {programs.map((p) => (
                <span key={p} className="rounded-full bg-muted px-3 py-1 text-sm font-medium text-foreground">
                  {p}
                </span>
              ))}
              {header?.has_medical && (
                <button
                  type="button"
                  onClick={() => setShowMedical((v) => !v)}
                  className="rounded-full bg-destructive/10 px-3 py-1 text-sm font-semibold text-destructive"
                >
                  Medical
                </button>
              )}
            </div>
            {header?.has_medical && showMedical && (
              <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-base text-destructive">
                {header.medical_notes || "No details recorded."}
              </p>
            )}
            <p className="mt-3 text-base text-muted-foreground">
              With {session.instructorName}
              {header?.parent_name ? ` · Parent: ${header.parent_name}` : ""}
              {header?.parent_phone ? " · " : ""}
              {header?.parent_phone && (
                <a className="font-medium text-primary underline" href={phoneHref(header.parent_phone)}>
                  {formatPhone(header.parent_phone)}
                </a>
              )}
            </p>
          </div>

          {level && (
            <div className="flex items-center gap-3">
              <LevelBadge level={level} size={64} />
              <span className="text-lg font-semibold">{LEVEL_GROUP_NAMES[level]}</span>
            </div>
          )}
        </div>

        {level && total > 0 && (
          <div className="mt-6">
            <p className="text-3xl font-bold">
              {masteredCount} of {total} mastered
            </p>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${LEVEL_FILL_CLASS[level]}`}
                  style={{ width: `${percent}%` }}
                />
              </div>
              <LevelBadge level={level} size={28} />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{percent}% of this level</p>
          </div>
        )}
      </Card>

      {pendingMilestone && (
        <Card className="mt-4 border-primary/50 bg-primary/5 p-4">
          <p className="text-base font-medium">
            {name} hit {pendingMilestone} of 6 in {level ? LEVEL_GROUP_NAMES[level] : "this level"}. You can send this to
            the family later.
          </p>
        </Card>
      )}

      {!level ? (
        <Card className="mt-6 p-6 text-center">
          <h2 className="text-2xl font-semibold">Set this swimmer's level to begin</h2>
          <p className="mt-2 text-base text-muted-foreground">Pick the group that fits them today.</p>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {LEVEL_ORDER.map((lvl) => (
              <button
                key={lvl}
                type="button"
                disabled={settingLevel}
                onClick={() => void chooseLevel(lvl)}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition hover:border-primary disabled:opacity-60 ${LEVEL_BORDER_CLASS[lvl]}`}
              >
                <LevelBadge level={lvl} size={56} />
                <span className="text-sm font-semibold">{LEVEL_GROUP_NAMES[lvl]}</span>
              </button>
            ))}
          </div>
        </Card>
      ) : (
        <div className="mt-6 space-y-3">
          {!canMark && (
            <p className="rounded-lg bg-muted p-3 text-base font-medium">
              This lesson is {row.status}. Skills cannot be marked.
            </p>
          )}
          {definitions.map((def) => {
            const current = stateOf(def.id);
            const record = states[def.id];
            return (
              <Card key={def.id} className={`border-l-8 p-4 ${LEVEL_BORDER_CLASS[level]}`}>
                <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {SKILL_KIND_LABELS[def.kind]}
                </p>
                <p className="mt-1 text-xl font-semibold">{def.name}</p>
                {def.success_goal && <p className="mt-1 text-base text-muted-foreground">{def.success_goal}</p>}

                <div className="mt-3 grid grid-cols-3 gap-2">
                  {SKILL_STATES.map((s) => {
                    const active = current === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        disabled={!canMark || savingSkillId === def.id}
                        onClick={() => void markSkill(def.id, s)}
                        className={`h-14 rounded-lg border-2 text-base font-semibold transition disabled:opacity-60 ${
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card hover:border-primary"
                        }`}
                      >
                        {SKILL_STATE_LABELS[s]}
                      </button>
                    );
                  })}
                </div>

                {current === "met" && (
                  <p className="mt-3 flex items-center gap-2 text-base font-medium text-primary">
                    <Check className="h-5 w-5" />
                    Mastered
                    {record?.met_by_first_name ? ` by ${record.met_by_first_name}` : ""}
                    {record?.met_at ? `, ${formatMetDate(record.met_at)}` : ""}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {swimmerId && (
        <StaffSwimmerNotes
          swimmerId={swimmerId}
          occurrenceId={row.occurrence_id}
          session={session}
          notes={notes}
          onNoteSaved={(note) => setNotes((prev) => [note, ...prev])}
        />
      )}

      <Dialog open={milestone !== null} onOpenChange={(open) => !open && setMilestone(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-2xl">
              {name} hit {milestone} of 6
            </DialogTitle>
            <DialogDescription className="text-base">
              {milestone === 6
                ? `Every skill in ${level ? LEVEL_GROUP_NAMES[level] : "this level"} is mastered.`
                : `Halfway through ${level ? LEVEL_GROUP_NAMES[level] : "this level"}.`}{" "}
              Share the news with the family?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="h-12 px-6 text-base"
              onClick={() => {
                setPendingMilestone(milestone);
                setMilestone(null);
              }}
            >
              Not yet
            </Button>
            <Button className="h-12 px-6 text-base" onClick={() => setMilestone(null)}>
              Send to family
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

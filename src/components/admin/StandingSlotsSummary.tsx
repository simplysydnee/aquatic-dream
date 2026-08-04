import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LEVEL_GROUP_NAMES } from "@/components/swim-enrollment/types";

type PlanKey = "kid_group" | "private" | "adult_group";
type SwimLevel = "white" | "red" | "yellow" | "blue" | "green";

export interface SummarySlot {
  id: string;
  plan_key: PlanKey;
  instructor_id: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  capacity: number;
  active: boolean;
  swim_level: SwimLevel | null;
  accepted_levels?: string[] | null;
}

interface Props {
  slots: SummarySlot[];
  occupancy: Record<string, number>;
  instructorNames: Record<string, string>;
  loading?: boolean;
  /** Clicking an open-time chip starts the phone-booking hold flow. */
  onHoldSlot?: (slotId: string) => void;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const LEVEL_ORDER: SwimLevel[] = ["white", "red", "yellow", "blue", "green"];
const LEVEL_COLOR_LABEL: Record<SwimLevel, string> = {
  white: "White",
  red: "Red",
  yellow: "Yellow",
  blue: "Blue",
  green: "Green",
};

const timeLabel = (t: string) => {
  const [h, m] = t.split(":").map((n) => parseInt(n, 10));
  if (Number.isNaN(h)) return t;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m ?? 0).padStart(2, "0")} ${ampm}`;
};

const acceptedLevelsOf = (s: SummarySlot): SwimLevel[] => {
  const list = (s.accepted_levels ?? []).filter((l): l is SwimLevel =>
    (LEVEL_ORDER as string[]).includes(l),
  );
  if (list.length) return LEVEL_ORDER.filter((l) => list.includes(l));
  return s.swim_level ? [s.swim_level] : [];
};

interface Tile {
  key: string;
  label: string;
  meta: string;
  open: number;
  capacity: number;
  slots: SummarySlot[];
  /** Private counts free coaches per time, everything else counts free seats. */
  countsCoaches: boolean;
}

export function StandingSlotsSummary({ slots, occupancy, instructorNames, loading, onHoldSlot }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [coachChoice, setCoachChoice] = useState<SummarySlot[] | null>(null);

  const openOf = (s: SummarySlot) => Math.max(0, s.capacity - (occupancy[s.id] ?? 0));

  const { tiles } = useMemo(() => {
    const activeSlots = slots.filter((s) => s.active);
    const open = (s: SummarySlot) => Math.max(0, s.capacity - (occupancy[s.id] ?? 0));
    const daysOf = (list: SummarySlot[]) =>
      Array.from(new Set(list.map((s) => s.day_of_week)))
        .sort((a, b) => a - b)
        .map((d) => DAY_NAMES[d].slice(0, 3))
        .join(", ");

    const result: Tile[] = [];

    for (const pk of ["private", "adult_group"] as PlanKey[]) {
      const list = activeSlots.filter((s) => s.plan_key === pk);
      if (!list.length) continue;
      result.push({
        key: pk,
        label: pk === "private" ? "Private swim" : "Adult swim",
        meta: daysOf(list),
        open: list.reduce((a, s) => a + open(s), 0),
        capacity: list.reduce((a, s) => a + s.capacity, 0),
        slots: list,
        countsCoaches: pk === "private",
      });
    }

    // Group tiles: one tile per distinct accepted-level set, so a blue+green
    // combined class is a single tile labelled for both.
    const buckets = new Map<string, { levels: SwimLevel[]; list: SummarySlot[] }>();
    for (const s of activeSlots.filter((x) => x.plan_key === "kid_group")) {
      const levels = acceptedLevelsOf(s);
      const key = levels.join("+") || "unset";
      const entry = buckets.get(key) ?? { levels, list: [] };
      entry.list.push(s);
      buckets.set(key, entry);
    }
    const ordered = Array.from(buckets.entries()).sort(
      (a, b) =>
        LEVEL_ORDER.indexOf(a[1].levels[0] ?? "white") - LEVEL_ORDER.indexOf(b[1].levels[0] ?? "white"),
    );
    for (const [key, { levels, list }] of ordered) {
      const names = levels.map((l) => LEVEL_GROUP_NAMES[l]).join(" + ") || "Unassigned level";
      const colors = levels.map((l) => LEVEL_COLOR_LABEL[l]).join(" + ");
      result.push({
        key: `kid_${key}`,
        label: names,
        meta: [colors, daysOf(list)].filter(Boolean).join(" · "),
        open: list.reduce((a, s) => a + open(s), 0),
        capacity: list.reduce((a, s) => a + s.capacity, 0),
        slots: list,
        countsCoaches: false,
      });
    }

    return { tiles: result, inactiveCount: slots.length - activeSlots.length };
  }, [slots, occupancy]);

  const activeTile = tiles.find((t) => t.key === selected) ?? null;

  const detail = useMemo(() => {
    if (!activeTile) return [];
    const byDay = new Map<number, SummarySlot[]>();
    for (const s of activeTile.slots) {
      const list = byDay.get(s.day_of_week) ?? [];
      list.push(s);
      byDay.set(s.day_of_week, list);
    }
    return Array.from(byDay.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([dow, list]) => {
        const byTime = new Map<string, SummarySlot[]>();
        for (const s of list) {
          const t = byTime.get(s.start_time) ?? [];
          t.push(s);
          byTime.set(s.start_time, t);
        }
        const times = Array.from(byTime.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([start, group]) => {
            const openSlots = group.filter((s) => openOf(s) > 0);
            const count = activeTile.countsCoaches
              ? openSlots.length
              : group.reduce((a, s) => a + openOf(s), 0);
            return { start, openSlots, count };
          });
        return {
          dow,
          chips: times.filter((t) => t.count > 0),
          fullCount: times.filter((t) => t.count === 0).length,
        };
      });
  }, [activeTile, occupancy]);

  const onChipClick = (openSlots: SummarySlot[]) => {
    if (!onHoldSlot) return;
    if (openSlots.length === 1) {
      onHoldSlot(openSlots[0].id);
      return;
    }
    setCoachChoice(openSlots);
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-foreground">What is open</h2>
        <span className="text-xs text-muted-foreground">Live capacity, tap a program for times</span>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">
        Tap an open time to hold it for a family and text them the signup link.
      </p>


      {loading ? (
        <p className="text-sm text-muted-foreground">Loading openings…</p>
      ) : tiles.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active slots.</p>
      ) : (
        <>
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
          >
            {tiles.map((t) => {
              const isSelected = t.key === selected;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    setCoachChoice(null);
                    setSelected(isSelected ? null : t.key);
                  }}
                  className={cn(
                    "rounded-md border bg-card p-3 text-left transition-colors",
                    isSelected ? "border-primary ring-1 ring-primary" : "hover:border-primary/50",
                  )}
                >
                  <div className="text-sm font-medium text-foreground">{t.label}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground truncate">{t.meta}</div>
                  <div className="mt-2 text-xs text-foreground tabular-nums">
                    <span className="text-base font-semibold">{t.open}</span> open of {t.capacity}
                  </div>
                </button>
              );
            })}
          </div>

          {activeTile && (
            <div className="rounded-md border bg-muted/30 p-3 space-y-3">
              <div className="text-sm font-medium text-foreground">{activeTile.label}</div>

              {coachChoice ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Two coaches are free at {timeLabel(coachChoice[0].start_time)}. Which one?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {coachChoice.map((s) => (
                      <Button
                        key={s.id}
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setCoachChoice(null);
                          onHoldSlot?.(s.id);
                        }}
                      >
                        {(s.instructor_id && instructorNames[s.instructor_id]) || "Unassigned"}
                      </Button>
                    ))}
                    <Button size="sm" variant="ghost" onClick={() => setCoachChoice(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                detail.map((d) => (
                  <div key={d.dow} className="flex flex-wrap items-center gap-2">
                    <span className="w-20 shrink-0 text-xs text-muted-foreground">{DAY_NAMES[d.dow]}</span>
                    {d.chips.map((c) => (
                      <button
                        key={c.start}
                        type="button"
                        onClick={() => onChipClick(c.openSlots)}
                        title="Hold this spot over the phone"
                        className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary hover:bg-primary/20"
                      >
                        {timeLabel(c.start)} · {c.count}
                      </button>
                    ))}
                    {d.chips.length === 0 && (
                      <span className="text-xs text-muted-foreground">No openings</span>
                    )}
                    {d.fullCount > 0 && (
                      <span className="text-xs text-muted-foreground">{d.fullCount} full</span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

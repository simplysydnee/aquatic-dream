import { useMemo } from "react";
import { Card } from "@/components/ui/card";
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

const Chip = ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => {
  const className = cn(
    "inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-foreground",
    onClick && "cursor-pointer transition-colors hover:border-primary hover:bg-primary/20",
  );
  if (!onClick) return <span className={className}>{children}</span>;
  return (
    <button type="button" className={className} onClick={onClick} title="Hold this spot over the phone">
      {children}
    </button>
  );
};


export function StandingSlotsSummary({ slots, occupancy, instructorNames, loading }: Props) {
  const data = useMemo(() => {
    const activeSlots = slots.filter((s) => s.active);
    const inactiveCount = slots.length - activeSlots.length;
    const open = (s: SummarySlot) => Math.max(0, s.capacity - (occupancy[s.id] ?? 0));

    const byInstructor = (planKey: PlanKey) => {
      const list = activeSlots.filter((s) => s.plan_key === planKey);
      const map = new Map<string, SummarySlot[]>();
      for (const s of list) {
        const name = (s.instructor_id && instructorNames[s.instructor_id]) || "Unassigned";
        (map.get(name) ?? map.set(name, []).get(name)!).push(s);
      }
      return Array.from(map.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, items]) => {
          const days = Array.from(new Set(items.map((s) => s.day_of_week)))
            .sort((a, b) => a - b)
            .map((dow) => {
              const dayItems = items
                .filter((s) => s.day_of_week === dow)
                .sort((a, b) => a.start_time.localeCompare(b.start_time));
              return {
                dow,
                openSlots: dayItems.filter((s) => open(s) > 0),
                fullCount: dayItems.filter((s) => open(s) === 0).length,
              };
            });
          const hasOpenings = days.some((d) => d.openSlots.length > 0);
          return { name, days, hasOpenings };
        });
    };

    const groupLevels = LEVEL_ORDER.map((level) => {
      const items = activeSlots
        .filter((s) => s.plan_key === "kid_group" && acceptedLevelsOf(s).includes(level))
        .sort((a, b) => a.start_time.localeCompare(b.start_time));
      return {
        level,
        openSlots: items.filter((s) => open(s) > 0),
        fullCount: items.filter((s) => open(s) === 0).length,
        total: items.length,
      };
    }).filter((g) => g.total > 0);

    return {
      inactiveCount,
      open,
      privateCards: byInstructor("private"),
      adultCards: byInstructor("adult_group"),
      groupLevels,
    };
  }, [slots, occupancy, instructorNames]);

  const renderInstructorSection = (
    title: string,
    cards: { name: string; days: { dow: number; openSlots: SummarySlot[]; fullCount: number }[]; hasOpenings: boolean }[],
  ) => (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-primary mb-2">{title}</h3>
      {cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active slots.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <div key={card.name} className="rounded-lg border bg-card p-3">
              <div className="font-medium text-sm text-foreground">{card.name}</div>
              {!card.hasOpenings ? (
                <p className="mt-2 text-xs text-muted-foreground">No openings</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {card.days
                    .filter((d) => d.openSlots.length > 0 || d.fullCount > 0)
                    .map((d) => (
                      <div key={d.dow}>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {DAY_NAMES[d.dow]}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {d.openSlots.map((s) => (
                            <Chip key={s.id}>
                              {timeLabel(s.start_time)} · {data.open(s)} open
                            </Chip>
                          ))}
                          {d.fullCount > 0 && (
                            <span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                              {d.fullCount} full
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Card className="p-4 space-y-5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">What is open</h2>
        <span className="text-xs text-muted-foreground">Openings by program, live capacity</span>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading openings…</p>
      ) : (
        <>
          {renderInstructorSection("Private Swim", data.privateCards)}
          {renderInstructorSection("Adult Swim", data.adultCards)}

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-primary mb-2">Small Group Swim</h3>
            {data.groupLevels.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active slots.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {data.groupLevels.map((g) => (
                  <div key={g.level} className="rounded-lg border bg-card p-3">
                    <div className="font-medium text-sm text-foreground">{LEVEL_GROUP_NAMES[g.level]}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {g.openSlots.map((s) => {
                        const levels = acceptedLevelsOf(s);
                        const combined = levels.length > 1;
                        return (
                          <Chip key={s.id}>
                            <span className={cn(combined && "font-semibold")}>
                              {timeLabel(s.start_time)} · {data.open(s)} of {s.capacity} open
                            </span>
                            {combined && (
                              <span className="ml-1.5 text-[11px] text-muted-foreground">
                                {levels.map((l) => LEVEL_GROUP_NAMES[l]).join(" + ")}
                              </span>
                            )}
                          </Chip>
                        );
                      })}
                      {g.openSlots.length === 0 && (
                        <span className="text-xs text-muted-foreground">No openings</span>
                      )}
                      {g.fullCount > 0 && (
                        <span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                          {g.fullCount} full
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {data.inactiveCount > 0 && (
            <p className="text-xs text-muted-foreground border-t pt-3">
              {data.inactiveCount} inactive slot{data.inactiveCount === 1 ? "" : "s"} held in reserve, not bookable.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

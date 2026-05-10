import { cn } from "@/lib/utils";

export type ActivityType =
  | "i-can-swim"
  | "swim"
  | "private-lesson"
  | "semi-private-lesson"
  | "dive-session"
  | "pool-rental";

interface FilterChip {
  type: ActivityType;
  label: string;
  bg: string;
  text: string;
}

const FILTER_CHIPS: FilterChip[] = [
  { type: "i-can-swim", label: "I Can Swim 209", bg: "#d4f0f8", text: "#2a5e84" },
  { type: "swim", label: "Swim Session", bg: "#d0ddf7", text: "#1a3a8a" },
  { type: "private-lesson", label: "Private Lesson", bg: "#EEEDFE", text: "#26215C" },
  { type: "semi-private-lesson", label: "Semi-Private", bg: "#FBEAF0", text: "#4B1528" },
  { type: "dive-session", label: "Dive Session", bg: "#FAEEDA", text: "#633806" },
  { type: "pool-rental", label: "Pool Rental", bg: "#F1EFE8", text: "#2C2C2A" },
];

interface Props {
  activeFilters: Set<ActivityType>;
  onToggle: (type: ActivityType) => void;
  onShowAll: () => void;
}

const CalendarFilterBar = ({ activeFilters, onToggle, onShowAll }: Props) => {
  const allActive = activeFilters.size === FILTER_CHIPS.length;
  const activeLabels = FILTER_CHIPS.filter((c) => activeFilters.has(c.type)).map((c) => c.label);

  return (
    <div className="space-y-1 max-w-full overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 pb-1 min-w-0">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mr-1">
          Filter:
        </span>
        {FILTER_CHIPS.map((chip) => {
          const isActive = activeFilters.has(chip.type);
          return (
            <button
              key={chip.type}
              onClick={() => onToggle(chip.type)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium transition-all border break-words text-left",
                isActive ? "shadow-sm" : "opacity-40 grayscale"
              )}
              style={{
                backgroundColor: chip.bg,
                color: chip.text,
                borderColor: isActive ? chip.text + "30" : "transparent",
              }}
            >
              {chip.label}
            </button>
          );
        })}
        {!allActive && (
          <button
            onClick={onShowAll}
            className="px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
          >
            Show all
          </button>
        )}
      </div>
      {!allActive && (
        <p className="text-xs text-muted-foreground pl-1">
          Showing: {activeLabels.join(", ")}
        </p>
      )}
    </div>
  );
};

export default CalendarFilterBar;
export { FILTER_CHIPS };

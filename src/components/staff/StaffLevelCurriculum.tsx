import { useState } from "react";
import { Card } from "@/components/ui/card";
import { ChevronDown } from "lucide-react";
import type { LevelCurriculumRow } from "./staffTypes";

interface Props {
  curriculum: LevelCurriculumRow | null;
}

/**
 * Equipment and review for the CURRENT level, rendered once above the skills list.
 * Collapsed by default so the six skill cards stay scannable.
 */
export function StaffLevelCurriculum({ curriculum }: Props) {
  const [open, setOpen] = useState(false);

  const equipment = curriculum?.equipment ?? [];
  const review = curriculum?.review ?? [];
  if (equipment.length === 0 && review.length === 0) return null;

  return (
    <Card className="p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="text-base font-semibold">Equipment &amp; review</span>
        <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {equipment.length > 0 && (
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Equipment</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-base">
                {equipment.map((item, i) => (
                  <li key={`${item}-${i}`}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {review.length > 0 && (
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Review</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-base">
                {review.map((item, i) => (
                  <li key={`${item}-${i}`}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

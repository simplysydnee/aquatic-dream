import { cn } from "@/lib/utils";
import type { SwimLevel } from "@/components/swim-enrollment/types";

import littleFins from "@/assets/level-badges/little-fins.png";
import reefExplorers from "@/assets/level-badges/reef-explorers.png";
import seaScouts from "@/assets/level-badges/sea-scouts.png";
import deepSeaDivers from "@/assets/level-badges/deep-sea-divers.png";
import oceanMasters from "@/assets/level-badges/ocean-masters.png";

const BADGES: Record<SwimLevel, { src: string; group: string }> = {
  white: { src: littleFins, group: "Little Fins" },
  red: { src: reefExplorers, group: "Reef Explorers" },
  yellow: { src: seaScouts, group: "Sea Scouts" },
  blue: { src: deepSeaDivers, group: "Deep Sea Divers" },
  green: { src: oceanMasters, group: "Ocean Masters" },
};

interface LevelBadgeProps {
  level: SwimLevel;
  size?: number;
  className?: string;
}

/**
 * Renders the official Aquatic Dreams group badge for a swim level.
 * Use for visual reinforcement on enrollment pages, rosters, and confirmations.
 */
export default function LevelBadge({ level, size = 96, className }: LevelBadgeProps) {
  const badge = BADGES[level];
  if (!badge) return null;
  return (
    <img
      src={badge.src}
      alt={`${badge.group} level badge`}
      width={size}
      height={size}
      className={cn("inline-block select-none", className)}
      style={{ width: size, height: size }}
      loading="lazy"
      draggable={false}
    />
  );
}

export { BADGES as LEVEL_BADGE_IMAGES };

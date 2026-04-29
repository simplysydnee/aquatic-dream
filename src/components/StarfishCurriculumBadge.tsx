import { cn } from "@/lib/utils";
import starfishLogo from "@/assets/starfish-aquatics-logo.png";

interface StarfishCurriculumBadgeProps {
  variant?: "inline" | "stacked" | "compact";
  className?: string;
  /** When true, wraps logo in a white rounded chip (use on dark backgrounds). */
  onDark?: boolean;
}

const ALT = "Starfish Aquatics Institute curriculum partner";

/**
 * Credits Starfish Aquatics Institute as our curriculum provider.
 * Use on public marketing surfaces (Swim Lessons page, Home, Footer).
 */
export default function StarfishCurriculumBadge({
  variant = "inline",
  className,
  onDark = false,
}: StarfishCurriculumBadgeProps) {
  const logoWrap = onDark ? "bg-white rounded-lg p-1.5" : "";

  if (variant === "stacked") {
    return (
      <div className={cn("flex flex-col items-center text-center gap-3", className)}>
        <div className={logoWrap}>
          <img src={starfishLogo} alt={ALT} className="h-24 w-auto" loading="lazy" />
        </div>
        <p className="text-sm md:text-base text-muted-foreground max-w-md">
          Proudly teaching the{" "}
          <span className="font-semibold text-foreground">
            Starfish Aquatics Institute
          </span>{" "}
          curriculum — <em>Swim Lessons Save Lives.</em>
        </p>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className={logoWrap}>
          <img src={starfishLogo} alt={ALT} className="h-8 w-auto" loading="lazy" />
        </div>
        <span className="text-xs opacity-80">
          Starfish Aquatics Institute curriculum partner
        </span>
      </div>
    );
  }

  // inline
  return (
    <div className={cn("flex items-center gap-4", className)}>
      <div className={logoWrap}>
        <img src={starfishLogo} alt={ALT} className="h-16 w-auto shrink-0" loading="lazy" />
      </div>
      <p className="text-sm text-muted-foreground">
        Proudly teaching the{" "}
        <span className="font-semibold text-foreground">
          Starfish Aquatics Institute
        </span>{" "}
        curriculum — <em>Swim Lessons Save Lives.</em>
      </p>
    </div>
  );
}

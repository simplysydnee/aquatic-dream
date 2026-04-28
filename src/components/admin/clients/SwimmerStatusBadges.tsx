import { Badge } from "@/components/ui/badge";
import type { SwimmerStatus } from "@/hooks/useSwimmers";
import { cn } from "@/lib/utils";

const toneClass: Record<SwimmerStatus["tone"], string> = {
  info: "bg-blue-50 text-blue-700 border-blue-300",
  success: "bg-green-50 text-green-700 border-green-300",
  warn: "bg-amber-50 text-amber-700 border-amber-300",
  muted: "bg-muted text-muted-foreground border-border",
  danger: "bg-red-50 text-red-700 border-red-300",
};

interface Props {
  statuses: SwimmerStatus[];
  className?: string;
}

export default function SwimmerStatusBadges({ statuses, className }: Props) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {statuses.map((s) => (
        <Badge key={s.key} variant="outline" className={cn("font-medium", toneClass[s.tone])}>
          {s.label}
        </Badge>
      ))}
    </div>
  );
}

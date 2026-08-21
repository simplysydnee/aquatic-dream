import { Button } from "@/components/ui/button";
import { Delete } from "lucide-react";

interface StaffPinPadProps {
  value: string;
  onChange: (next: string) => void;
  maxLength?: number;
  disabled?: boolean;
  label?: string;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** Large touch-first numeric keypad for pool-deck use. */
export function StaffPinPad({
  value,
  onChange,
  maxLength = 4,
  disabled = false,
  label,
}: StaffPinPadProps) {
  const press = (digit: string) => {
    if (disabled || value.length >= maxLength) return;
    onChange(value + digit);
  };

  const back = () => {
    if (disabled) return;
    onChange(value.slice(0, -1));
  };

  return (
    <div className="space-y-4">
      {label && <p className="text-center text-base font-medium text-muted-foreground">{label}</p>}
      <div className="flex justify-center gap-3" aria-label="PIN entry">
        {Array.from({ length: maxLength }).map((_, i) => (
          <div
            key={i}
            className={`h-5 w-5 rounded-full border-2 ${
              i < value.length ? "border-primary bg-primary" : "border-muted-foreground/40"
            }`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <Button
            key={k}
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => press(k)}
            className="h-20 text-3xl font-semibold"
          >
            {k}
          </Button>
        ))}
        <div />
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => press("0")}
          className="h-20 text-3xl font-semibold"
        >
          0
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={back}
          className="h-20"
          aria-label="Delete"
        >
          <Delete className="h-7 w-7" />
        </Button>
      </div>
    </div>
  );
}

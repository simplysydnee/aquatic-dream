import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

interface StaffPinPadProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  maxLength?: number;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** Large numeric keypad. Touch-first: 72px keys, no text input focus needed. */
export const StaffPinPad = ({
  label,
  value,
  onChange,
  disabled = false,
  maxLength = 4,
}: StaffPinPadProps) => {
  const press = (digit: string) => {
    if (disabled || value.length >= maxLength) return;
    onChange(value + digit);
  };

  return (
    <div className="space-y-4">
      <p className="text-center text-base font-medium text-muted-foreground">{label}</p>
      <div className="flex justify-center gap-3" aria-label="PIN entry progress">
        {Array.from({ length: maxLength }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-5 w-5 rounded-full border-2 border-primary",
              i < value.length && "bg-primary",
            )}
          />
        ))}
      </div>
      <div className="mx-auto grid max-w-xs grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <Button
            key={k}
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => press(k)}
            className="h-[72px] text-2xl font-semibold"
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
          className="h-[72px] text-2xl font-semibold"
        >
          0
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || value.length === 0}
          onClick={() => onChange(value.slice(0, -1))}
          aria-label="Delete last digit"
          className="h-[72px]"
        >
          <Delete className="h-6 w-6" />
        </Button>
      </div>
    </div>
  );
};

/** Convenience wrapper for screens that need their own local PIN buffer. */
export const useStaffPin = (maxLength = 4) => {
  const [pin, setPin] = useState("");
  return { pin, setPin, complete: pin.length === maxLength };
};

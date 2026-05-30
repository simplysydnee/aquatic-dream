import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import type { SwimmerCovered } from "@/lib/visitorWaiver";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const pad = (n: number) => String(n).padStart(2, "0");

const splitDob = (dob?: string | null) => {
  if (!dob) return { y: "", m: "", d: "" };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return { y: "", m: "", d: "" };
  return { y: m[1], m: m[2], d: m[3] };
};

const daysInMonth = (year: string, month: string) => {
  const y = parseInt(year, 10) || 2000;
  const mo = parseInt(month, 10);
  if (!mo) return 31;
  return new Date(y, mo, 0).getDate();
};

interface Props {
  swimmers: SwimmerCovered[];
  onChange: (next: SwimmerCovered[]) => void;
  errors?: Record<number, Partial<Record<keyof SwimmerCovered, string>>>;
}

const empty = (): SwimmerCovered => ({
  first_name: "",
  last_name: "",
  dob: "",
  relationship: "",
});

type DobParts = { y: string; m: string; d: string };

const SwimmersCoveredFields = ({ swimmers, onChange, errors = {} }: Props) => {
  const [dobParts, setDobParts] = useState<Record<number, DobParts>>(() => {
    const init: Record<number, DobParts> = {};
    swimmers.forEach((s, i) => { init[i] = splitDob(s.dob); });
    return init;
  });

  useEffect(() => {
    setDobParts((prev) => {
      const next = { ...prev };
      let changed = false;
      swimmers.forEach((s, i) => {
        if (!next[i]) {
          next[i] = splitDob(s.dob);
          changed = true;
        }
      });
      Object.keys(next).forEach((k) => {
        if (parseInt(k, 10) >= swimmers.length) {
          delete next[k as unknown as number];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [swimmers.length]);

  const setDobPart = (idx: number, key: keyof DobParts, value: string) => {
    const current = dobParts[idx] ?? splitDob(swimmers[idx]?.dob);
    const updated: DobParts = { ...current, [key]: value };
    const maxDay = daysInMonth(updated.y, updated.m);
    const dayNum = parseInt(updated.d, 10);
    if (dayNum && dayNum > maxDay) updated.d = "";

    setDobParts((prev) => ({ ...prev, [idx]: updated }));

    const dob = updated.y && updated.m && updated.d
      ? `${updated.y}-${updated.m}-${updated.d}`
      : "";
    onChange(swimmers.map((s, i) => (i === idx ? { ...s, dob } : s)));
  };

  const update = (idx: number, key: keyof SwimmerCovered, value: string) => {
    const next = swimmers.map((s, i) => (i === idx ? { ...s, [key]: value } : s));
    onChange(next);
  };
  const add = () => {
    if (swimmers.length >= 6) return;
    onChange([...swimmers, empty()]);
  };
  const remove = (idx: number) => {
    if (swimmers.length <= 1) return;
    onChange(swimmers.filter((_, i) => i !== idx));
    setDobParts((prev) => {
      const next: Record<number, DobParts> = {};
      swimmers.filter((_, i) => i !== idx).forEach((_, i) => {
        const sourceIdx = i >= idx ? i + 1 : i;
        next[i] = prev[sourceIdx] ?? { y: "", m: "", d: "" };
      });
      return next;
    });
  };

  return (
    <div className="border border-border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-foreground">Swimmers Covered</h4>
          <p className="text-xs text-muted-foreground">
            List everyone this waiver applies to. Add yourself if you'll be swimming.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={add}
          disabled={swimmers.length >= 6}
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> Add
        </Button>
      </div>

      <div className="space-y-3">
        {swimmers.map((s, idx) => {
          const parts = dobParts[idx] ?? splitDob(s.dob);
          const { y, m, d } = parts;
          const currentYear = new Date().getFullYear();
          const years = Array.from({ length: 100 }, (_, i) => String(currentYear - i));
          const maxDay = daysInMonth(y, m);
          return (
            <div
              key={idx}
              className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end border border-border/60 rounded-md p-3 bg-muted/20"
            >
              <div className="sm:col-span-3">
                <Label className="text-xs">First name</Label>
                <Input
                  value={s.first_name}
                  onChange={(e) => update(idx, "first_name", e.target.value)}
                  placeholder="First"
                />
                {errors[idx]?.first_name && (
                  <p className="text-xs text-destructive mt-1">{errors[idx]?.first_name}</p>
                )}
              </div>
              <div className="sm:col-span-3">
                <Label className="text-xs">Last name</Label>
                <Input
                  value={s.last_name}
                  onChange={(e) => update(idx, "last_name", e.target.value)}
                  placeholder="Last"
                />
                {errors[idx]?.last_name && (
                  <p className="text-xs text-destructive mt-1">{errors[idx]?.last_name}</p>
                )}
              </div>
              <div className="sm:col-span-3">
                <Label className="text-xs">Date of birth</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  <Select
                    value={m || undefined}
                    onValueChange={(val) => setDobPart(idx, "m", val)}
                  >
                    <SelectTrigger className="h-9 text-xs px-2">
                      <SelectValue placeholder="Month" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[280px]">
                      {MONTHS.map((name, i) => (
                        <SelectItem key={i} value={pad(i + 1)}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={d || undefined}
                    onValueChange={(val) => setDobPart(idx, "d", val)}
                  >
                    <SelectTrigger className="h-9 text-xs px-2">
                      <SelectValue placeholder="Day" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[280px]">
                      {Array.from({ length: maxDay }, (_, i) => (
                        <SelectItem key={i + 1} value={pad(i + 1)}>{i + 1}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={y || undefined}
                    onValueChange={(val) => setDobPart(idx, "y", val)}
                  >
                    <SelectTrigger className="h-9 text-xs px-2">
                      <SelectValue placeholder="Year" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[280px]">
                      {years.map((yr) => (
                        <SelectItem key={yr} value={yr}>{yr}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="sm:col-span-2">
                <Label className="text-xs">Relationship</Label>
                <Input
                  value={s.relationship || ""}
                  onChange={(e) => update(idx, "relationship", e.target.value)}
                  placeholder="Child, self…"
                />
              </div>
              <div className="sm:col-span-1 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(idx)}
                  disabled={swimmers.length <= 1}
                  aria-label="Remove swimmer"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SwimmersCoveredFields;

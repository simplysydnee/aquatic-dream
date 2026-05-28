import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, X } from "lucide-react";
import type { SwimmerCovered } from "@/lib/visitorWaiver";

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

const SwimmersCoveredFields = ({ swimmers, onChange, errors = {} }: Props) => {
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
        {swimmers.map((s, idx) => (
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
              <Input
                type="date"
                value={s.dob || ""}
                onChange={(e) => update(idx, "dob", e.target.value)}
              />
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
        ))}
      </div>
    </div>
  );
};

export default SwimmersCoveredFields;

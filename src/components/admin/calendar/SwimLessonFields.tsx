import { useState } from "react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CalendarIcon, ChevronDown, Plus, X, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { LEVEL_DISPLAY, type SwimLevel } from "@/components/swim-enrollment/types";

const SWIM_LEVELS: { value: SwimLevel; label: string }[] = [
  { value: "white", label: `White — ${LEVEL_DISPLAY.white.groupName}` },
  { value: "red", label: `Red — ${LEVEL_DISPLAY.red.groupName}` },
  { value: "yellow", label: `Yellow — ${LEVEL_DISPLAY.yellow.groupName}` },
  { value: "blue", label: `Blue — ${LEVEL_DISPLAY.blue.groupName}` },
  { value: "green", label: `Green — ${LEVEL_DISPLAY.green.groupName}` },
];

const DAYS_OF_WEEK = [
  { value: "monday", label: "Mon" },
  { value: "tuesday", label: "Tue" },
  { value: "wednesday", label: "Wed" },
  { value: "thursday", label: "Thu" },
  { value: "friday", label: "Fri" },
  { value: "saturday", label: "Sat" },
  { value: "sunday", label: "Sun" },
];

export interface SwimmerEntry {
  childName: string;
  childAge: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
}

export interface SwimLessonData {
  swimLevel: SwimLevel;
  maxStudents: number;
  recurring: boolean;
  frequency: "weekly" | "biweekly";
  recurDays: string[];
  endDate: Date | null;
  swimmers: SwimmerEntry[];
}

interface Props {
  data: SwimLessonData;
  onChange: (data: SwimLessonData) => void;
}

const emptySwimmer = (): SwimmerEntry => ({
  childName: "",
  childAge: "",
  parentName: "",
  parentEmail: "",
  parentPhone: "",
});

const SwimLessonFields = ({ data, onChange }: Props) => {
  const [swimmersOpen, setSwimmersOpen] = useState(false);

  const update = (partial: Partial<SwimLessonData>) => onChange({ ...data, ...partial });

  const updateSwimmer = (index: number, field: keyof SwimmerEntry, value: string) => {
    const swimmers = [...data.swimmers];
    swimmers[index] = { ...swimmers[index], [field]: value };
    update({ swimmers });
  };

  const addSwimmer = () => {
    update({ swimmers: [...data.swimmers, emptySwimmer()] });
    setSwimmersOpen(true);
  };

  const removeSwimmer = (index: number) => {
    update({ swimmers: data.swimmers.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-3">
      {/* Swim Level */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Swim Level</Label>
          <Select value={data.swimLevel} onValueChange={(v) => update({ swimLevel: v as SwimLevel })}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SWIM_LEVELS.map((l) => (
                <SelectItem key={l.value} value={l.value} className="text-xs">
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Max Students</Label>
          <Input
            type="number"
            min={1}
            max={10}
            value={data.maxStudents}
            onChange={(e) => update({ maxStudents: parseInt(e.target.value) || 3 })}
            className="h-8 text-xs"
          />
        </div>
      </div>

      {/* Recurrence toggle */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="recurring"
          checked={data.recurring}
          onCheckedChange={(c) => update({ recurring: !!c })}
        />
        <Label htmlFor="recurring" className="text-xs cursor-pointer">Make recurring</Label>
      </div>

      {data.recurring && (
        <div className="space-y-2 pl-1 border-l-2 border-primary/20 ml-1">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Frequency</Label>
              <Select value={data.frequency} onValueChange={(v) => update({ frequency: v as "weekly" | "biweekly" })}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly" className="text-xs">Weekly</SelectItem>
                  <SelectItem value="biweekly" className="text-xs">Biweekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-start text-xs h-8">
                    <CalendarIcon className="w-3 h-3 mr-1.5" />
                    {data.endDate ? format(data.endDate, "MMM d") : "Pick date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={data.endDate ?? undefined}
                    onSelect={(d) => update({ endDate: d ?? null })}
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Days</Label>
            <div className="flex flex-wrap gap-1.5">
              {DAYS_OF_WEEK.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => {
                    const next = data.recurDays.includes(day.value)
                      ? data.recurDays.filter((d) => d !== day.value)
                      : [...data.recurDays, day.value];
                    update({ recurDays: next });
                  }}
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-medium border transition-colors",
                    data.recurDays.includes(day.value)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                  )}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add Swimmers (collapsible) */}
      <Collapsible open={swimmersOpen} onOpenChange={setSwimmersOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add Swimmers ({data.swimmers.length})
            <ChevronDown className={cn("w-3 h-3 transition-transform", swimmersOpen && "rotate-180")} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 mt-2">
          {data.swimmers.map((swimmer, i) => (
            <div key={i} className="border rounded-md p-2 space-y-1.5 relative">
              <button
                type="button"
                onClick={() => removeSwimmer(i)}
                className="absolute top-1 right-1 p-0.5 rounded hover:bg-muted"
              >
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
              <div className="grid grid-cols-2 gap-1.5">
                <Input
                  value={swimmer.childName}
                  onChange={(e) => updateSwimmer(i, "childName", e.target.value)}
                  placeholder="Child name *"
                  className="h-7 text-xs"
                />
                <Input
                  type="number"
                  min={1}
                  max={18}
                  value={swimmer.childAge}
                  onChange={(e) => updateSwimmer(i, "childAge", e.target.value)}
                  placeholder="Age *"
                  className="h-7 text-xs"
                />
              </div>
              <Input
                value={swimmer.parentName}
                onChange={(e) => updateSwimmer(i, "parentName", e.target.value)}
                placeholder="Parent name *"
                className="h-7 text-xs"
              />
              <div className="grid grid-cols-2 gap-1.5">
                <Input
                  type="email"
                  value={swimmer.parentEmail}
                  onChange={(e) => updateSwimmer(i, "parentEmail", e.target.value)}
                  placeholder="Email *"
                  className="h-7 text-xs"
                />
                <Input
                  type="tel"
                  value={swimmer.parentPhone}
                  onChange={(e) => updateSwimmer(i, "parentPhone", e.target.value)}
                  placeholder="Phone"
                  className="h-7 text-xs"
                />
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="w-full text-xs" onClick={addSwimmer}>
            <Plus className="w-3 h-3 mr-1" /> Add Swimmer
          </Button>
          {data.swimmers.length === 0 && (
            <p className="text-[10px] text-muted-foreground text-center">
              You can add swimmers later from the calendar block.
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default SwimLessonFields;

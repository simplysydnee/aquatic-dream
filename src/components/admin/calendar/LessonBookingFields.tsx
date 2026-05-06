import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { CalendarIcon, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

const DAYS_OF_WEEK = [
  { value: "monday", label: "Mon" },
  { value: "tuesday", label: "Tue" },
  { value: "wednesday", label: "Wed" },
  { value: "thursday", label: "Thu" },
  { value: "friday", label: "Fri" },
  { value: "saturday", label: "Sat" },
  { value: "sunday", label: "Sun" },
];

export interface LessonBookingFieldsData {
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  childName: string;
  pricePerSession: number;
  recurring: boolean;
  frequency: "weekly" | "biweekly";
  recurDays: string[];
  endDate: Date | null;
  sendPaymentLink: boolean;
  billSeriesUpfront: boolean;
}

interface ClientOption {
  parent_name: string;
  parent_email: string;
  parent_phone: string | null;
  child_name: string;
  source: "booking" | "enrolled" | "inquiry";
}

const SOURCE_RANK: Record<ClientOption["source"], number> = {
  booking: 0,
  enrolled: 1,
  inquiry: 2,
};

const SOURCE_LABEL: Record<ClientOption["source"], string> = {
  booking: "Booking",
  enrolled: "Enrolled",
  inquiry: "Inquiry",
};

interface Props {
  lessonType: "private-lesson" | "semi-private-lesson";
  data: LessonBookingFieldsData;
  onChange: (d: LessonBookingFieldsData) => void;
}

const LessonBookingFields = ({ lessonType, data, onChange }: Props) => {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const update = (partial: Partial<LessonBookingFieldsData>) =>
    onChange({ ...data, ...partial });

  // Auto-update default price when lesson type changes (only if user hasn't typed)
  useEffect(() => {
    const defaultPrice = lessonType === "private-lesson" ? 65 : 45;
    if (data.pricePerSession !== 65 && data.pricePerSession !== 45) return;
    update({ pricePerSession: defaultPrice });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonType]);

  // Load existing clients (distinct families) from swim_enrollments
  useEffect(() => {
    (async () => {
      const { data: rows } = await supabase
        .from("swim_enrollments")
        .select("parent_name, parent_email, parent_phone, child_name")
        .order("created_at", { ascending: false })
        .limit(500);

      const seen = new Set<string>();
      const unique: ClientOption[] = [];
      (rows || []).forEach((r: any) => {
        const key = `${(r.parent_email || "").toLowerCase()}|${(r.child_name || "").toLowerCase().trim()}`;
        if (seen.has(key)) return;
        seen.add(key);
        unique.push(r);
      });
      setClients(unique);
    })();
  }, []);

  const selectClient = (c: ClientOption) => {
    update({
      parentName: c.parent_name || "",
      parentEmail: c.parent_email || "",
      parentPhone: c.parent_phone || "",
      childName: c.child_name || "",
    });
    setPickerOpen(false);
  };

  return (
    <div className="space-y-3">
      {/* Existing client picker */}
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="w-full justify-start text-xs h-8">
            <Search className="w-3 h-3 mr-1.5" />
            Pick existing client…
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0 z-[60]" align="start">
          <Command>
            <CommandInput placeholder="Search by parent, child, or email…" className="text-xs" />
            <CommandList>
              <CommandEmpty>No matches.</CommandEmpty>
              <CommandGroup heading={`Saved (${clients.length})`}>
                {clients.map((c, i) => (
                  <CommandItem
                    key={`${c.parent_email}-${c.child_name}-${i}`}
                    value={`${c.parent_name} ${c.child_name} ${c.parent_email}`}
                    onSelect={() => selectClient(c)}
                    className="text-xs flex flex-col items-start gap-0.5"
                  >
                    <span className="font-medium">{c.child_name} <span className="text-muted-foreground">— {c.parent_name}</span></span>
                    <span className="text-[10px] text-muted-foreground">{c.parent_email}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Client info */}
      <div className="grid grid-cols-2 gap-2">
        <Input
          value={data.childName}
          onChange={(e) => update({ childName: e.target.value })}
          placeholder="Swimmer name"
          className="h-8 text-xs"
        />
        <Input
          value={data.parentName}
          onChange={(e) => update({ parentName: e.target.value })}
          placeholder="Parent name *"
          className="h-8 text-xs"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="email"
          value={data.parentEmail}
          onChange={(e) => update({ parentEmail: e.target.value })}
          placeholder="Parent email *"
          className="h-8 text-xs"
        />
        <Input
          type="tel"
          value={data.parentPhone}
          onChange={(e) => update({ parentPhone: e.target.value })}
          placeholder="Parent phone"
          className="h-8 text-xs"
        />
      </div>

      {/* Price */}
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">Price per session ($)</Label>
        <Input
          type="number"
          min={0}
          step="0.01"
          value={data.pricePerSession}
          onChange={(e) => update({ pricePerSession: parseFloat(e.target.value) || 0 })}
          className="h-8 text-xs"
        />
      </div>

      {/* Recurring */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="lesson-recurring"
          checked={data.recurring}
          onCheckedChange={(c) => update({ recurring: !!c })}
        />
        <Label htmlFor="lesson-recurring" className="text-xs cursor-pointer">Recurring series</Label>
      </div>

      {data.recurring && (
        <div className="space-y-2 pl-1 border-l-2 border-primary/20 ml-1">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Frequency</Label>
              <Select value={data.frequency} onValueChange={(v) => update({ frequency: v as "weekly" | "biweekly" })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
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
                    {data.endDate ? format(data.endDate, "MMM d") : "Pick"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-[60]" align="start">
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

      {/* Bill series upfront (only meaningful when recurring) */}
      {data.recurring && (
        <div className="flex items-start gap-2 rounded-md bg-primary/5 p-2 border border-primary/20">
          <Checkbox
            id="bill-series-upfront"
            checked={data.billSeriesUpfront}
            onCheckedChange={(c) => update({ billSeriesUpfront: !!c })}
            className="mt-0.5"
          />
          <Label htmlFor="bill-series-upfront" className="text-xs cursor-pointer leading-snug">
            Charge entire series in one payment <span className="text-muted-foreground">(recommended — less to manage)</span>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              Otherwise a payment link is emailed before each lesson.
            </div>
          </Label>
        </div>
      )}

      {/* Send confirmation toggle */}
      <div className="flex items-start gap-2 rounded-md bg-muted/40 p-2 border">
        <Checkbox
          id="send-pay-link"
          checked={data.sendPaymentLink}
          onCheckedChange={(c) => update({ sendPaymentLink: !!c })}
          className="mt-0.5"
        />
        <Label htmlFor="send-pay-link" className="text-xs cursor-pointer leading-snug">
          {data.recurring && data.billSeriesUpfront
            ? "Email parent a confirmation + Stripe link for the full series"
            : data.recurring
            ? "Email parent a confirmation + Stripe link for the first lesson (subsequent get links 24h before each)"
            : "Email parent a confirmation + Stripe payment link"}
        </Label>
      </div>
    </div>
  );
};

export default LessonBookingFields;

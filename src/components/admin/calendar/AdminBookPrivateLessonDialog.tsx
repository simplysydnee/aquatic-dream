import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { getPrivateLessonPrice, isJunePromoDate } from "@/lib/privateLessonPricing";

interface Instructor { id: string; name: string }

interface Prefill {
  instructor_id?: string;
  instructor_name?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  pool_area?: string;
  lesson_type?: "private" | "semi_private";
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: Prefill | null;
  onBooked: () => void;
}

export default function AdminBookPrivateLessonDialog({ open, onOpenChange, prefill, onBooked }: Props) {
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [lessonType, setLessonType] = useState<"private" | "semi_private">("private");
  const [instructorId, setInstructorId] = useState<string>("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState("15:00");
  const [endTime, setEndTime] = useState("15:30");
  const [poolArea, setPoolArea] = useState("shallow");
  const [parentFirst, setParentFirst] = useState("");
  const [parentLast, setParentLast] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [childFirst, setChildFirst] = useState("");
  const [childLast, setChildLast] = useState("");
  const [childAge, setChildAge] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [seriesEnd, setSeriesEnd] = useState("");
  const [sendConfirmation, setSendConfirmation] = useState(true);
  const [collectCardOnFile, setCollectCardOnFile] = useState(true);
  const [priceOverride, setPriceOverride] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    supabase.rpc("get_active_instructors_public").then(({ data }) => {
      setInstructors(((data as any[]) || []).map((i) => ({ id: i.id, name: i.name })));
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Apply prefill / defaults
    if (prefill?.instructor_id) setInstructorId(prefill.instructor_id);
    if (prefill?.date) setDate(prefill.date);
    if (prefill?.start_time) setStartTime(prefill.start_time);
    if (prefill?.end_time) setEndTime(prefill.end_time);
    if (prefill?.pool_area) setPoolArea(prefill.pool_area);
    if (prefill?.lesson_type) setLessonType(prefill.lesson_type);
  }, [open, prefill]);

  const computedPrice = useMemo(
    () => getPrivateLessonPrice(lessonType, date),
    [lessonType, date],
  );
  const junePromo = isJunePromoDate(date);

  const reset = () => {
    setLessonType("private");
    setInstructorId("");
    setDate(format(new Date(), "yyyy-MM-dd"));
    setStartTime("15:00");
    setEndTime("15:30");
    setPoolArea("shallow");
    setParentFirst(""); setParentLast(""); setParentEmail(""); setParentPhone("");
    setChildFirst(""); setChildLast(""); setChildAge("");
    setNotes(""); setRecurring(false); setSeriesEnd("");
    setSendConfirmation(true); setCollectCardOnFile(true); setPriceOverride("");
  };

  const handleSubmit = async () => {
    if (!instructorId) { toast.error("Pick an instructor"); return; }
    if (!parentFirst || !parentLast || !parentEmail) { toast.error("Parent name and email required"); return; }
    if (recurring && !seriesEnd) { toast.error("Pick a series end date"); return; }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-private-booking", {
        body: {
          instructor_id: instructorId,
          lesson_type: lessonType,
          start_date: date,
          start_time: startTime,
          end_time: endTime,
          pool_area: poolArea,
          parent_name: `${parentFirst} ${parentLast}`.trim(),
          parent_first_name: parentFirst,
          parent_last_name: parentLast,
          parent_email: parentEmail.trim().toLowerCase(),
          parent_phone: parentPhone || null,
          child_name: childFirst || childLast ? `${childFirst} ${childLast}`.trim() : null,
          child_first_name: childFirst || null,
          child_last_name: childLast || null,
          child_age: childAge ? Number(childAge) : null,
          notes: notes || null,
          recurring,
          series_end: recurring ? seriesEnd : null,
          price_per_session: priceOverride ? Number(priceOverride) : undefined,
          send_confirmation: sendConfirmation,
          collect_card_on_file: collectCardOnFile,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      toast.success(
        `Booking created${(data as any)?.occurrences ? ` — ${(data as any).occurrences} lesson(s)` : ""}${sendConfirmation ? " — confirmation email sent" : ""}`
      );
      reset();
      onBooked();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to create booking");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Book Private Lesson</DialogTitle>
          <DialogDescription>
            Create a private or semi-private lesson booking. Confirmation email includes lesson dates, price, waiver link, and Add to Calendar.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {/* Lesson type + instructor */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Lesson type</Label>
              <Select value={lessonType} onValueChange={(v) => setLessonType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="semi_private">Semi-Private</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Instructor</Label>
              <Select value={instructorId} onValueChange={setInstructorId}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {instructors.map((i) => (
                    <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Date + times */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Start</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <Label>End</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>

          {/* Pool area + recurring */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Pool area</Label>
              <Select value={poolArea} onValueChange={setPoolArea}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="shallow">Shallow</SelectItem>
                  <SelectItem value="deep">Deep</SelectItem>
                  <SelectItem value="full">Full pool</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-3 pb-1">
              <div className="flex items-center gap-2">
                <Switch checked={recurring} onCheckedChange={setRecurring} id="recurring" />
                <Label htmlFor="recurring" className="cursor-pointer">Repeat weekly</Label>
              </div>
            </div>
          </div>
          {recurring && (
            <div>
              <Label>Series ends on</Label>
              <Input type="date" value={seriesEnd} onChange={(e) => setSeriesEnd(e.target.value)} min={date} />
              <p className="text-xs text-muted-foreground mt-1">A lesson will be created each week on the same day from {date} through this date.</p>
            </div>
          )}

          {/* Parent */}
          <div className="border-t pt-3 grid gap-3">
            <p className="text-sm font-semibold">Parent / Guardian</p>
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="First name" value={parentFirst} onChange={(e) => setParentFirst(e.target.value)} />
              <Input placeholder="Last name" value={parentLast} onChange={(e) => setParentLast(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input type="email" placeholder="Email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} />
              <Input placeholder="Phone" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} />
            </div>
          </div>

          {/* Child */}
          <div className="border-t pt-3 grid gap-3">
            <p className="text-sm font-semibold">Swimmer</p>
            <div className="grid grid-cols-3 gap-3">
              <Input placeholder="First name" value={childFirst} onChange={(e) => setChildFirst(e.target.value)} />
              <Input placeholder="Last name" value={childLast} onChange={(e) => setChildLast(e.target.value)} />
              <Input type="number" placeholder="Age" value={childAge} onChange={(e) => setChildAge(e.target.value)} />
            </div>
          </div>

          {/* Price + options */}
          <div className="border-t pt-3 grid gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Price per session</p>
              <div className="flex items-center gap-2">
                {junePromo && lessonType === "private" && (
                  <Badge variant="secondary">June promo: $50</Badge>
                )}
                <span className="text-sm text-muted-foreground">Default: ${computedPrice}</span>
              </div>
            </div>
            <Input
              type="number"
              placeholder={`Leave blank to use $${computedPrice}`}
              value={priceOverride}
              onChange={(e) => setPriceOverride(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              For recurring series, each occurrence is auto-priced at charge time ($50 in June, $65 otherwise for private).
            </p>
          </div>

          <div>
            <Label>Notes (internal + email)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Medical notes, special requests, etc." />
          </div>

          <div className="border-t pt-3 grid gap-2">
            <div className="flex items-center gap-2">
              <Switch checked={sendConfirmation} onCheckedChange={setSendConfirmation} id="send-conf" />
              <Label htmlFor="send-conf" className="cursor-pointer text-sm">
                Email confirmation to parent (lesson dates, price, waiver link, calendar links)
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={collectCardOnFile} onCheckedChange={setCollectCardOnFile} id="cof" />
              <Label htmlFor="cof" className="cursor-pointer text-sm">
                Include "Save card on file" link in the email
              </Label>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Parent saves their card via Stripe — we charge per lesson on the day of each session.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create booking
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

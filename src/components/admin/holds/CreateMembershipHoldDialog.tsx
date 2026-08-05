import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Search, UserPlus, Check, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/lib/phone";
import { LEVEL_GROUP_NAMES } from "@/components/swim-enrollment/types";
import { resolveSwimmerWaiver } from "@/lib/swimmerWaiver";
import { useFamilySearch, type FamilyMatch } from "@/hooks/useFamilySearch";

export interface HoldSlotTarget {
  id: string;
  plan_key: "kid_group" | "private" | "adult_group";
  day_of_week: number;
  start_time: string;
  end_time?: string | null;
  instructor_name?: string | null;
  monthly_price_cents?: number | null;
  swim_level?: string | null;
  accepted_levels?: string[] | null;
  spots_left?: number | null;
}

interface Props {
  slot: HoldSlotTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PLAN_LABELS: Record<string, string> = {
  kid_group: "Small Group Swim",
  private: "Private Swim",
  adult_group: "Adult Swim",
};
const HOLD_HOURS = 48;

const fmtTime = (t: string) => {
  const [h, m] = t.split(":").map((n) => parseInt(n, 10));
  if (Number.isNaN(h)) return t;
  const period = h >= 12 ? "PM" : "AM";
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m ?? 0).padStart(2, "0")} ${period}`;
};

const splitName = (full?: string | null) => {
  const parts = (full || "").trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] || "", last: parts.slice(1).join(" ") };
};

const SOURCE_LABELS: Record<FamilyMatch["source"], string> = {
  membership: "Membership",
  booking: "Private lesson",
  enrollment: "Session enrollment",
  request: "Lesson request",
};


export function CreateMembershipHoldDialog({ slot, open, onOpenChange, onCreated }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [query, setQuery] = useState("");
  const [matched, setMatched] = useState<FamilyMatch | null>(null);
  const [form, setForm] = useState({
    swimmer_name: "",
    parent_name: "",
    parent_phone: "",
    parent_email: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  // Waiver already on file for the matched swimmer, if we can find one.
  const [waiverId, setWaiverId] = useState<string | null>(null);
  const [waiverChecking, setWaiverChecking] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setQuery("");
    setMatched(null);
    setForm({ swimmer_name: "", parent_name: "", parent_phone: "", parent_email: "", notes: "" });
    setWaiverId(null);
    setWaiverChecking(false);
  }, [open]);


  // Phone first, then name or email. Same sources the booking wizard searches.
  const { results, searching } = useFamilySearch(query);


  const pick = (r: FamilyMatch) => {
    setMatched(r);
    setWaiverId(null);
    // Attach the family's active waiver when we can match one, so the parent's
    // page can skip the legal step. No match simply means "not yet known".
    if (r.child_dob) {
      const { first, last } = splitName(r.swimmer_name);
      setWaiverChecking(true);
      void resolveSwimmerWaiver({
        firstName: first,
        lastName: last,
        dob: r.child_dob,
        parentEmail: r.parent_email,
        parentPhone: r.parent_phone,
      })
        .then((status) => setWaiverId(status.waiverId))
        .finally(() => setWaiverChecking(false));
    }
    setForm((prev) => ({
      ...prev,
      swimmer_name: r.swimmer_name,
      parent_name: r.parent_name,
      parent_phone: r.parent_phone || "",
      parent_email: r.parent_email || "",
    }));
    setStep(2);
  };

  const swimLevel = useMemo(() => {
    if (!slot || slot.plan_key !== "kid_group") return null;
    const accepted = (slot.accepted_levels || []).filter(Boolean);
    if (accepted.length === 1) return accepted[0];
    return accepted.length === 0 ? slot.swim_level ?? null : null;
  }, [slot]);

  const canSubmit =
    !!slot &&
    form.swimmer_name.trim().length > 1 &&
    form.parent_name.trim().length > 1 &&
    form.parent_phone.replace(/\D/g, "").length >= 10;

  const submit = async () => {
    if (!slot || !canSubmit) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-membership-hold", {
        body: {
          standing_slot_id: slot.id,
          swimmer_name: form.swimmer_name.trim(),
          parent_name: form.parent_name.trim(),
          parent_phone: form.parent_phone.trim(),
          parent_email: form.parent_email.trim() || null,
          swim_level: swimLevel,
          existing_waiver_id: waiverId,
          notes: form.notes.trim() || null,
          hold_hours: HOLD_HOURS,
        },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Could not create hold");
      if (data?.sms_sent === false) {
        toast.warning(`Hold created, but the text did not send (${data?.sms_error || "unknown"})`);
      } else {
        toast.success("Spot held and text sent");
      }
      onCreated?.();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || "Could not create hold");
    } finally {
      setSubmitting(false);
    }
  };

  const expiryLabel = new Date(Date.now() + HOLD_HOURS * 60 * 60 * 1000).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Hold this spot and text the parent</DialogTitle>
        </DialogHeader>

        {slot && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="font-medium">{PLAN_LABELS[slot.plan_key]}</div>
            <div className="text-muted-foreground">
              {DAYS[slot.day_of_week]} · {fmtTime(slot.start_time)}
              {slot.instructor_name ? ` · ${slot.instructor_name}` : ""}
            </div>
            {slot.plan_key === "kid_group" && (slot.accepted_levels?.length || slot.swim_level) && (
              <div className="text-xs text-muted-foreground mt-0.5">
                {(slot.accepted_levels?.length ? slot.accepted_levels : [slot.swim_level!])
                  .map((l) => LEVEL_GROUP_NAMES[l as keyof typeof LEVEL_GROUP_NAMES] ?? l)
                  .join(" + ")}
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <Label>Find the family by phone, name, or email</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                className="pl-8"
                placeholder="209-555-0134"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {searching && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Searching
              </p>
            )}
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {results.map((r, i) => (
                <button
                  key={`${r.source}-${i}`}
                  onClick={() => pick(r)}
                  className="w-full text-left rounded-md border p-2.5 hover:border-primary hover:bg-primary/5"
                >
                  <div className="text-sm font-medium">{r.swimmer_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.parent_name || "No parent name"}
                    {r.parent_phone ? ` · ${formatPhone(r.parent_phone)}` : ""}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{SOURCE_LABELS[r.source]}</div>
                </button>
              ))}
              {!searching && query.trim().length >= 2 && results.length === 0 && (
                <p className="text-xs text-muted-foreground">No match found.</p>
              )}
            </div>
            <Button variant="outline" className="w-full" onClick={() => setStep(2)}>
              <UserPlus className="mr-2 h-4 w-4" /> New family
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            {matched && (
              <div className="flex items-center gap-2 rounded-md border border-primary bg-primary/5 p-2 text-xs">
                <Check className="h-4 w-4 text-primary" />
                Matched to an existing family. Their page will prefill.
              </div>
            )}
            <div>
              <Label>Swimmer name</Label>
              <Input
                value={form.swimmer_name}
                onChange={(e) => setForm({ ...form, swimmer_name: e.target.value })}
              />
            </div>
            <div>
              <Label>Parent name</Label>
              <Input
                value={form.parent_name}
                onChange={(e) => setForm({ ...form, parent_name: e.target.value })}
              />
            </div>
            <div>
              <Label>Parent phone</Label>
              <Input
                value={form.parent_phone}
                onChange={(e) => setForm({ ...form, parent_phone: e.target.value })}
                placeholder="209-555-0134"
              />
            </div>
            <div>
              <Label>Parent email (optional)</Label>
              <Input
                value={form.parent_email}
                onChange={(e) => setForm({ ...form, parent_email: e.target.value })}
              />
            </div>
            <div>
              <Label>Notes for staff (optional)</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {waiverChecking
                ? "Checking for a waiver on file…"
                : waiverId
                ? "Waiver already on file. The parent completes the agreement and card on their own device."
                : "The parent completes the waiver, agreement, and card on their own device."}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button className="flex-1" disabled={!canSubmit} onClick={() => setStep(3)}>
                Review
              </Button>
            </div>
          </div>
        )}

        {step === 3 && slot && (
          <div className="space-y-3">
            <div className="rounded-md border p-3 text-sm space-y-1">
              <Row label="Swimmer" value={form.swimmer_name} />
              <Row label="Parent" value={form.parent_name} />
              <Row label="Phone" value={formatPhone(form.parent_phone)} />
              {form.parent_email && <Row label="Email" value={form.parent_email} />}
              <Row label="Program" value={PLAN_LABELS[slot.plan_key]} />
              <Row label="Day and time" value={`${DAYS[slot.day_of_week]} ${fmtTime(slot.start_time)}`} />
              {slot.instructor_name && <Row label="Instructor" value={slot.instructor_name} />}
              {typeof slot.monthly_price_cents === "number" && (
                <Row label="Monthly" value={`$${(slot.monthly_price_cents / 100).toFixed(0)}`} />
              )}
              <Row label="Waiver" value={waiverId ? "On file" : "Parent signs on their device"} />
              <Row label="Hold expires" value={expiryLabel} />
            </div>
            <p className="text-xs text-muted-foreground">
              One text goes out now with a link to finish enrollment. No card is taken here.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)} disabled={submitting}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button className="flex-1" onClick={submit} disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Hold spot and send text
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className={cn("flex justify-between gap-3")}>
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium text-right">{value}</span>
  </div>
);

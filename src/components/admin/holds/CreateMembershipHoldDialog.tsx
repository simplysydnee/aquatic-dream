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
import { lookupActiveWaiver } from "@/lib/swimmerWaiver";

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

type FamilyMatch = {
  parent_name: string;
  parent_email: string | null;
  parent_phone: string | null;
  swimmer_name: string;
  child_dob: string | null;
  source: "membership" | "booking" | "enrollment" | "request";
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
  const [results, setResults] = useState<FamilyMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [matched, setMatched] = useState<FamilyMatch | null>(null);
  const [form, setForm] = useState({
    swimmer_name: "",
    parent_name: "",
    parent_phone: "",
    parent_email: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setQuery("");
    setResults([]);
    setMatched(null);
    setForm({ swimmer_name: "", parent_name: "", parent_phone: "", parent_email: "", notes: "" });
  }, [open]);

  // Phone first, then name or email. Same sources the booking wizard searches.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const digits = q.replace(/\D/g, "");
    const like = `%${q}%`;
    const phoneLike = digits.length >= 3 ? `%${digits}%` : null;

    (async () => {
      const [mem, bk, en, rq] = await Promise.all([
        supabase
          .from("memberships")
          .select("parent_first_name,parent_last_name,parent_email,parent_phone,child_first_name,child_last_name,child_dob,created_at")
          .or(
            [
              `parent_email.ilike.${like}`,
              `parent_first_name.ilike.${like}`,
              `parent_last_name.ilike.${like}`,
              `child_first_name.ilike.${like}`,
              `child_last_name.ilike.${like}`,
              `parent_phone.ilike.${like}`,
              ...(phoneLike ? [`parent_phone.ilike.${phoneLike}`] : []),
            ].join(","),
          )
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("lesson_bookings")
          .select("parent_first_name,parent_last_name,parent_email,parent_phone,child_first_name,child_last_name,child_dob,updated_at")
          .or(
            [
              `parent_email.ilike.${like}`,
              `parent_first_name.ilike.${like}`,
              `parent_last_name.ilike.${like}`,
              `child_first_name.ilike.${like}`,
              `child_last_name.ilike.${like}`,
              `parent_phone.ilike.${like}`,
              ...(phoneLike ? [`parent_phone.ilike.${phoneLike}`] : []),
            ].join(","),
          )
          .order("updated_at", { ascending: false })
          .limit(20),
        supabase
          .from("swim_enrollments")
          .select("parent_first_name,parent_last_name,parent_email,parent_phone,child_first_name,child_last_name,child_dob,updated_at")
          .or(
            [
              `parent_email.ilike.${like}`,
              `parent_first_name.ilike.${like}`,
              `parent_last_name.ilike.${like}`,
              `child_first_name.ilike.${like}`,
              `child_last_name.ilike.${like}`,
              `parent_phone.ilike.${like}`,
              ...(phoneLike ? [`parent_phone.ilike.${phoneLike}`] : []),
            ].join(","),
          )
          .order("updated_at", { ascending: false })
          .limit(20),
        supabase
          .from("lesson_requests")
          .select("parent_name,parent_email,parent_phone,child_name,created_at")
          .or(
            [
              `parent_email.ilike.${like}`,
              `parent_name.ilike.${like}`,
              `child_name.ilike.${like}`,
              `parent_phone.ilike.${like}`,
              ...(phoneLike ? [`parent_phone.ilike.${phoneLike}`] : []),
            ].join(","),
          )
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      if (cancelled) return;

      const map = new Map<string, FamilyMatch>();
      const add = (row: Record<string, unknown>, source: FamilyMatch["source"]) => {
        let parentName = "";
        let swimmerName = "";
        if (source === "request") {
          parentName = String(row.parent_name || "").trim();
          swimmerName = String(row.child_name || "").trim();
        } else {
          parentName = `${row.parent_first_name || ""} ${row.parent_last_name || ""}`.trim();
          swimmerName = `${row.child_first_name || ""} ${row.child_last_name || ""}`.trim();
        }
        if (!swimmerName) return;
        const email = String(row.parent_email || "").toLowerCase().trim() || null;
        const phone = (row.parent_phone as string | null) || null;
        const key = `${email || phone || parentName}|${swimmerName.toLowerCase()}`;
        if (map.has(key)) return;
        map.set(key, {
          parent_name: parentName,
          parent_email: email,
          parent_phone: phone,
          swimmer_name: swimmerName,
          child_dob: (row.child_dob as string | null) || null,
          source,
        });
      };
      (mem.data || []).forEach((row) => add(row, "membership"));
      (bk.data || []).forEach((row) => add(row, "booking"));
      (en.data || []).forEach((row) => add(row, "enrollment"));
      (rq.data || []).forEach((row) => add(row, "request"));

      // Phone matches rank first so a caller ID lookup lands at the top.
      const list = Array.from(map.values()).sort((a, b) => {
        const aPhone = phoneLike && (a.parent_phone || "").replace(/\D/g, "").includes(digits) ? 0 : 1;
        const bPhone = phoneLike && (b.parent_phone || "").replace(/\D/g, "").includes(digits) ? 0 : 1;
        return aPhone - bPhone;
      });
      setResults(list.slice(0, 12));
      setSearching(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [query]);

  const pick = (r: FamilyMatch) => {
    setMatched(r);
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
              The parent completes the waiver, agreement, and card on their own device.
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

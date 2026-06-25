// Unified admin booking wizard: Client → Type → Slot → Review.
// Used by both the full-page route and the quick-book dialog.
import { useCallback, useEffect, useMemo, useState } from "react";
import { format, addDays, isBefore, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Check, ChevronLeft, ChevronRight, Loader2, Search, UserPlus, Users,
  GraduationCap, User as UserIcon, Clock, Calendar as CalendarIcon, ShieldCheck, Lock, CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getPrivateLessonPrice, isPromoDate, PROMO_LABEL } from "@/lib/privateLessonPricing";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { LEVEL_DISPLAY } from "@/components/swim-enrollment/types";

// ────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────

type StepKey = "client" | "type" | "slot" | "review";
type BookingType = "private" | "semi_private" | "group";

interface Swimmer {
  first_name: string;
  last_name: string;
  age?: number | null;
  dob?: string | null;
  // Only used for swimmers[1] in a semi-private booking: optional contact
  // info for the 2nd swimmer's parent so we can cc them the confirmation.
  partner_parent_name?: string;
  partner_parent_email?: string;
  partner_parent_phone?: string;
}

interface ClientDraft {
  parent_first: string;
  parent_last: string;
  parent_email: string;
  parent_phone: string;
  swimmers: Swimmer[];
  hasWaiver?: boolean;
}

interface RecurringBlock {
  id: string;
  instructor_id: string;
  instructor_name: string;
  day_of_week: number; // 0-6
  start_time: string;  // HH:MM
  end_time: string;    // HH:MM
  slot_minutes: number;
  pool_area: string;
  default_lesson_type: string | null;
  start_date: string | null;
  end_date: string | null;
}

interface GroupSession {
  id: string;
  session_name: string | null;
  swim_level: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  max_students: number;
  enrolled: number;
  session_start_date: string | null;
  session_end_date: string | null;
}

interface SlotDraft {
  mode: "recurring" | "one_time" | "group";
  // recurring/one_time
  instructorId?: string;
  instructorName?: string;
  date?: string;      // one-time
  startTime?: string; // HH:MM
  endTime?: string;
  poolArea?: string;
  // recurring expansion
  blockId?: string;
  weekday?: number;
  selectedDates?: string[]; // kept dates
  // group
  sessionId?: string;
  group?: GroupSession;
}

interface BookingDraft {
  client: ClientDraft;
  type: BookingType | null;
  slot: SlotDraft | null;
  payment: {
    collectCardOnFile: boolean;
    sendConfirmation: boolean;
    priceOverride: string;
  };
  notes: string;
}

const EMPTY_CLIENT: ClientDraft = {
  parent_first: "",
  parent_last: "",
  parent_email: "",
  parent_phone: "",
  swimmers: [{ first_name: "", last_name: "", age: null, dob: null }],
};

const STEPS: { key: StepKey; label: string }[] = [
  { key: "client", label: "Client" },
  { key: "type", label: "Booking type" },
  { key: "slot", label: "Slot" },
  { key: "review", label: "Review & book" },
];

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function normTime(t: string) { return t.length >= 5 ? t.substring(0, 5) : t; }
function fmtTime(t: string) {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hr = ((h + 11) % 12) + 1;
  return `${hr}:${String(m).padStart(2, "0")} ${period}`;
}
function addMinutes(time: string, mins: number) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// ────────────────────────────────────────────────────────────────────────
// Top-level wizard
// ────────────────────────────────────────────────────────────────────────

export interface BookingWizardProps {
  /** Optional prefill from calendar click. */
  initialSlot?: Partial<SlotDraft> & { lessonType?: BookingType };
  initialType?: BookingType;
  /** Optional prefill of the Client step (e.g. from a pending lesson request). */
  initialClient?: Partial<ClientDraft>;
  /** When provided, the wizard starts on this step (only if the prefill makes it valid). */
  initialStep?: StepKey;
  /** When true, slot + type came from a calendar click and are locked.
   *  The wizard collapses to Client → Review and hides Type/Slot editing. */
  lockedSlot?: boolean;
  onDone?: () => void;
  onCancel?: () => void;
  compact?: boolean; // dialog variant uses smaller paddings
}

export default function BookingWizard({ initialSlot, initialType, initialClient, initialStep, lockedSlot, onDone, onCancel, compact }: BookingWizardProps) {
  const steps = useMemo<{ key: StepKey; label: string }[]>(
    () => (lockedSlot ? [STEPS[0], STEPS[3]] : STEPS),
    [lockedSlot],
  );
  const [step, setStep] = useState<StepKey>(initialStep ?? "client");
  const [draft, setDraft] = useState<BookingDraft>({
    client: {
      ...EMPTY_CLIENT,
      ...(initialClient ?? {}),
      swimmers: initialClient?.swimmers && initialClient.swimmers.length > 0
        ? initialClient.swimmers
        : [{ first_name: "", last_name: "", age: null, dob: null }],
    },
    type: initialType ?? null,
    slot: initialSlot
      ? {
          mode: initialSlot.mode ?? "one_time",
          instructorId: initialSlot.instructorId,
          instructorName: initialSlot.instructorName,
          date: initialSlot.date,
          startTime: initialSlot.startTime,
          endTime: initialSlot.endTime,
          poolArea: initialSlot.poolArea ?? "shallow",
        }
      : null,
    payment: { collectCardOnFile: false, sendConfirmation: true, priceOverride: "" },
    notes: "",
  });


  const setClient = (c: ClientDraft) => setDraft((d) => ({ ...d, client: c }));
  const setType = (t: BookingType) => setDraft((d) => ({ ...d, type: t }));
  const setSlot = (s: SlotDraft | null) => setDraft((d) => ({ ...d, slot: s }));

  const canAdvance = useMemo(() => {
    if (step === "client") {
      const c = draft.client;
      return (
        c.parent_first.trim() &&
        c.parent_last.trim() &&
        c.parent_email.includes("@") &&
        c.swimmers[0]?.first_name?.trim() &&
        c.swimmers[0]?.last_name?.trim()
      );
    }
    if (step === "type") {
      if (!draft.type) return false;
      if (draft.type === "semi_private") {
        const sw2 = draft.client.swimmers[1];
        return !!(sw2?.first_name?.trim() && sw2?.last_name?.trim() && sw2?.dob);
      }
      return true;
    }
    if (step === "slot") {
      const s = draft.slot;
      if (!s) return false;
      if (s.mode === "group") return !!s.sessionId;
      if (s.mode === "one_time") return !!(s.instructorId && s.date && s.startTime);
      if (s.mode === "recurring") return !!(s.blockId && (s.selectedDates?.length ?? 0) > 0);
      return false;
    }
    return true;
  }, [step, draft]);

  const goNext = () => {
    const idx = steps.findIndex((s) => s.key === step);
    if (idx < steps.length - 1) setStep(steps[idx + 1].key);
  };
  const goPrev = () => {
    const idx = steps.findIndex((s) => s.key === step);
    if (idx > 0) setStep(steps[idx - 1].key);
  };

  return (
    <div className={cn("grid gap-6", compact ? "" : "md:grid-cols-[220px_1fr]")}>
      {/* Step rail */}
      <aside className={cn("space-y-1", compact && "flex gap-2 overflow-x-auto pb-2")}>
        {steps.map((s, i) => {
          const active = s.key === step;
          const done = steps.findIndex((x) => x.key === step) > i;
          return (
            <button
              key={s.key}
              onClick={() => {
                // allow jumping to any earlier completed step
                if (done) setStep(s.key);
              }}
              className={cn(
                "w-full text-left px-3 py-2 rounded-md text-sm border transition-colors flex items-center gap-2",
                active && "bg-primary text-primary-foreground border-primary",
                !active && done && "bg-muted text-foreground border-border hover:bg-accent",
                !active && !done && "bg-card text-muted-foreground border-border",
                compact && "shrink-0 whitespace-nowrap",
              )}
            >
              <span className={cn(
                "w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center",
                active ? "bg-primary-foreground text-primary" : done ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20",
              )}>
                {done ? <Check className="w-3 h-3" /> : i + 1}
              </span>
              {s.label}
            </button>
          );
        })}
      </aside>

      {/* Step body */}
      <div className="min-w-0">
        {step === "client" && (
          <ClientStep client={draft.client} onChange={setClient} />
        )}
        {step === "type" && (
          <TypeStep
            type={draft.type}
            client={draft.client}
            onTypeChange={setType}
            onClientChange={setClient}
          />
        )}
        {step === "slot" && draft.type && (
          <SlotStep
            type={draft.type}
            client={draft.client}
            slot={draft.slot}
            onChange={setSlot}
          />
        )}
        {step === "review" && draft.type && draft.slot && (
          <ReviewStep
            draft={draft}
            lockedSlot={!!lockedSlot}
            onPatch={(patch) => setDraft((d) => ({ ...d, ...patch }))}
            onNotes={(v) => setDraft((d) => ({ ...d, notes: v }))}
            onDone={onDone}
          />
        )}

        <div className="flex items-center justify-between mt-6 pt-4 border-t">
          <Button variant="ghost" onClick={step === "client" ? onCancel : goPrev}>
            <ChevronLeft className="w-4 h-4 mr-1" />
            {step === "client" ? "Cancel" : "Back"}
          </Button>
          {step !== "review" && (
            <Button onClick={goNext} disabled={!canAdvance}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Step 1: Client
// ────────────────────────────────────────────────────────────────────────

interface ClientSearchResult {
  parent_first: string;
  parent_last: string;
  parent_email: string;
  parent_phone: string | null;
  swimmer_first: string | null;
  swimmer_last: string | null;
  swimmer_dob: string | null;
  swimmer_age?: number | null;
  source: "booking" | "enrollment" | "request";
  request_preferred_times?: string | null;
  request_notes?: string | null;
  request_status?: string | null;
  hasCard?: boolean;
}

function splitName(full: string | null | undefined): { first: string; last: string } {
  const s = (full || "").trim();
  if (!s) return { first: "", last: "" };
  const parts = s.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function ClientStep({ client, onChange }: { client: ClientDraft; onChange: (c: ClientDraft) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [mode, setMode] = useState<"search" | "create">("search");

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    let cancelled = false;
    setSearching(true);
    (async () => {
      const like = `%${q}%`;
      const [b, e, r] = await Promise.all([
        supabase.from("lesson_bookings")
          .select("parent_first_name,parent_last_name,parent_email,parent_phone,child_first_name,child_last_name,child_dob,updated_at,stripe_payment_method_id")
          .or(`parent_email.ilike.${like},parent_first_name.ilike.${like},parent_last_name.ilike.${like},child_first_name.ilike.${like},child_last_name.ilike.${like},parent_phone.ilike.${like}`)
          .order("updated_at", { ascending: false })
          .limit(20),
        supabase.from("swim_enrollments")
          .select("parent_first_name,parent_last_name,parent_email,parent_phone,child_first_name,child_last_name,child_dob,updated_at")
          .or(`parent_email.ilike.${like},parent_first_name.ilike.${like},parent_last_name.ilike.${like},child_first_name.ilike.${like},child_last_name.ilike.${like},parent_phone.ilike.${like}`)
          .order("updated_at", { ascending: false })
          .limit(20),
        supabase.from("lesson_requests")
          .select("parent_name,parent_email,parent_phone,child_name,child_age,child_dob,preferred_times,notes,status,created_at")
          .in("status", ["new", "contacted", "scheduled"])
          .or(`parent_email.ilike.${like},parent_name.ilike.${like},child_name.ilike.${like},parent_phone.ilike.${like}`)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      if (cancelled) return;

      // Build set of emails with a card from bookings (stripe_payment_method_id),
      // then merge with profiles (stripe_default_pm_id) for the same emails.
      const cardEmails = new Set<string>();
      (b.data || []).forEach((row: any) => {
        if (row.stripe_payment_method_id && row.parent_email) {
          cardEmails.add(String(row.parent_email).toLowerCase().trim());
        }
      });
      const candidateEmails = Array.from(
        new Set(
          [
            ...(b.data || []).map((x: any) => x.parent_email),
            ...(e.data || []).map((x: any) => x.parent_email),
            ...(r.data || []).map((x: any) => x.parent_email),
          ]
            .filter(Boolean)
            .map((x: string) => x.toLowerCase().trim()),
        ),
      );
      if (candidateEmails.length > 0) {
        const { data: profRows } = await supabase
          .from("profiles")
          .select("email,stripe_default_pm_id")
          .in("email", candidateEmails)
          .not("stripe_default_pm_id", "is", null);
        (profRows || []).forEach((p: any) => {
          if (p.email) cardEmails.add(String(p.email).toLowerCase().trim());
        });
      }

      const map = new Map<string, ClientSearchResult>();
      const add = (row: any, source: "booking" | "enrollment" | "request") => {
        const email = (row.parent_email || "").toLowerCase().trim();
        let pf = "", pl = "", cf = "", cl = "";
        if (source === "request") {
          const p = splitName(row.parent_name);
          const c = splitName(row.child_name);
          pf = p.first; pl = p.last; cf = c.first; cl = c.last;
        } else {
          pf = row.parent_first_name || "";
          pl = row.parent_last_name || "";
          cf = row.child_first_name || "";
          cl = row.child_last_name || "";
        }
        const key = `${email}|${cf.toLowerCase()}|${cl.toLowerCase()}`;
        if (!email || map.has(key)) return;
        map.set(key, {
          parent_first: pf,
          parent_last: pl,
          parent_email: email,
          parent_phone: row.parent_phone || null,
          swimmer_first: cf || null,
          swimmer_last: cl || null,
          swimmer_dob: row.child_dob || null,
          swimmer_age: row.child_age ?? null,
          source,
          request_preferred_times: source === "request" ? row.preferred_times : null,
          request_notes: source === "request" ? row.notes : null,
          request_status: source === "request" ? row.status : null,
          hasCard: cardEmails.has(email),
        });
      };
      (b.data || []).forEach((row) => add(row, "booking"));
      (e.data || []).forEach((row) => add(row, "enrollment"));
      (r.data || []).forEach((row) => add(row, "request"));

      // Merge pass: collapse same-parent + same-first-name entries when one
      // side has no last name (typically a lesson_request with just child_name).
      // The richer row (with last name) survives and absorbs missing fields.
      const all = Array.from(map.values());
      const byEmail = new Map<string, ClientSearchResult[]>();
      for (const r of all) {
        const list = byEmail.get(r.parent_email) || [];
        list.push(r);
        byEmail.set(r.parent_email, list);
      }
      const dropped = new Set<ClientSearchResult>();
      for (const list of byEmail.values()) {
        if (list.length < 2) continue;
        for (let i = 0; i < list.length; i++) {
          for (let j = i + 1; j < list.length; j++) {
            const a = list[i], b = list[j];
            if (dropped.has(a) || dropped.has(b)) continue;
            const af = (a.swimmer_first || "").toLowerCase().trim();
            const bf = (b.swimmer_first || "").toLowerCase().trim();
            if (!af || af !== bf) continue;
            const al = (a.swimmer_last || "").trim();
            const bl = (b.swimmer_last || "").trim();
            // Only merge if exactly one has a last name (or last names match).
            const sameLast = al && bl && al.toLowerCase() === bl.toLowerCase();
            const oneMissing = (!al && bl) || (al && !bl);
            if (!sameLast && !oneMissing) continue;
            const survivor = al ? a : b;
            const loser = al ? b : a;
            // Absorb missing fields from the loser.
            if (!survivor.swimmer_age && loser.swimmer_age != null) survivor.swimmer_age = loser.swimmer_age;
            if (!survivor.swimmer_dob && loser.swimmer_dob) survivor.swimmer_dob = loser.swimmer_dob;
            if (!survivor.parent_phone && loser.parent_phone) survivor.parent_phone = loser.parent_phone;
            if (!survivor.parent_first && loser.parent_first) survivor.parent_first = loser.parent_first;
            if (!survivor.parent_last && loser.parent_last) survivor.parent_last = loser.parent_last;
            if (!survivor.request_preferred_times && loser.request_preferred_times) survivor.request_preferred_times = loser.request_preferred_times;
            if (!survivor.request_notes && loser.request_notes) survivor.request_notes = loser.request_notes;
            if (!survivor.request_status && loser.request_status) survivor.request_status = loser.request_status;
            if (loser.hasCard) survivor.hasCard = true;
            dropped.add(loser);
          }
        }
      }
      setResults(all.filter((r) => !dropped.has(r)).slice(0, 15));
      setSearching(false);
    })();
    return () => { cancelled = true; };
  }, [query]);

  const pick = (r: ClientSearchResult) => {
    onChange({
      parent_first: r.parent_first,
      parent_last: r.parent_last,
      parent_email: r.parent_email,
      parent_phone: r.parent_phone || "",
      swimmers: [{
        first_name: r.swimmer_first || "",
        last_name: r.swimmer_last || "",
        dob: r.swimmer_dob,
        age: r.swimmer_age ?? null,
      }],
    });
    // Stay in search mode — selection is shown inline; admin can click "Edit details" if needed.
  };

  const hasSelectedClient =
    mode === "search" &&
    client.parent_email.trim() &&
    client.swimmers[0]?.first_name?.trim();

  const updateSwimmer = (idx: number, patch: Partial<Swimmer>) => {
    const arr = [...client.swimmers];
    arr[idx] = { ...arr[idx], ...patch };
    onChange({ ...client, swimmers: arr });
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-lg">Who is this for?</h3>
          <p className="text-sm text-muted-foreground">Search existing clients or enter new info.</p>
        </div>
        <div className="flex gap-1 bg-muted rounded-md p-0.5">
          <button
            onClick={() => setMode("search")}
            className={cn("px-3 py-1 rounded text-xs font-medium", mode === "search" ? "bg-card shadow-sm" : "text-muted-foreground")}
          >
            <Search className="w-3 h-3 inline mr-1" /> Find
          </button>
          <button
            onClick={() => setMode("create")}
            className={cn("px-3 py-1 rounded text-xs font-medium", mode === "create" ? "bg-card shadow-sm" : "text-muted-foreground")}
          >
            <UserPlus className="w-3 h-3 inline mr-1" /> New
          </button>
        </div>
      </div>

      {mode === "search" ? (
        <div className="space-y-3">
          {hasSelectedClient && (() => {
            const selectedHasCard = results.some(
              (r) => r.parent_email === client.parent_email.toLowerCase().trim() && r.hasCard,
            );
            return (
            <div className="flex items-start justify-between gap-2 p-3 rounded-md border-2 border-primary bg-primary/5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Check className="w-4 h-4 text-primary" />
                  <p className="font-semibold text-sm truncate">
                    {client.swimmers[0]?.first_name
                      ? `${client.swimmers[0].first_name} ${client.swimmers[0].last_name}`
                      : `${client.parent_first} ${client.parent_last}`}
                  </p>
                  {selectedHasCard && (
                    <Badge variant="outline" className="text-[10px] gap-1 bg-teal-50 text-teal-800 border-teal-300">
                      <CreditCard className="w-3 h-3" /> Card on file
                    </Badge>
                  )}
                </div>
                {client.swimmers[0]?.first_name && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    Parent: {client.parent_first} {client.parent_last}
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                  {client.parent_email}{client.parent_phone ? ` · ${client.parent_phone}` : ""}
                </p>
              </div>

              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => setMode("create")}>Edit</Button>
                <Button variant="ghost" size="sm" onClick={() => { onChange({ ...EMPTY_CLIENT, swimmers: [{ first_name: "", last_name: "", age: null, dob: null }] }); setQuery(""); }}>
                  Clear
                </Button>
              </div>
            </div>
            );
          })()}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by parent or swimmer name, email, or phone…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
          {searching && <p className="text-xs text-muted-foreground">Searching…</p>}
          {!searching && query.length >= 2 && results.length === 0 && (
            <div className="text-center py-8 border-2 border-dashed rounded-md">
              <p className="text-sm text-muted-foreground mb-3">No matches for "{query}"</p>
              <Button size="sm" onClick={() => {
                onChange({ ...EMPTY_CLIENT, parent_email: query.includes("@") ? query : "", swimmers: [{ first_name: "", last_name: "", age: null, dob: null }] });
                setMode("create");
              }}>
                <UserPlus className="w-4 h-4 mr-1" /> Create new client
              </Button>
            </div>
          )}
          <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
            {results.map((r, i) => {
              const chipClass =
                r.source === "request"
                  ? "bg-amber-100 text-amber-900 border-amber-300"
                  : r.source === "enrollment"
                  ? "bg-emerald-50 text-emerald-900 border-emerald-300"
                  : "bg-sky-50 text-sky-900 border-sky-300";
              const chipLabel =
                r.source === "request" ? "Lesson Request" : r.source === "enrollment" ? "Group" : "Private";
              return (
                <button
                  key={i}
                  onClick={() => pick(r)}
                  className="w-full text-left p-3 border rounded-md hover:border-primary hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {r.swimmer_first ? (
                        <>
                          <p className="font-semibold text-sm truncate">
                            {r.swimmer_first} {r.swimmer_last}
                            {r.swimmer_age != null ? (
                              <span className="text-xs font-normal text-muted-foreground ml-1">· age {r.swimmer_age}</span>
                            ) : r.swimmer_dob ? (
                              <span className="text-xs font-normal text-muted-foreground ml-1">· DOB {r.swimmer_dob}</span>
                            ) : null}
                          </p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            Parent: {r.parent_first} {r.parent_last}
                          </p>
                        </>
                      ) : (
                        <p className="font-semibold text-sm truncate">{r.parent_first} {r.parent_last}</p>
                      )}
                      <p className="text-[11px] text-muted-foreground truncate">{r.parent_email}{r.parent_phone ? ` · ${r.parent_phone}` : ""}</p>

                      {r.source === "request" && (r.request_preferred_times || r.request_notes) && (
                        <p className="text-[11px] text-muted-foreground italic mt-1 line-clamp-2">
                          {r.request_preferred_times ? `Prefers: ${r.request_preferred_times}` : ""}
                          {r.request_preferred_times && r.request_notes ? " · " : ""}
                          {r.request_notes ?? ""}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant="outline" className={cn("text-[10px]", chipClass)}>
                        {chipLabel}
                      </Badge>
                      {r.hasCard && (
                        <Badge variant="outline" className="text-[10px] gap-1 bg-teal-50 text-teal-800 border-teal-300">
                          <CreditCard className="w-3 h-3" /> Card on file
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Parent first name *</Label>
              <Input value={client.parent_first} onChange={(e) => onChange({ ...client, parent_first: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Parent last name *</Label>
              <Input value={client.parent_last} onChange={(e) => onChange({ ...client, parent_last: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Email *</Label>
              <Input type="email" value={client.parent_email} onChange={(e) => onChange({ ...client, parent_email: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <Input value={client.parent_phone} onChange={(e) => onChange({ ...client, parent_phone: e.target.value })} />
            </div>
          </div>

          <div className="border-t pt-3">
            <p className="text-sm font-semibold mb-2">Swimmer(s)</p>
            {client.swimmers.map((sw, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 mb-2">
                <Input className="col-span-4" placeholder="First" value={sw.first_name} onChange={(e) => updateSwimmer(i, { first_name: e.target.value })} />
                <Input className="col-span-4" placeholder="Last" value={sw.last_name} onChange={(e) => updateSwimmer(i, { last_name: e.target.value })} />
                <Input className="col-span-2" type="number" placeholder="Age" value={sw.age ?? ""} onChange={(e) => updateSwimmer(i, { age: e.target.value ? Number(e.target.value) : null })} />
                <Input className="col-span-2" type="date" placeholder="DOB" value={sw.dob ?? ""} onChange={(e) => updateSwimmer(i, { dob: e.target.value || null })} />
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">DOB lets us auto-skip the waiver if it's already signed.</p>
          </div>
        </div>
      )}
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Step 2: Booking type
// ────────────────────────────────────────────────────────────────────────

function TypeStep({
  type, client, onTypeChange, onClientChange,
}: {
  type: BookingType | null;
  client: ClientDraft;
  onTypeChange: (t: BookingType) => void;
  onClientChange: (c: ClientDraft) => void;
}) {
  const types: { key: BookingType; title: string; sub: string; icon: any }[] = [
    { key: "private", title: "Private", sub: "1 swimmer · ~30 min", icon: UserIcon },
    { key: "semi_private", title: "Semi-Private", sub: "2 swimmers · ~30 min", icon: Users },
    { key: "group", title: "Group Class", sub: "Up to 3 swimmers · session series", icon: GraduationCap },
  ];

  // Auto-ensure 2 swimmers for semi-private
  useEffect(() => {
    if (type === "semi_private" && client.swimmers.length < 2) {
      onClientChange({ ...client, swimmers: [...client.swimmers, { first_name: "", last_name: "", age: null, dob: null }] });
    }
    if (type !== "semi_private" && client.swimmers.length > 1) {
      onClientChange({ ...client, swimmers: client.swimmers.slice(0, 1) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);


  return (
    <Card className="p-5">
      <h3 className="font-semibold text-lg mb-1">What are we booking?</h3>
      <p className="text-sm text-muted-foreground mb-4">Pick the booking type for {client.parent_first || "this client"}.</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {types.map((t) => {
          const Icon = t.icon;
          const active = type === t.key;
          return (
            <button
              key={t.key}
              onClick={() => onTypeChange(t.key)}
              className={cn(
                "p-4 rounded-lg border-2 text-left transition-all",
                active ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:border-primary/50",
              )}
            >
              <Icon className={cn("w-6 h-6 mb-2", active ? "text-primary" : "text-muted-foreground")} />
              <div className="font-semibold text-sm">{t.title}</div>
              <div className="text-xs text-muted-foreground">{t.sub}</div>
            </button>
          );
        })}
      </div>

      {type === "semi_private" && (
        <div className="border-t pt-4">
          <SecondSwimmerPicker
            primaryEmail={client.parent_email}
            swimmer={client.swimmers[1]}
            onChange={(sw) => {
              const arr = [...client.swimmers];
              arr[1] = sw;
              onClientChange({ ...client, swimmers: arr });
            }}
          />
        </div>
      )}
    </Card>
  );
}

// 2nd-swimmer picker for semi-private bookings.
// Search reuses the same parallel queries as ClientStep (lesson_bookings,
// swim_enrollments, lesson_requests). Picking a result fills swimmer name +
// DOB and stashes the parent contact as partner_* metadata so the booking
// edge fn can cc them the confirmation.
function SecondSwimmerPicker({
  primaryEmail, swimmer, onChange,
}: {
  primaryEmail: string;
  swimmer: Swimmer | undefined;
  onChange: (sw: Swimmer) => void;
}) {
  const [mode, setMode] = useState<"search" | "manual">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    let cancelled = false;
    setSearching(true);
    (async () => {
      const like = `%${q}%`;
      const [b, e, r] = await Promise.all([
        supabase.from("lesson_bookings")
          .select("parent_first_name,parent_last_name,parent_email,parent_phone,child_first_name,child_last_name,child_dob,updated_at")
          .or(`parent_email.ilike.${like},parent_first_name.ilike.${like},parent_last_name.ilike.${like},child_first_name.ilike.${like},child_last_name.ilike.${like},parent_phone.ilike.${like}`)
          .order("updated_at", { ascending: false })
          .limit(20),
        supabase.from("swim_enrollments")
          .select("parent_first_name,parent_last_name,parent_email,parent_phone,child_first_name,child_last_name,child_dob,updated_at")
          .or(`parent_email.ilike.${like},parent_first_name.ilike.${like},parent_last_name.ilike.${like},child_first_name.ilike.${like},child_last_name.ilike.${like},parent_phone.ilike.${like}`)
          .order("updated_at", { ascending: false })
          .limit(20),
        supabase.from("lesson_requests")
          .select("parent_name,parent_email,parent_phone,child_name,child_age,child_dob,status,created_at")
          .in("status", ["new", "contacted", "scheduled"])
          .or(`parent_email.ilike.${like},parent_name.ilike.${like},child_name.ilike.${like},parent_phone.ilike.${like}`)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      if (cancelled) return;
      const map = new Map<string, ClientSearchResult>();
      const add = (row: any, source: "booking" | "enrollment" | "request") => {
        const email = (row.parent_email || "").toLowerCase().trim();
        let pf = "", pl = "", cf = "", cl = "";
        if (source === "request") {
          const p = splitName(row.parent_name);
          const c = splitName(row.child_name);
          pf = p.first; pl = p.last; cf = c.first; cl = c.last;
        } else {
          pf = row.parent_first_name || "";
          pl = row.parent_last_name || "";
          cf = row.child_first_name || "";
          cl = row.child_last_name || "";
        }
        const key = `${email}|${cf.toLowerCase()}|${cl.toLowerCase()}`;
        if (!email || !cf || map.has(key)) return;
        map.set(key, {
          parent_first: pf, parent_last: pl, parent_email: email,
          parent_phone: row.parent_phone || null,
          swimmer_first: cf, swimmer_last: cl,
          swimmer_dob: row.child_dob || null,
          swimmer_age: row.child_age ?? null,
          source,
        });
      };
      (b.data || []).forEach((row) => add(row, "booking"));
      (e.data || []).forEach((row) => add(row, "enrollment"));
      (r.data || []).forEach((row) => add(row, "request"));
      setResults(Array.from(map.values()).slice(0, 12));
      setSearching(false);
    })();
    return () => { cancelled = true; };
  }, [query]);

  const pick = (r: ClientSearchResult) => {
    const parentName = `${r.parent_first} ${r.parent_last}`.trim();
    const differentParent =
      r.parent_email && r.parent_email.toLowerCase() !== primaryEmail.toLowerCase();
    onChange({
      first_name: r.swimmer_first || "",
      last_name: r.swimmer_last || "",
      age: r.swimmer_age ?? null,
      dob: r.swimmer_dob,
      partner_parent_name: differentParent ? parentName : undefined,
      partner_parent_email: differentParent ? r.parent_email : undefined,
      partner_parent_phone: differentParent ? (r.parent_phone || undefined) : undefined,
    });
  };

  const sw = swimmer || { first_name: "", last_name: "", age: null, dob: null };
  const hasSelection = !!sw.first_name?.trim();
  const partnerEmailDifferent =
    !!sw.partner_parent_email &&
    sw.partner_parent_email.toLowerCase() !== primaryEmail.toLowerCase();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Second swimmer</p>
        <div className="flex gap-1 bg-muted rounded-md p-0.5">
          <button onClick={() => setMode("search")} className={cn("px-3 py-1 rounded text-xs font-medium", mode === "search" ? "bg-card shadow-sm" : "text-muted-foreground")}>
            <Search className="w-3 h-3 inline mr-1" /> Find
          </button>
          <button onClick={() => setMode("manual")} className={cn("px-3 py-1 rounded text-xs font-medium", mode === "manual" ? "bg-card shadow-sm" : "text-muted-foreground")}>
            <UserPlus className="w-3 h-3 inline mr-1" /> Add manually
          </button>
        </div>
      </div>

      {hasSelection && (
        <div className="flex items-start justify-between gap-2 p-3 rounded-md border-2 border-primary bg-primary/5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-primary" />
              <p className="font-semibold text-sm truncate">{sw.first_name} {sw.last_name}</p>
            </div>
            {sw.partner_parent_name && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                Parent: {sw.partner_parent_name}
              </p>
            )}
            {sw.partner_parent_email && (
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                {sw.partner_parent_email}{sw.partner_parent_phone ? ` · ${sw.partner_parent_phone}` : ""}
                {partnerEmailDifferent && <span className="ml-1 text-primary">· will be cc'd</span>}
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => onChange({ first_name: "", last_name: "", age: null, dob: null })}>
            Change
          </Button>
        </div>
      )}

      {mode === "search" ? (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search existing clients or lesson requests…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          {searching && <p className="text-xs text-muted-foreground">Searching…</p>}
          <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
            {results.map((r, i) => {
              const chipClass =
                r.source === "request"
                  ? "bg-amber-100 text-amber-900 border-amber-300"
                  : r.source === "enrollment"
                  ? "bg-emerald-50 text-emerald-900 border-emerald-300"
                  : "bg-sky-50 text-sky-900 border-sky-300";
              const chipLabel = r.source === "request" ? "Request" : r.source === "enrollment" ? "Group" : "Private";
              return (
                <button
                  key={i}
                  onClick={() => pick(r)}
                  className="w-full text-left p-2.5 border rounded-md hover:border-primary hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">
                        {r.swimmer_first} {r.swimmer_last}
                        {r.swimmer_age != null && <span className="text-xs font-normal text-muted-foreground ml-1">· age {r.swimmer_age}</span>}
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        Parent: {r.parent_first} {r.parent_last}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">{r.parent_email}</p>
                    </div>
                    <Badge variant="outline" className={cn("text-[10px] shrink-0", chipClass)}>{chipLabel}</Badge>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <p className="text-[11px] text-muted-foreground">First name, last name, and date of birth are all required for the 2nd swimmer.</p>
          <div className="grid grid-cols-12 gap-2">
            <Input className="col-span-4" placeholder="First *" value={sw.first_name} onChange={(e) => onChange({ ...sw, first_name: e.target.value })} />
            <Input className="col-span-4" placeholder="Last *" value={sw.last_name} onChange={(e) => onChange({ ...sw, last_name: e.target.value })} />
            <Input className="col-span-2" type="number" placeholder="Age" value={sw.age ?? ""} onChange={(e) => onChange({ ...sw, age: e.target.value ? Number(e.target.value) : null })} />
            <Input className="col-span-2" type="date" placeholder="DOB *" value={sw.dob ?? ""} onChange={(e) => onChange({ ...sw, dob: e.target.value || null })} />
          </div>
          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            <p className="text-xs font-semibold">2nd swimmer's parent (optional — cc'd on confirmation if email differs)</p>
            <div className="grid grid-cols-12 gap-2">
              <Input className="col-span-4" placeholder="Parent name" value={sw.partner_parent_name ?? ""} onChange={(e) => onChange({ ...sw, partner_parent_name: e.target.value || undefined })} />
              <Input className="col-span-5" type="email" placeholder="Parent email" value={sw.partner_parent_email ?? ""} onChange={(e) => onChange({ ...sw, partner_parent_email: e.target.value || undefined })} />
              <Input className="col-span-3" placeholder="Phone" value={sw.partner_parent_phone ?? ""} onChange={(e) => onChange({ ...sw, partner_parent_phone: e.target.value || undefined })} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Step 3: Slot
// ────────────────────────────────────────────────────────────────────────

function SlotStep({
  type, client, slot, onChange,
}: {
  type: BookingType;
  client: ClientDraft;
  slot: SlotDraft | null;
  onChange: (s: SlotDraft | null) => void;
}) {
  if (type === "group") {
    return <GroupSlotPicker selected={slot} onChange={onChange} swimmerAge={client.swimmers[0]?.age ?? null} />;
  }
  return <PrivateSlotPicker type={type} slot={slot} onChange={onChange} />;
}

function PrivateSlotPicker({
  type, slot, onChange,
}: { type: BookingType; slot: SlotDraft | null; onChange: (s: SlotDraft | null) => void }) {
  const [blocks, setBlocks] = useState<RecurringBlock[]>([]);
  const [instructors, setInstructors] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"recurring" | "one_time">(slot?.mode === "one_time" ? "one_time" : "recurring");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [instRes, blockRes] = await Promise.all([
        supabase.rpc("get_active_instructors_public"),
        supabase.rpc("get_public_booking_blocks", { _instructor_ids: null }),
      ]);
      if (cancelled) return;
      const insts = ((instRes.data as any[]) || []).map((i) => ({ id: i.id, name: i.name }));
      const nameById = new Map(insts.map((i) => [i.id, i.name]));
      const raw = (blockRes.data as any[]) || [];
      const expanded: RecurringBlock[] = [];
      // For each block, split into per-time-slot recurring options based on slot_minutes.
      for (const b of raw) {
        if (b.is_blackout) continue;
        let t = normTime(b.start_time);
        const end = normTime(b.end_time);
        const brkS = b.break_start_time ? normTime(b.break_start_time) : null;
        const brkE = b.break_end_time ? normTime(b.break_end_time) : null;
        const dow = b.day_of_week;
        if (dow == null) continue;
        while (addMinutes(t, b.slot_minutes) <= end) {
          const slotEnd = addMinutes(t, b.slot_minutes);
          if (brkS && brkE && t < brkE && slotEnd > brkS) { t = brkE; continue; }
          expanded.push({
            id: `${b.id}_${t}`,
            instructor_id: b.instructor_id,
            instructor_name: nameById.get(b.instructor_id) || "Instructor",
            day_of_week: dow,
            start_time: t,
            end_time: slotEnd,
            slot_minutes: b.slot_minutes,
            pool_area: b.pool_area || "shallow",
            default_lesson_type: b.default_lesson_type || null,
            start_date: b.start_date,
            end_date: b.end_date,
          });
          t = slotEnd;
        }
      }
      expanded.sort((a, b) =>
        a.day_of_week - b.day_of_week
        || a.start_time.localeCompare(b.start_time)
        || a.instructor_name.localeCompare(b.instructor_name));
      setBlocks(expanded);
      setInstructors(insts);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <Card className="p-8 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></Card>;
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-lg">Pick a slot</h3>
          <p className="text-sm text-muted-foreground">Choose a weekly recurring slot, then deselect dates that don't work.</p>
        </div>
        <div className="flex gap-1 bg-muted rounded-md p-0.5">
          <button onClick={() => setMode("recurring")} className={cn("px-3 py-1 rounded text-xs font-medium", mode === "recurring" ? "bg-card shadow-sm" : "text-muted-foreground")}>Recurring slot</button>
          <button onClick={() => setMode("one_time")} className={cn("px-3 py-1 rounded text-xs font-medium", mode === "one_time" ? "bg-card shadow-sm" : "text-muted-foreground")}>One-time</button>
        </div>
      </div>

      {mode === "recurring" ? (
        <RecurringSlotChooser blocks={blocks} slot={slot} onChange={onChange} />
      ) : (
        <OneTimeChooser instructors={instructors} slot={slot} onChange={onChange} />
      )}
    </Card>
  );
}

function RecurringSlotChooser({
  blocks, slot, onChange,
}: { blocks: RecurringBlock[]; slot: SlotDraft | null; onChange: (s: SlotDraft) => void }) {
  const [seriesWeeks, setSeriesWeeks] = useState(8);
  const [dayFilter, setDayFilter] = useState<string>("all");
  const [instructorFilter, setInstructorFilter] = useState<string>("all");

  const instructorOptions = useMemo(() => {
    const m = new Map<string, string>();
    blocks.forEach((b) => m.set(b.instructor_id, b.instructor_name));
    return Array.from(m.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [blocks]);

  const dayOptions = useMemo(() => {
    const s = new Set<number>();
    blocks.forEach((b) => s.add(b.day_of_week));
    return Array.from(s).sort((a, b) => a - b);
  }, [blocks]);

  const filteredBlocks = useMemo(() => blocks.filter((b) => {
    if (dayFilter !== "all" && b.day_of_week !== Number(dayFilter)) return false;
    if (instructorFilter !== "all" && b.instructor_id !== instructorFilter) return false;
    return true;
  }), [blocks, dayFilter, instructorFilter]);

  const groupedByDay = useMemo(() => {
    const g: Record<number, RecurringBlock[]> = {};
    for (const b of filteredBlocks) {
      (g[b.day_of_week] = g[b.day_of_week] || []).push(b);
    }
    return g;
  }, [filteredBlocks]);

  const selectBlock = (b: RecurringBlock) => {
    const dates = generateRecurringDates(b.day_of_week, seriesWeeks, b.start_date, b.end_date);
    onChange({
      mode: "recurring",
      blockId: b.id,
      instructorId: b.instructor_id,
      instructorName: b.instructor_name,
      weekday: b.day_of_week,
      startTime: b.start_time,
      endTime: b.end_time,
      poolArea: b.pool_area,
      selectedDates: dates,
    });
  };

  const toggleDate = (date: string) => {
    if (!slot || slot.mode !== "recurring") return;
    const cur = slot.selectedDates || [];
    const next = cur.includes(date) ? cur.filter((d) => d !== date) : [...cur, date].sort();
    onChange({ ...slot, selectedDates: next });
  };

  return (
    <div className="space-y-5">
      {!slot?.blockId && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Filter:</span>
            <Select value={dayFilter} onValueChange={setDayFilter}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Day" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All days</SelectItem>
                {dayOptions.map((d) => (
                  <SelectItem key={d} value={String(d)}>{WEEKDAY_NAMES[d]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={instructorFilter} onValueChange={setInstructorFilter}>
              <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Instructor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All instructors</SelectItem>
                {instructorOptions.map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(dayFilter !== "all" || instructorFilter !== "all") && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setDayFilter("all"); setInstructorFilter("all"); }}>
                Clear
              </Button>
            )}
            <span className="text-xs text-muted-foreground ml-auto">{filteredBlocks.length} slot{filteredBlocks.length === 1 ? "" : "s"}</span>
          </div>
          <p className="text-[11px] text-muted-foreground mb-2">
            Note: every lesson in a recurring series must use the same instructor.
          </p>

          {Object.keys(groupedByDay).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              {blocks.length === 0
                ? "No recurring booking blocks configured. Switch to \"One-time\" or set up blocks in Private Lessons admin."
                : "No slots match these filters."}
            </p>
          )}
          {Object.entries(groupedByDay).sort(([a], [b]) => Number(a) - Number(b)).map(([dow, bs]) => (
            <div key={dow}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{WEEKDAY_NAMES[Number(dow)]}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {bs.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => selectBlock(b)}
                    className="text-left p-3 border rounded-md hover:border-primary hover:bg-accent/30 transition-colors"
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                      {fmtTime(b.start_time)} – {fmtTime(b.end_time)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{b.instructor_name} · {b.pool_area}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {slot?.blockId && slot.mode === "recurring" && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3 p-3 rounded-md bg-primary/5 border border-primary/20">
            <div>
              <p className="text-sm font-semibold">
                {WEEKDAY_NAMES[slot.weekday!]}s · {fmtTime(slot.startTime!)}–{fmtTime(slot.endTime!)}
              </p>
              <p className="text-xs text-muted-foreground">{slot.instructorName} · {slot.poolArea}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onChange({ ...slot, blockId: undefined, selectedDates: [] })}>Change</Button>
          </div>

          <div className="flex items-center gap-3">
            <Label className="text-xs">Generate</Label>
            <Select value={String(seriesWeeks)} onValueChange={(v) => {
              const n = Number(v);
              setSeriesWeeks(n);
              const dates = generateRecurringDates(slot.weekday!, n, null, null);
              onChange({ ...slot, selectedDates: dates });
            }}>
              <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[4, 6, 8, 10, 12, 16].map((n) => <SelectItem key={n} value={String(n)}>{n} weeks</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">Uncheck any dates that don't work.</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-[280px] overflow-y-auto p-1 border rounded-md">
            {(slot.selectedDates || []).length === 0 && (
              <p className="col-span-full text-sm text-muted-foreground text-center py-4">No dates — increase the series window.</p>
            )}
            {generateRecurringDates(slot.weekday!, seriesWeeks, null, null).map((d) => {
              const on = (slot.selectedDates || []).includes(d);
              return (
                <label key={d} className={cn(
                  "flex items-center gap-2 p-2 rounded border cursor-pointer text-sm",
                  on ? "border-primary bg-primary/5" : "border-border bg-muted/30 text-muted-foreground",
                )}>
                  <Checkbox checked={on} onCheckedChange={() => toggleDate(d)} />
                  <span>{format(parseISO(d), "EEE MMM d")}</span>
                </label>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {(slot.selectedDates || []).length} lesson{(slot.selectedDates || []).length === 1 ? "" : "s"} selected
            {(slot.selectedDates || []).length > 0 && ` · first ${format(parseISO(slot.selectedDates![0]), "MMM d")} · last ${format(parseISO(slot.selectedDates![slot.selectedDates!.length - 1]), "MMM d")}`}
          </p>
        </div>
      )}
    </div>
  );
}

function generateRecurringDates(weekday: number, weeks: number, startDate: string | null, endDate: string | null): string[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = startDate ? new Date(startDate + "T00:00") : today;
  const effStart = isBefore(start, today) ? today : start;
  // Find first matching weekday on/after effStart
  const cur = new Date(effStart);
  while (cur.getDay() !== weekday) cur.setDate(cur.getDate() + 1);
  const out: string[] = [];
  const end = endDate ? new Date(endDate + "T00:00") : null;
  for (let i = 0; i < weeks; i++) {
    if (end && cur > end) break;
    out.push(format(cur, "yyyy-MM-dd"));
    cur.setDate(cur.getDate() + 7);
  }
  return out;
}

function OneTimeChooser({
  instructors, slot, onChange,
}: { instructors: { id: string; name: string }[]; slot: SlotDraft | null; onChange: (s: SlotDraft) => void }) {
  const cur: SlotDraft = slot?.mode === "one_time" ? slot : {
    mode: "one_time",
    instructorId: "",
    date: format(new Date(), "yyyy-MM-dd"),
    startTime: "",
    endTime: "",
    poolArea: "shallow",
  };
  const patch = (p: Partial<SlotDraft>) => onChange({ ...cur, ...p });

  // Date chips: today + next 6 days
  const dateChips = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(today, i);
      return { iso: format(d, "yyyy-MM-dd"), label: i === 0 ? "Today" : format(d, "EEE M/d") };
    });
  }, []);

  const initialDate = cur.date && dateChips.some((c) => c.iso === cur.date) ? cur.date : dateChips[0].iso;
  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [instructorFilter, setInstructorFilter] = useState<string>(cur.instructorId || "all");
  const [openSlots, setOpenSlots] = useState<Array<{ instructor_id: string; instructor_name: string; slot_date: string; start_time: string; end_time: string }>>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [showCustom, setShowCustom] = useState(false);

  // Load slots directly from booking blocks (same source as RecurringChooser),
  // expand across the 7 date chips ignoring start_date/end_date so admins see
  // every weekday-matching slot, then subtract real conflicts only (existing
  // occurrences + active slot holds for those dates).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingSlots(true);
      try {
        const dateRange = dateChips.map((c) => c.iso);
        const firstDate = dateRange[0];
        const lastDate = dateRange[dateRange.length - 1];

        const [blockRes, instRes, occRes, holdRes] = await Promise.all([
          supabase.rpc("get_public_booking_blocks", { _instructor_ids: null }),
          supabase.rpc("get_active_instructors_public"),
          supabase
            .from("lesson_booking_occurrences")
            .select(
              "occurrence_date,status,instructor_override_id,start_time_override,end_time_override,booking:lesson_bookings!inner(instructor_id,start_time,end_time)"
            )
            .gte("occurrence_date", firstDate)
            .lte("occurrence_date", lastDate)
            .neq("status", "cancelled"),
          supabase
            .from("slot_holds")
            .select("instructor_id,slot_date,start_time,end_time,held_until")
            .gte("slot_date", firstDate)
            .lte("slot_date", lastDate)
            .gt("held_until", new Date().toISOString()),
        ]);

        if (cancelled) return;

        const nameById = new Map<string, string>(
          ((instRes.data as any[]) || []).map((i) => [i.id, i.name as string]),
        );

        // Build taken-interval set keyed by instructor+date for fast overlap checks.
        const takenByKey = new Map<string, Array<{ start: string; end: string }>>();
        const addTaken = (instructorId: string, date: string, start: string, end: string) => {
          const k = `${instructorId}|${date}`;
          const arr = takenByKey.get(k) || [];
          arr.push({ start: normTime(start), end: normTime(end) });
          takenByKey.set(k, arr);
        };
        ((occRes.data as any[]) || []).forEach((o) => {
          const instId = o.instructor_override_id ?? o.booking?.instructor_id;
          const startT = o.start_time_override ?? o.booking?.start_time;
          const endT = o.end_time_override ?? o.booking?.end_time;
          if (instId && startT && endT) {
            addTaken(instId, o.occurrence_date, startT, endT);
          }
        });
        ((holdRes.data as any[]) || []).forEach((h) =>
          addTaken(h.instructor_id, h.slot_date, h.start_time, h.end_time),
        );
        const isTaken = (instructorId: string, date: string, start: string, end: string) => {
          const arr = takenByKey.get(`${instructorId}|${date}`);
          if (!arr) return false;
          return arr.some((t) => start < t.end && end > t.start);
        };

        const raw = (blockRes.data as any[]) || [];
        const out: Array<{ instructor_id: string; instructor_name: string; slot_date: string; start_time: string; end_time: string }> = [];

        for (const dateStr of dateRange) {
          const dow = new Date(`${dateStr}T00:00:00`).getDay();
          for (const b of raw) {
            if (b.is_blackout) continue;
            if (b.day_of_week == null || b.day_of_week !== dow) continue;
            // NOTE: intentionally NOT filtering by b.start_date / b.end_date —
            // admin one-time view shows all weekday-matching slots.
            let t = normTime(b.start_time);
            const end = normTime(b.end_time);
            const brkS = b.break_start_time ? normTime(b.break_start_time) : null;
            const brkE = b.break_end_time ? normTime(b.break_end_time) : null;
            while (addMinutes(t, b.slot_minutes) <= end) {
              const slotEnd = addMinutes(t, b.slot_minutes);
              if (brkS && brkE && t < brkE && slotEnd > brkS) { t = brkE; continue; }
              if (!isTaken(b.instructor_id, dateStr, t, slotEnd)) {
                out.push({
                  instructor_id: b.instructor_id,
                  instructor_name: nameById.get(b.instructor_id) || "Instructor",
                  slot_date: dateStr,
                  start_time: t,
                  end_time: slotEnd,
                });
              }
              t = slotEnd;
            }
          }
        }

        setOpenSlots(out);
      } catch {
        if (!cancelled) setOpenSlots([]);
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedDate, dateChips]);

  const visibleSlots = useMemo(() => {
    return openSlots
      .filter((s) => s.slot_date === selectedDate)
      .filter((s) => instructorFilter === "all" || s.instructor_id === instructorFilter)
      .sort((a, b) => a.start_time.localeCompare(b.start_time) || a.instructor_name.localeCompare(b.instructor_name));
  }, [openSlots, selectedDate, instructorFilter]);

  const pickSlot = (s: { instructor_id: string; instructor_name: string; slot_date: string; start_time: string; end_time: string }) => {
    patch({
      instructorId: s.instructor_id,
      instructorName: s.instructor_name,
      date: s.slot_date,
      startTime: s.start_time,
      endTime: s.end_time,
    });
  };

  const isSelected = (s: { instructor_id: string; slot_date: string; start_time: string }) =>
    cur.instructorId === s.instructor_id && cur.date === s.slot_date && cur.startTime === s.start_time;

  return (
    <div className="space-y-4">
      {/* Date chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {dateChips.map((c) => {
          const active = c.iso === selectedDate;
          const count = openSlots.filter(
            (s) => s.slot_date === c.iso && (instructorFilter === "all" || s.instructor_id === instructorFilter),
          ).length;
          return (
            <button
              key={c.iso}
              onClick={() => setSelectedDate(c.iso)}
              className={cn(
                "shrink-0 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors flex items-center gap-1.5",
                active ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:border-primary",
              )}
            >
              {c.label}
              <Badge variant={active ? "secondary" : "outline"} className="text-[10px] h-4 px-1">{count}</Badge>
            </button>
          );
        })}
      </div>

      {/* Instructor filter */}
      <div className="flex items-center gap-2">
        <Label className="text-xs">Instructor</Label>
        <Select value={instructorFilter} onValueChange={setInstructorFilter}>
          <SelectTrigger className="w-48 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All instructors</SelectItem>
            {instructors.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Slot list */}
      {loadingSlots ? (
        <Card className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></Card>
      ) : visibleSlots.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No open slots for this day{instructorFilter !== "all" ? " and instructor" : ""}. Try another date or use Custom time below.
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-[320px] overflow-y-auto">
          {visibleSlots.map((s, i) => {
            const on = isSelected(s);
            return (
              <button
                key={`${s.instructor_id}-${s.start_time}-${i}`}
                onClick={() => pickSlot(s)}
                className={cn(
                  "text-left p-2.5 rounded-md border transition-colors",
                  on ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:border-primary hover:bg-accent/30",
                )}
              >
                <div className="text-sm font-semibold tabular-nums">{fmtTime(s.start_time)}</div>
                <div className="text-[11px] text-muted-foreground truncate">{s.instructor_name}</div>
              </button>
            );
          })}
        </div>
      )}

      {/* Custom time fallback */}
      <div className="border-t pt-3">
        <button
          type="button"
          onClick={() => setShowCustom((v) => !v)}
          className="text-xs text-primary hover:underline"
        >
          {showCustom ? "Hide custom time" : "Use a custom time (off-schedule booking)"}
        </button>
        {showCustom && (
          <div className="grid sm:grid-cols-2 gap-3 mt-3">
            <div>
              <Label className="text-xs">Instructor</Label>
              <Select value={cur.instructorId || ""} onValueChange={(v) => {
                const name = instructors.find((i) => i.id === v)?.name;
                patch({ instructorId: v, instructorName: name });
              }}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {instructors.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Pool</Label>
              <Select value={cur.poolArea || "shallow"} onValueChange={(v) => patch({ poolArea: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="shallow">Shallow</SelectItem>
                  <SelectItem value="deep">Deep</SelectItem>
                  <SelectItem value="full">Full pool</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={cur.date || ""} onChange={(e) => patch({ date: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Start</Label>
                <Input type="time" value={cur.startTime || ""} onChange={(e) => patch({ startTime: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">End</Label>
                <Input type="time" value={cur.endTime || ""} onChange={(e) => patch({ endTime: e.target.value })} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Confirmed selection */}
      {cur.instructorId && cur.date && cur.startTime && (
        <div className="p-3 rounded-md bg-primary/5 border border-primary/20 text-sm">
          <span className="font-semibold">Selected:</span> {format(parseISO(cur.date), "EEE MMM d")} · {fmtTime(cur.startTime)}
          {cur.endTime && `–${fmtTime(cur.endTime)}`} · {cur.instructorName || "Instructor"}
        </div>
      )}
    </div>
  );
}

function GroupSlotPicker({
  selected, onChange, swimmerAge,
}: { selected: SlotDraft | null; onChange: (s: SlotDraft) => void; swimmerAge: number | null }) {
  const [sessions, setSessions] = useState<GroupSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [dayFilter, setDayFilter] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const { data: sRows } = await supabase
        .from("swim_sessions")
        .select("id, session_name, swim_level, day_of_week, start_time, end_time, max_students, session_start_date, session_end_date")
        .eq("is_active", true)
        .or(`session_end_date.is.null,session_end_date.gte.${today}`)
        .order("swim_level");
      const ids = ((sRows as any[]) || []).map((r) => r.id);
      const { data: counts } = ids.length
        ? await supabase.rpc("get_session_enrollment_counts", { _session_ids: ids })
        : { data: [] as any[] };
      const countMap = new Map<string, number>(((counts as any[]) || []).map((c) => [c.session_id, c.enrolled_count]));
      if (cancelled) return;
      setSessions(((sRows as any[]) || []).map((r) => ({
        ...r,
        enrolled: countMap.get(r.id) ?? 0,
      })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = sessions.filter((s) =>
    (levelFilter === "all" || s.swim_level === levelFilter) &&
    (dayFilter === "all" || s.day_of_week === dayFilter),
  );

  if (loading) return <Card className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></Card>;

  return (
    <Card className="p-5">
      <h3 className="font-semibold text-lg mb-1">Pick a group class</h3>
      <p className="text-sm text-muted-foreground mb-4">Active sessions with open seats.{swimmerAge ? ` Swimmer age: ${swimmerAge}.` : ""}</p>

      <div className="flex gap-2 mb-3">
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Level" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            {Object.entries(LEVEL_DISPLAY).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.name} · {v.groupName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={dayFilter} onValueChange={setDayFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Day" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All days</SelectItem>
            {["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "monday_wednesday"].map((d) => (
              <SelectItem key={d} value={d}>{d.replace("_", " & ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
        {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No matching sessions.</p>}
        {filtered.map((s) => {
          const full = s.enrolled >= s.max_students;
          const active = selected?.sessionId === s.id;
          return (
            <button
              key={s.id}
              disabled={full}
              onClick={() => onChange({ mode: "group", sessionId: s.id, group: s })}
              className={cn(
                "w-full text-left p-3 border rounded-md transition-colors",
                active && "border-primary bg-primary/5",
                full ? "opacity-50 cursor-not-allowed" : "hover:border-primary hover:bg-accent/30",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={cn("text-[10px]", LEVEL_DISPLAY[s.swim_level as keyof typeof LEVEL_DISPLAY]?.color)}>
                      {LEVEL_DISPLAY[s.swim_level as keyof typeof LEVEL_DISPLAY]?.name || s.swim_level}
                    </Badge>
                    <span className="font-medium text-sm">{s.session_name || `${s.swim_level} class`}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {s.day_of_week.replace("_", " & ")} · {fmtTime(s.start_time)}–{fmtTime(s.end_time)}
                    {s.session_start_date && ` · ${format(parseISO(s.session_start_date), "MMM d")}${s.session_end_date ? `–${format(parseISO(s.session_end_date), "MMM d")}` : ""}`}
                  </p>
                </div>
                <Badge variant={full ? "destructive" : "secondary"} className="text-[10px] shrink-0">
                  {s.enrolled}/{s.max_students}
                </Badge>
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Step 4: Review & book
// ────────────────────────────────────────────────────────────────────────

function ReviewStep({
  draft, lockedSlot, onPatch, onNotes, onDone,
}: {
  draft: BookingDraft;
  lockedSlot?: boolean;
  onPatch: (p: Partial<BookingDraft>) => void;
  onNotes: (v: string) => void;
  onDone?: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [stage, setStage] = useState<"review" | "card" | "finalizing">("review");
  const [stripeReady, setStripeReady] = useState<any>(null);
  const [setupClientSecret, setSetupClientSecret] = useState<string | null>(null);
  const [checkoutSessionId, setCheckoutSessionId] = useState<string | null>(null);
  const [stripeCustomerId, setStripeCustomerId] = useState<string | null>(null);
  const [waiverOnFile, setWaiverOnFile] = useState<boolean | null>(null);
  const [existingCardHint, setExistingCardHint] = useState<{
    found: boolean;
    brand?: string;
    last4?: string;
    exp_month?: number;
    exp_year?: number;
    source_booking_id?: string;
    source_child_name?: string | null;
    source_instructor_name?: string | null;
  } | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  // Admin override: "reuse" (default when card found), "new" (collect fresh),
  // "none" (skip card / bill in person). Resets when email changes.
  const [cardChoice, setCardChoice] = useState<"reuse" | "new" | "none">("reuse");

  useEffect(() => { getStripe().then(setStripeReady).catch(() => {}); }, []);

  // Check waiver on file via RPC
  useEffect(() => {
    const sw = draft.client.swimmers[0];
    if (!sw?.first_name || !sw?.last_name || !sw?.dob) { setWaiverOnFile(null); return; }
    supabase.rpc("swimmer_has_waiver_on_file", { _first: sw.first_name, _last: sw.last_name, _dob: sw.dob })
      .then(({ data }) => setWaiverOnFile(!!data));
  }, [draft.client.swimmers]);

  // Card on file lookup — validates against Stripe (attached + not expired).
  useEffect(() => {
    const email = draft.client.parent_email?.toLowerCase().trim();
    setExistingCardHint(null);
    setCardChoice("reuse");
    if (!email || !email.includes("@")) return;
    let cancelled = false;
    setLookupLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("lookup-parent-card-on-file", {
          body: { parent_email: email, environment: getStripeEnvironment() },
        });
        if (cancelled) return;
        if (error || !data || (data as any).error) {
          setExistingCardHint({ found: false });
        } else {
          setExistingCardHint(data as any);
        }
      } finally {
        if (!cancelled) setLookupLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [draft.client.parent_email]);


  const isGroup = draft.type === "group";
  const occurrenceDates = draft.slot?.mode === "recurring"
    ? (draft.slot.selectedDates || [])
    : draft.slot?.mode === "one_time"
    ? [draft.slot.date!]
    : [];

  const pricePerLesson = useMemo(() => {
    if (isGroup) return 30;
    if (draft.payment.priceOverride) return Number(draft.payment.priceOverride);
    if (draft.type === "semi_private") return 45;
    // private: per-occurrence pricing
    return occurrenceDates.length > 0
      ? getPrivateLessonPrice("private", occurrenceDates[0])
      : 65;
  }, [draft.type, draft.payment.priceOverride, isGroup, occurrenceDates]);

  const totalPrice = useMemo(() => {
    if (isGroup) return 240;
    if (draft.payment.priceOverride) return Number(draft.payment.priceOverride) * occurrenceDates.length;
    return occurrenceDates.reduce((sum, d) => sum + getPrivateLessonPrice(draft.type === "semi_private" ? "semi_private" : "private", d), 0);
  }, [isGroup, draft.payment.priceOverride, draft.type, occurrenceDates]);

  const submitGroup = async () => {
    setStage("finalizing");
    try {
      const sw = draft.client.swimmers[0];
      const { data, error } = await supabase.functions.invoke("admin-create-enrollment", {
        body: {
          childName: `${sw.first_name} ${sw.last_name}`.trim(),
          childAge: sw.age || 0,
          swimLevel: draft.slot!.group!.swim_level,
          sessionId: draft.slot!.sessionId,
          parentName: `${draft.client.parent_first} ${draft.client.parent_last}`.trim(),
          parentEmail: draft.client.parent_email.toLowerCase().trim(),
          parentPhone: draft.client.parent_phone || null,
          isFirstTime: false, // admin booking — let trigger figure out
          paymentMethod: "comp",
          paymentReference: `admin-booking ${new Date().toISOString().slice(0, 10)}`,
          paymentStatus: "unpaid",
          paymentAmount: 0,
          notes: draft.notes || null,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Group enrollment created");
      onDone?.();
    } catch (e: any) {
      toast.error(e?.message || "Failed to create enrollment");
      setStage("review");
    }
  };

  const finalizePrivate = useCallback(async (
    sessionId: string | null,
    customerId: string | null,
    sourceOverride?: "reuse" | "new" | "none",
  ) => {
    setStage("finalizing");
    try {
      const sw = draft.client.swimmers[0];
      const source = sourceOverride
        ?? (sessionId ? "new" : (draft.payment.collectCardOnFile
          ? (existingCardHint?.found && cardChoice === "reuse" ? "reuse" : "none")
          : "none"));
      const body: any = {
        instructor_id: draft.slot!.instructorId,
        lesson_type: draft.type === "semi_private" ? "semi_private" : "private",
        start_date: occurrenceDates[0],
        start_time: (draft.slot!.startTime || "15:00").length === 5 ? draft.slot!.startTime + ":00" : draft.slot!.startTime,
        end_time: (draft.slot!.endTime || "15:30").length === 5 ? draft.slot!.endTime + ":00" : draft.slot!.endTime,
        pool_area: draft.slot!.poolArea || "shallow",
        parent_name: `${draft.client.parent_first} ${draft.client.parent_last}`.trim(),
        parent_first_name: draft.client.parent_first,
        parent_last_name: draft.client.parent_last,
        parent_email: draft.client.parent_email.toLowerCase().trim(),
        parent_phone: draft.client.parent_phone || null,
        child_name: `${sw.first_name} ${sw.last_name}`.trim(),
        child_first_name: sw.first_name,
        child_last_name: sw.last_name,
        child_age: sw.age ?? null,
        child_dob: sw.dob || null,
        notes: draft.notes || null,
        recurring: occurrenceDates.length > 1,
        series_end: occurrenceDates[occurrenceDates.length - 1],
        occurrence_dates: occurrenceDates,
        price_per_session: draft.payment.priceOverride ? Number(draft.payment.priceOverride) : undefined,
        send_confirmation: draft.payment.sendConfirmation,
        collect_card_on_file: source !== "none",
        card_on_file_source: source,
        stripe_environment: getStripeEnvironment(),
        stripe_customer_id: customerId,
        stripe_checkout_session_id: sessionId,
      };
      const sw2 = draft.client.swimmers[1];
      if (draft.type === "semi_private" && sw2?.first_name?.trim()) {
        body.partner_swimmer_first_name = sw2.first_name;
        body.partner_swimmer_last_name = sw2.last_name || null;
        body.partner_parent_name = sw2.partner_parent_name || null;
        body.partner_parent_email = sw2.partner_parent_email?.toLowerCase().trim() || null;
        body.partner_parent_phone = sw2.partner_parent_phone || null;
      }
      const { data, error } = await supabase.functions.invoke("admin-create-private-booking", { body });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const used = (data as any)?.card_on_file_source;
      const occ = (data as any)?.occurrences ?? occurrenceDates.length;
      toast.success(
        used === "reuse"
          ? `Booking created — ${occ} lesson(s) · card on file reused`
          : `Booking created — ${occ} lesson(s)`,
      );
      onDone?.();
    } catch (e: any) {
      toast.error(e?.message || "Failed to create booking");
      setStage("review");
    }
  }, [draft, occurrenceDates, onDone, existingCardHint, cardChoice]);

  const handleBook = async () => {
    if (isGroup) { submitGroup(); return; }
    // No card requested.
    if (!draft.payment.collectCardOnFile || cardChoice === "none") {
      finalizePrivate(null, null, "none");
      return;
    }
    // Reuse existing card on file — no Stripe Checkout needed.
    if (existingCardHint?.found && cardChoice === "reuse") {
      finalizePrivate(null, null, "reuse");
      return;
    }
    // Fall through: collect a new card via Setup Checkout.
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-private-booking-setup", {
        body: {
          environment: getStripeEnvironment(),
          parent_first_name: draft.client.parent_first,
          parent_last_name: draft.client.parent_last,
          parent_email: draft.client.parent_email.toLowerCase().trim(),
          parent_phone: draft.client.parent_phone || null,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setSetupClientSecret((data as any).client_secret);
      setCheckoutSessionId((data as any).checkout_session_id);
      setStripeCustomerId((data as any).customer_id);
      setStage("card");
    } catch (e: any) {
      toast.error(e?.message || "Could not start card setup");
    } finally {
      setSubmitting(false);
    }
  };


  const handleCardComplete = useCallback(() => {
    if (!checkoutSessionId) return;
    finalizePrivate(checkoutSessionId, stripeCustomerId);
  }, [checkoutSessionId, stripeCustomerId, finalizePrivate]);

  const checkoutOptions = useMemo(() => ({
    fetchClientSecret: () => Promise.resolve(setupClientSecret || ""),
    onComplete: handleCardComplete,
  }), [setupClientSecret, handleCardComplete]);

  if (stage === "finalizing") {
    return (
      <Card className="p-12 text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-primary" />
        <p className="text-sm text-muted-foreground">Creating booking…</p>
      </Card>
    );
  }

  if (stage === "card" && setupClientSecret && stripeReady) {
    return (
      <Card className="p-5 space-y-3">
        <div className="text-sm text-muted-foreground">
          Save card for <span className="font-medium text-foreground">{draft.client.parent_first} {draft.client.parent_last}</span> · {draft.client.parent_email}
        </div>
        <div className="border rounded-lg overflow-hidden">
          <EmbeddedCheckoutProvider stripe={stripeReady} options={checkoutOptions}>
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setStage("review")}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-5 space-y-5">
      <h3 className="font-semibold text-lg">Review & book</h3>

      {/* Summary */}
      <div className="grid sm:grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Client</p>
          <p className="font-medium">{draft.client.parent_first} {draft.client.parent_last}</p>
          <p className="text-xs text-muted-foreground">{draft.client.parent_email}{draft.client.parent_phone ? ` · ${draft.client.parent_phone}` : ""}</p>
          <p className="text-xs mt-1">
            Swimmer{draft.client.swimmers.length > 1 ? "s" : ""}: {draft.client.swimmers.map((s) => `${s.first_name} ${s.last_name}`).join(", ")}
          </p>
          {waiverOnFile !== null && (
            <Badge variant={waiverOnFile ? "secondary" : "outline"} className={cn("mt-2 text-[10px]", waiverOnFile && "bg-green-100 text-green-800 border-green-300")}>
              <ShieldCheck className="w-3 h-3 mr-1" /> {waiverOnFile ? "Waiver on file" : "No waiver — link will be sent"}
            </Badge>
          )}
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Booking</p>
            {lockedSlot && (
              <Badge variant="secondary" className="text-[10px] gap-1">
                <Lock className="w-3 h-3" /> Locked from calendar
              </Badge>
            )}
          </div>
          <p className="font-medium capitalize">{draft.type?.replace("_", "-")}</p>
          {isGroup ? (
            <>
              <p className="text-xs">{draft.slot!.group?.session_name || draft.slot!.group?.swim_level}</p>
              <p className="text-xs text-muted-foreground">
                {draft.slot!.group?.day_of_week.replace("_", " & ")} · {fmtTime(draft.slot!.group!.start_time)}–{fmtTime(draft.slot!.group!.end_time)}
              </p>
            </>
          ) : (
            <>
              <p className="text-xs">{draft.slot!.instructorName} · {draft.slot!.poolArea}</p>
              <p className="text-xs text-muted-foreground">
                {fmtTime(draft.slot!.startTime!)}–{fmtTime(draft.slot!.endTime!)}
                {draft.slot!.mode === "recurring" && ` · ${WEEKDAY_NAMES[draft.slot!.weekday!]}s`}
              </p>
              <p className="text-xs mt-1">{occurrenceDates.length} lesson{occurrenceDates.length === 1 ? "" : "s"}</p>
            </>
          )}
        </div>
      </div>

      {/* Price */}
      {!isGroup && (
        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold">Price</p>
            {occurrenceDates.some(isPromoDate) && draft.type === "private" && (
              <Badge variant="secondary" className="text-[10px]">{PROMO_LABEL} applied</Badge>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Override price per lesson (optional)</Label>
              <Input
                type="number"
                placeholder={`Default $${pricePerLesson}`}
                value={draft.payment.priceOverride}
                onChange={(e) => onPatch({ payment: { ...draft.payment, priceOverride: e.target.value } })}
              />
            </div>
            <div className="flex flex-col justify-end text-right">
              <p className="text-xs text-muted-foreground">Estimated total</p>
              <p className="text-2xl font-bold">${totalPrice.toFixed(2)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      <div>
        <Label className="text-xs">Notes (internal + included in email)</Label>
        <Textarea rows={2} value={draft.notes} onChange={(e) => onNotes(e.target.value)} placeholder="Medical notes, special requests, etc." />
      </div>

      {/* Toggles (private only) */}
      {!isGroup && (
        <div className="border-t pt-4 space-y-2">
          <div className="flex items-center gap-2">
            <Switch
              id="send-conf"
              checked={draft.payment.sendConfirmation}
              onCheckedChange={(v) => onPatch({ payment: { ...draft.payment, sendConfirmation: v } })}
            />
            <Label htmlFor="send-conf" className="text-sm cursor-pointer">Email confirmation to parent</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="cof"
              checked={draft.payment.collectCardOnFile}
              onCheckedChange={(v) => onPatch({ payment: { ...draft.payment, collectCardOnFile: v } })}
            />
            <Label htmlFor="cof" className="text-sm cursor-pointer">Collect card on file (charge day of each lesson)</Label>
          </div>
          {existingCardHint && (
            <p className="text-xs text-muted-foreground pl-10">
              Card already on file for this client — leave off unless you need to replace it.
            </p>
          )}
        </div>
      )}

      <Button onClick={handleBook} disabled={submitting} className="w-full" size="lg">
        {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        {isGroup ? "Create enrollment" : draft.payment.collectCardOnFile ? "Continue to card on file" : "Create booking"}
      </Button>
    </Card>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/hooks/use-toast";
import { Loader2, Search, AlertTriangle, FileWarning, Stethoscope } from "lucide-react";
import { LEVEL_GROUP_NAMES } from "@/components/swim-enrollment/types";
import { Link } from "react-router-dom";
import { MembershipHoldsPanel } from "@/components/admin/holds/MembershipHoldsPanel";
import { EnrollFamilyDialog } from "@/components/admin/holds/EnrollFamilyDialog";
import { FAMILY_ENROLL_ENABLED } from "@/lib/familyEnrollGate";
import {
  type MembershipPaymentState,
  hasPaymentProblem,
  paymentAmountLabel,
  paymentBucket,
  paymentLabel,
  plainDeclineReason,
} from "@/lib/membershipPayment";





type PlanKey = "kid_group" | "private" | "adult_group";
type SwimLevel = "white" | "red" | "yellow" | "blue" | "green";

const PLAN_LABELS: Record<PlanKey, string> = {
  kid_group: "Small Group Swim",
  private: "Private Swim",
  adult_group: "Adult Swim",
};

const SWIM_LEVELS: SwimLevel[] = ["white", "red", "yellow", "blue", "green"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ACTIVE_STATUSES = ["active", "pending_cancel"];

interface Slot {
  id: string;
  plan_key: PlanKey;
  instructor_id: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  capacity: number;
  active: boolean;
  swim_level: string | null;
  accepted_levels: string[] | null;
}

interface Membership extends MembershipPaymentState {
  id: string;
  plan_key: PlanKey;
  standing_slot_id: string | null;
  child_first_name: string | null;
  child_last_name: string | null;
  parent_first_name: string | null;
  parent_last_name: string | null;
  parent_email: string | null;
  parent_phone: string | null;
  status: string;
  start_date: string | null;
  current_period_end: string | null;
  cancel_effective_date: string | null;
  recurring_consent_amount_cents: number | null;
  medical_notes: string | null;
  notes: string | null;
  waiver_id: string | null;
  swim_level: SwimLevel | null;
  manage_token: string | null;
}


interface Occurrence {
  id: string;
  occurrence_date: string;
  start_time: string | null;
  end_time: string | null;
  status: string;
}

const timeLabel = (t?: string | null) => {
  if (!t) return "--";
  const [h, m] = t.split(":").map((n) => parseInt(n, 10));
  if (Number.isNaN(h)) return t;
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${m.toString().padStart(2, "0")}${ampm}`;
};

const dateLabel = (d?: string | null) => {
  if (!d) return "--";
  return new Date(`${d}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const swimmerName = (m: Membership) =>
  [m.child_first_name, m.child_last_name].filter(Boolean).join(" ") || "Unnamed swimmer";
const parentName = (m: Membership) =>
  [m.parent_first_name, m.parent_last_name].filter(Boolean).join(" ") || "--";

const MembershipsAdmin = () => {
  const [loading, setLoading] = useState(true);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [instructors, setInstructors] = useState<Record<string, string>>({});

  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dayFilter, setDayFilter] = useState<string>("all");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState<string>("all");


  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [enrollFamilyOpen, setEnrollFamilyOpen] = useState(false);
  const [holdsRefresh, setHoldsRefresh] = useState(0);

  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [occLoading, setOccLoading] = useState(false);

  const [levelDraft, setLevelDraft] = useState<string>("");
  const [savingLevel, setSavingLevel] = useState(false);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("other");
  const [cancelDetail, setCancelDetail] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelResult, setCancelResult] = useState<{ effectiveDate?: string; finalChargeDate?: string } | null>(null);

  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState("");
  const [moving, setMoving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [mRes, sRes, iRes] = await Promise.all([
      supabase
        .from("memberships")
        .select(
          "id, plan_key, standing_slot_id, child_first_name, child_last_name, parent_first_name, parent_last_name, parent_email, parent_phone, status, start_date, current_period_end, cancel_effective_date, recurring_consent_amount_cents, medical_notes, notes, waiver_id, swim_level, manage_token, last_invoice_id, last_payment_status, last_payment_at, last_payment_amount_cents, payment_failure_count, payment_failure_reason, stripe_subscription_status",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("standing_slots")
        .select("id, plan_key, instructor_id, day_of_week, start_time, end_time, capacity, active, swim_level, accepted_levels"),
      supabase.from("instructors").select("id, name"),
    ]);
    if (mRes.error) toast({ title: "Could not load memberships", description: mRes.error.message, variant: "destructive" });
    setMemberships((mRes.data ?? []) as unknown as Membership[]);
    setSlots((sRes.data ?? []) as unknown as Slot[]);
    setInstructors(Object.fromEntries(((iRes.data ?? []) as { id: string; name: string }[]).map((i) => [i.id, i.name])));
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const slotById = useMemo(() => new Map(slots.map((s) => [s.id, s])), [slots]);

  const selected = useMemo(
    () => memberships.find((m) => m.id === selectedId) ?? null,
    [memberships, selectedId],
  );
  const selectedSlot = selected?.standing_slot_id ? slotById.get(selected.standing_slot_id) ?? null : null;

  useEffect(() => {
    setLevelDraft(selected?.swim_level ?? "");
    setCancelResult(null);
    if (!selectedId) {
      setOccurrences([]);
      return;
    }
    let cancelled = false;
    setOccLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    void supabase
      .from("membership_occurrences")
      .select("id, occurrence_date, start_time, end_time, status")
      .eq("membership_id", selectedId)
      .gte("occurrence_date", today)
      .order("occurrence_date", { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        setOccurrences((data ?? []) as unknown as Occurrence[]);
        setOccLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return memberships.filter((m) => {
      if (!includeInactive && !ACTIVE_STATUSES.includes(m.status)) return false;
      if (planFilter !== "all" && m.plan_key !== planFilter) return false;
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (dayFilter !== "all") {
        const slot = m.standing_slot_id ? slotById.get(m.standing_slot_id) : null;
        if (!slot || String(slot.day_of_week) !== dayFilter) return false;
      }
      if (paymentFilter === "problem" && !hasPaymentProblem(m)) return false;
      if (paymentFilter !== "all" && paymentFilter !== "problem" && paymentBucket(m) !== paymentFilter) return false;
      if (!q) return true;
      const hay = [
        swimmerName(m),
        parentName(m),
        m.parent_email ?? "",
        (m.parent_phone ?? "").replace(/\D/g, ""),
        m.parent_phone ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q) || hay.includes(q.replace(/\D/g, ""));
    });
  }, [memberships, search, planFilter, statusFilter, dayFilter, paymentFilter, includeInactive, slotById]);

  // Payment problems are surfaced across the whole book, not just the current
  // filter, so a filtered view can never hide a declined card.
  const paymentProblems = useMemo(() => memberships.filter(hasPaymentProblem), [memberships]);


  const targetSlots = useMemo(() => {
    if (!selected) return [] as (Slot & { enrolled: number })[];
    const counts = new Map<string, number>();
    memberships.forEach((m) => {
      if (!m.standing_slot_id) return;
      if (!["active", "pending_cancel", "paused"].includes(m.status)) return;
      counts.set(m.standing_slot_id, (counts.get(m.standing_slot_id) ?? 0) + 1);
    });
    return slots
      .filter((s) => s.active && s.plan_key === selected.plan_key && s.id !== selected.standing_slot_id)
      .map((s) => ({ ...s, enrolled: counts.get(s.id) ?? 0 }))
      .sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time));
  }, [slots, memberships, selected]);

  const saveLevel = async () => {
    if (!selected) return;
    setSavingLevel(true);
    const { error } = await supabase
      .from("memberships")
      .update({ swim_level: levelDraft || null })
      .eq("id", selected.id);
    setSavingLevel(false);
    if (error) {
      toast({ title: "Could not save level", description: error.message, variant: "destructive" });
      return;
    }
    setMemberships((prev) =>
      prev.map((m) => (m.id === selected.id ? { ...m, swim_level: (levelDraft || null) as SwimLevel | null } : m)),
    );
    toast({ title: "Swim level saved" });
  };

  const doCancel = async () => {
    if (!selected?.manage_token) {
      toast({ title: "No manage token on this membership", variant: "destructive" });
      return;
    }
    setCancelling(true);
    const { data, error } = await supabase.functions.invoke("cancel-membership", {
      body: { token: selected.manage_token, reason: cancelReason, reasonDetail: cancelDetail || null },
    });
    setCancelling(false);
    if (error) {
      toast({ title: "Cancellation failed", description: error.message, variant: "destructive" });
      return;
    }
    setCancelResult({ effectiveDate: data?.effectiveDate, finalChargeDate: data?.finalChargeDate });
    toast({ title: "Cancellation scheduled" });
    await fetchData();
  };

  const doMove = async () => {
    if (!selected || !moveTarget) return;
    setMoving(true);
    const { data, error } = await supabase.functions.invoke("move-membership-slot", {
      body: { membership_id: selected.id, target_slot_id: moveTarget },
    });
    setMoving(false);
    if (error) {
      let message = error.message;
      try {
        const body = await (error as unknown as { context?: Response }).context?.json();
        if (body?.error) message = body.error;
      } catch {
        /* not JSON */
      }
      toast({ title: "Move rejected", description: message, variant: "destructive" });
      return;
    }
    toast({
      title: "Membership moved",
      description: `${data?.created_occurrences ?? 0} future lessons rescheduled to ${DAYS[data?.day_of_week ?? 0]} ${timeLabel(data?.start_time)}.`,
    });
    setMoveOpen(false);
    setMoveTarget("");
    await fetchData();
    setSelectedId(selected.id);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Memberships</h1>
          <p className="text-sm text-muted-foreground">
            Families enrolled in a weekly spot. Search, move, or cancel.
          </p>
          <p className="text-sm text-muted-foreground">
            Enrolling someone new?{" "}
            <Link to="/admin/standing-slots" className="text-primary underline underline-offset-2">
              Hold a time on Class times.
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {FAMILY_ENROLL_ENABLED && (
            <Button onClick={() => setEnrollFamilyOpen(true)}>Enroll a family</Button>
          )}
          <Button variant="outline" asChild>
            <Link to="/admin/standing-slots">Hold a spot over the phone</Link>
          </Button>
        </div>


      </div>

      {FAMILY_ENROLL_ENABLED && (
        <EnrollFamilyDialog
          open={enrollFamilyOpen}
          onOpenChange={setEnrollFamilyOpen}
          onSent={() => {
            setHoldsRefresh((v) => v + 1);
            void fetchData();
          }}
        />
      )}


      <MembershipHoldsPanel refreshKey={holdsRefresh} />




      <Card className="p-3 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search swimmer, parent, email, or phone"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={planFilter} onValueChange={setPlanFilter}>
            <SelectTrigger className="w-[11rem]"><SelectValue placeholder="Program" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All programs</SelectItem>
              {(Object.keys(PLAN_LABELS) as PlanKey[]).map((k) => (
                <SelectItem key={k} value={k}>{PLAN_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[10rem]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {["active", "pending_cancel", "paused", "cancelled"].map((s) => (
                <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={dayFilter} onValueChange={setDayFilter}>
            <SelectTrigger className="w-[10rem]"><SelectValue placeholder="Day" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any day</SelectItem>
              {DAYS.map((d, i) => (
                <SelectItem key={d} value={String(i)}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={includeInactive} onCheckedChange={setIncludeInactive} />
            Include cancelled and paused
          </label>
        </div>
      </Card>

      <Card className="overflow-x-auto">
        {loading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading memberships
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No memberships match.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Swimmer</th>
                <th className="px-3 py-2 font-medium">Program</th>
                <th className="px-3 py-2 font-medium">Day &amp; time</th>
                <th className="px-3 py-2 font-medium">Instructor</th>
                <th className="px-3 py-2 font-medium">Level</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Next charge</th>
                <th className="px-3 py-2 font-medium">Flags</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const slot = m.standing_slot_id ? slotById.get(m.standing_slot_id) : null;
                return (
                  <tr
                    key={m.id}
                    onClick={() => setSelectedId(m.id)}
                    className="cursor-pointer border-t hover:bg-muted/40"
                  >
                    <td className="px-3 py-2 font-medium">
                      {swimmerName(m)}
                      <div className="text-xs text-muted-foreground">{parentName(m)}</div>
                    </td>
                    <td className="px-3 py-2">{PLAN_LABELS[m.plan_key]}</td>
                    <td className="px-3 py-2">
                      {slot ? `${DAYS[slot.day_of_week]} ${timeLabel(slot.start_time)}` : <span className="text-muted-foreground">No slot</span>}
                    </td>
                    <td className="px-3 py-2">
                      {slot?.instructor_id ? instructors[slot.instructor_id] ?? "--" : <span className="text-muted-foreground">Unassigned</span>}
                    </td>
                    <td className="px-3 py-2">
                      {m.plan_key === "kid_group"
                        ? m.swim_level
                          ? LEVEL_GROUP_NAMES[m.swim_level]
                          : <span className="text-destructive text-xs">Not set</span>
                        : "--"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={m.status === "active" ? "default" : "secondary"}>{m.status.replace("_", " ")}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      {m.current_period_end
                        ? new Date(m.current_period_end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                        : "--"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        {!m.waiver_id && (
                          <span title="Waiver missing" className="inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                            <FileWarning className="h-3 w-3" /> Waiver
                          </span>
                        )}
                        {m.medical_notes && (
                          <span title="Medical notes" className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">
                            <Stethoscope className="h-3 w-3" /> Medical
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{swimmerName(selected)}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <Detail label="Program" value={PLAN_LABELS[selected.plan_key]} />
                  <Detail label="Status" value={selected.status.replace("_", " ")} />
                  <Detail
                    label="Day & time"
                    value={selectedSlot ? `${DAYS[selectedSlot.day_of_week]} ${timeLabel(selectedSlot.start_time)} – ${timeLabel(selectedSlot.end_time)}` : "No slot"}
                  />
                  <Detail
                    label="Instructor"
                    value={selectedSlot?.instructor_id ? instructors[selectedSlot.instructor_id] ?? "--" : "Unassigned"}
                  />
                  <Detail label="Parent" value={parentName(selected)} />
                  <Detail label="Parent email" value={selected.parent_email ?? "--"} />
                  <Detail label="Parent phone" value={selected.parent_phone ?? "--"} />
                  <Detail label="Start date" value={dateLabel(selected.start_date)} />
                  <Detail label="First lesson" value={dateLabel(occurrences[0]?.occurrence_date ?? null)} />
                  <Detail
                    label="Monthly price"
                    value={selected.recurring_consent_amount_cents ? `$${(selected.recurring_consent_amount_cents / 100).toFixed(0)}` : "--"}
                  />
                  <Detail
                    label="Next charge"
                    value={selected.current_period_end ? new Date(selected.current_period_end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "--"}
                  />
                  {selected.cancel_effective_date && (
                    <Detail label="Cancels on" value={dateLabel(selected.cancel_effective_date)} />
                  )}
                </div>

                {!selected.waiver_id && (
                  <div className="flex items-center gap-2 rounded border border-destructive/40 bg-destructive/5 p-2 text-destructive">
                    <AlertTriangle className="h-4 w-4" /> No waiver on file
                  </div>
                )}
                {selected.medical_notes && (
                  <div className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-900">
                    <div className="font-medium">Medical notes</div>
                    <div>{selected.medical_notes}</div>
                  </div>
                )}
                {selected.notes && (
                  <div className="rounded border bg-muted/40 p-2">
                    <div className="font-medium">Notes</div>
                    <div>{selected.notes}</div>
                  </div>
                )}

                {selected.plan_key === "kid_group" && (
                  <div className="space-y-2 rounded border p-3">
                    <div className="font-medium">Swim level</div>
                    <div className="flex items-center gap-2">
                      <Select value={levelDraft} onValueChange={setLevelDraft}>
                        <SelectTrigger className="w-[12rem]"><SelectValue placeholder="Select level" /></SelectTrigger>
                        <SelectContent>
                          {SWIM_LEVELS.map((lv) => (
                            <SelectItem key={lv} value={lv}>{LEVEL_GROUP_NAMES[lv]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" onClick={saveLevel} disabled={savingLevel || levelDraft === (selected.swim_level ?? "")}>
                        {savingLevel && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save level
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-2 rounded border p-3">
                  <div className="font-medium">Upcoming lessons</div>
                  {occLoading ? (
                    <div className="text-muted-foreground">Loading</div>
                  ) : occurrences.length === 0 ? (
                    <div className="text-muted-foreground">No upcoming lessons.</div>
                  ) : (
                    <ul className="space-y-1">
                      {occurrences.map((o) => (
                        <li key={o.id} className="flex justify-between">
                          <span>{dateLabel(o.occurrence_date)} · {timeLabel(o.start_time)}</span>
                          <span className="text-muted-foreground">{o.status}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setMoveOpen(true)}>Move to a different slot</Button>
                  <Button variant="destructive" onClick={() => setCancelOpen(true)} disabled={selected.status !== "active"}>
                    Cancel membership
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Move dialog */}
      <Dialog open={moveOpen} onOpenChange={(o) => { setMoveOpen(o); if (!o) setMoveTarget(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move to a different slot</DialogTitle>
            <DialogDescription>
              All future scheduled lessons will be removed and regenerated on the new day and time. Past lessons are
              untouched, and billing does not change.
            </DialogDescription>
          </DialogHeader>
          <Select value={moveTarget} onValueChange={setMoveTarget}>
            <SelectTrigger><SelectValue placeholder="Choose a slot" /></SelectTrigger>
            <SelectContent>
              {targetSlots.map((s) => (
                <SelectItem key={s.id} value={s.id} disabled={s.enrolled >= s.capacity}>
                  {DAYS[s.day_of_week]} {timeLabel(s.start_time)} ·{" "}
                  {s.instructor_id ? instructors[s.instructor_id] ?? "Unassigned" : "Unassigned"} ·{" "}
                  {Math.max(0, s.capacity - s.enrolled)} of {s.capacity} open
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveOpen(false)}>Cancel</Button>
            <Button onClick={doMove} disabled={!moveTarget || moving}>
              {moving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Move membership
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel dialog */}
      <Dialog open={cancelOpen} onOpenChange={(o) => { setCancelOpen(o); if (!o) { setCancelDetail(""); setCancelResult(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel membership</DialogTitle>
            <DialogDescription>
              This schedules the cancellation the same way the family's own cancel link does. One more charge is
              allowed, then the membership ends.
            </DialogDescription>
          </DialogHeader>
          {cancelResult ? (
            <div className="space-y-1 text-sm">
              <div>Final charge: <span className="font-medium">{cancelResult.finalChargeDate ?? "--"}</span></div>
              <div>Effective end date: <span className="font-medium">{cancelResult.effectiveDate ?? "--"}</span></div>
            </div>
          ) : (
            <div className="space-y-3">
              <Select value={cancelReason} onValueChange={setCancelReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["too_busy", "graduated", "cost", "moved", "other"].map((r) => (
                    <SelectItem key={r} value={r}>{r.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                value={cancelDetail}
                onChange={(e) => setCancelDetail(e.target.value)}
                placeholder="Optional detail from the family"
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Close</Button>
            {!cancelResult && (
              <Button variant="destructive" onClick={doCancel} disabled={cancelling}>
                {cancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm cancellation
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const Detail = ({ label, value }: { label: string; value: string }) => (
  <div>
    <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
    <div>{value}</div>
  </div>
);

export default MembershipsAdmin;

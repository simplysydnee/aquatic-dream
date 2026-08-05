import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Check, Loader2, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/lib/phone";
import { LEVEL_GROUP_NAMES } from "@/components/swim-enrollment/types";
import { resolveSwimmerWaiver } from "@/lib/swimmerWaiver";
import { useFamilySearch, type FamilyGroup } from "@/hooks/useFamilySearch";
import { useSlotOpenings, type OpeningPlanKey, type OpeningSlot } from "@/hooks/useSlotOpenings";
import { computeOpenTimes } from "@/lib/openTimes";


interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent?: () => void;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PLAN_LABELS: Record<OpeningPlanKey, string> = {
  kid_group: "Small Group Swim",
  private: "Private Swim",
  adult_group: "Adult Swim",
};
const PLAN_ORDER: OpeningPlanKey[] = ["kid_group", "private", "adult_group"];
const DRAFT_HOLD_MINUTES = 20;

const fmtTime = (t: string) => {
  const [h, m] = t.split(":").map((n) => parseInt(n, 10));
  if (Number.isNaN(h)) return t;
  const period = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m ?? 0).padStart(2, "0")} ${period}`;
};

const splitName = (full?: string | null) => {
  const parts = (full || "").trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] || "", last: parts.slice(1).join(" ") };
};

const digitsOf = (v?: string | null) => (v || "").replace(/\D/g, "");

/** Level comes from the slot, never from the swimmer. */
const levelFromSlot = (slot: OpeningSlot): string | null => {
  if (slot.plan_key !== "kid_group") return null;
  const accepted = (slot.accepted_levels || []).filter(Boolean);
  if (accepted.length === 1) return accepted[0];
  return accepted.length === 0 ? slot.swim_level ?? null : null;
};

type FormsStatus = "checking" | "known" | "needs_forms";

interface Assignment {
  holdId: string;
  slotId: string;
  planKey: OpeningPlanKey;
  dayOfWeek: number;
  startTime: string;
  instructorName: string | null;
  swimLevel: string | null;
}

interface CurrentMembership {
  planKey: OpeningPlanKey;
  dayOfWeek: number | null;
  startTime: string | null;
}

interface RosterRow {
  key: string;
  name: string;
  dob: string | null;
  parentEmail: string | null;
  isNew: boolean;
  formsStatus: FormsStatus;
  waiverId: string | null;
  current: CurrentMembership[];
  assignment: Assignment | null;
}

/** Reads the status and message out of a failed edge function call. */
const readFunctionError = async (
  error: unknown,
  data: { error?: string } | null,
): Promise<{ status: number | null; message: string }> => {
  const fallback = data?.error || (error as { message?: string } | null)?.message || "Could not hold that time";
  const context = (error as { context?: Response } | null)?.context;
  if (context && typeof context.status === "number") {
    let message = fallback;
    try {
      const body = await context.clone().json();
      if (body?.error) message = String(body.error);
    } catch {
      // non-JSON body, keep the fallback
    }
    return { status: context.status, message };
  }
  return { status: null, message: fallback };
};

export function EnrollFamilyDialog({ open, onOpenChange, onSent }: Props) {
  const [step, setStep] = useState<"search" | "roster" | "assign" | "review">("search");
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState<FamilyGroup | null>(null);
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [assigningKey, setAssigningKey] = useState<string | null>(null);
  const [planChoice, setPlanChoice] = useState<OpeningPlanKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [takenNotice, setTakenNotice] = useState<string | null>(null);
  const [sendResults, setSendResults] = useState<{ label: string; ok: boolean; detail: string }[]>([]);


  const { families, searching } = useFamilySearch(query, { groupByFamily: true });
  const { slots, occupancy, instructorNames, plans, refresh } = useSlotOpenings();

  useEffect(() => {
    if (!open) return;
    setStep("search");
    setQuery("");
    setFamily(null);
    setRows([]);
    setAssigningKey(null);
    setPlanChoice(null);
    setSendResults([]);
  }, [open]);

  const priceOf = useCallback(
    (planKey: OpeningPlanKey) => plans.find((p) => p.plan_key === planKey)?.monthly_price_cents ?? null,
    [plans],
  );

  const instructorOf = useCallback(
    (slot: OpeningSlot) => (slot.instructor_id ? instructorNames[slot.instructor_id] ?? null : null),
    [instructorNames],
  );

  const openOf = useCallback(
    (slot: OpeningSlot) => Math.max(0, slot.capacity - (occupancy[slot.id] ?? 0)),
    [occupancy],
  );

  const pickFamily = async (group: FamilyGroup) => {
    setFamily(group);
    setStep("roster");
    const base: RosterRow[] = group.swimmers.map((s, i) => ({
      key: `known-${i}-${s.swimmer_name.toLowerCase()}`,
      name: s.swimmer_name,
      dob: s.child_dob,
      parentEmail: s.parent_email ?? group.parent_email,
      isNew: false,
      formsStatus: "checking",
      waiverId: null,
      current: [],
      assignment: null,
    }));
    setRows(base);

    // Waiver status per swimmer. DOB missing means NEEDS FORMS without a lookup.
    void Promise.all(
      base.map(async (row) => {
        if (!row.dob) return { key: row.key, status: "needs_forms" as FormsStatus, waiverId: null };
        const { first, last } = splitName(row.name);
        const res = await resolveSwimmerWaiver({
          firstName: first,
          lastName: last,
          dob: row.dob,
          parentEmail: row.parentEmail,
          parentPhone: group.parent_phone,
        });
        return {
          key: row.key,
          status: (res.onFile ? "known" : "needs_forms") as FormsStatus,
          waiverId: res.waiverId,
        };
      }),
    ).then((results) => {
      setRows((prev) =>
        prev.map((r) => {
          const hit = results.find((x) => x.key === r.key);
          return hit ? { ...r, formsStatus: hit.status, waiverId: hit.waiverId } : r;
        }),
      );
    });

    // Current memberships, for context only.
    void loadCurrentMemberships(group);
  };

  const loadCurrentMemberships = async (group: FamilyGroup) => {
    const phone = digitsOf(group.parent_phone);
    const emails = group.parent_emails.length ? group.parent_emails : group.parent_email ? [group.parent_email] : [];
    const filters: string[] = [];
    if (phone.length >= 7) filters.push(`parent_phone.ilike.%${phone}%`);
    for (const e of emails) filters.push(`parent_email.ilike.${e}`);
    if (!filters.length) return;

    const { data } = await supabase
      .from("memberships")
      .select("child_first_name, child_last_name, plan_key, standing_slots(day_of_week, start_time)")
      .in("status", ["active", "pending_cancel", "paused"])
      .or(filters.join(","));

    const byName = new Map<string, CurrentMembership[]>();
    for (const m of (data as unknown as {
      child_first_name: string | null;
      child_last_name: string | null;
      plan_key: OpeningPlanKey;
      standing_slots: { day_of_week: number; start_time: string } | null;
    }[]) || []) {
      const name = `${m.child_first_name || ""} ${m.child_last_name || ""}`.trim().toLowerCase();
      if (!name) continue;
      const list = byName.get(name) ?? [];
      list.push({
        planKey: m.plan_key,
        dayOfWeek: m.standing_slots?.day_of_week ?? null,
        startTime: m.standing_slots?.start_time ?? null,
      });
      byName.set(name, list);
    }
    setRows((prev) =>
      prev.map((r) => ({ ...r, current: byName.get(r.name.trim().toLowerCase()) ?? r.current })),
    );
  };

  const addSwimmer = () => {
    setRows((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}`,
        name: "",
        dob: null,
        parentEmail: family?.parent_email ?? null,
        isNew: true,
        formsStatus: "needs_forms",
        waiverId: null,
        current: [],
        assignment: null,
      },
    ]);
  };

  const renameRow = (key: string, name: string) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, name } : r)));

  const removeRow = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key));

  // --- Step 3: assign a time ---------------------------------------------

  const assignRow = rows.find((r) => r.key === assigningKey) ?? null;

  const openTimes = useMemo(
    () => computeOpenTimes(slots, occupancy, planChoice),
    [planChoice, slots, occupancy],
  );


  const [coachChoice, setCoachChoice] = useState<OpeningSlot[] | null>(null);

  const chooseTime = (openSlots: OpeningSlot[]) => {
    if (openSlots.length === 1) {
      void createDraftHold(openSlots[0]);
      return;
    }
    setCoachChoice(openSlots);
  };

  const createDraftHold = async (slot: OpeningSlot) => {
    if (!family || !assignRow) return;
    const name = assignRow.name.trim();
    if (name.length < 2) {
      toast.error("Enter the swimmer's name first");
      return;
    }
    setBusy(true);
    setTakenNotice(null);
    try {
      const { data, error } = await supabase.functions.invoke("create-membership-hold", {
        body: {
          standing_slot_id: slot.id,
          swimmer_name: name,
          parent_name: family.parent_name,
          parent_phone: family.parent_phone,
          parent_email: assignRow.parentEmail || family.parent_email,
          swim_level: levelFromSlot(slot),
          existing_waiver_id: assignRow.waiverId,
          send_sms: false,
          hold_minutes: DRAFT_HOLD_MINUTES,
        },
      });

      if (error || data?.error) {
        const detail = await readFunctionError(error, data);
        if (detail.status === 409 || detail.status === 404) {
          // Someone on /join (or another desk tab) took it while this list was on screen.
          setCoachChoice(null);
          await refresh();
          const label = `${DAYS[slot.day_of_week]} ${fmtTime(slot.start_time)}`;
          const message = `${label} was just taken. Times below are refreshed, pick another.`;
          setTakenNotice(message);
          toast.error(message);
          return;
        }
        throw new Error(detail.message);
      }

      const assignment: Assignment = {
        holdId: data.hold_id,
        slotId: slot.id,
        planKey: slot.plan_key,
        dayOfWeek: slot.day_of_week,
        startTime: slot.start_time,
        instructorName: instructorOf(slot),
        swimLevel: levelFromSlot(slot),
      };
      setRows((prev) => prev.map((r) => (r.key === assignRow.key ? { ...r, assignment } : r)));
      setCoachChoice(null);
      setAssigningKey(null);
      setPlanChoice(null);
      setStep("roster");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || "Could not hold that time");
    } finally {
      setBusy(false);
    }
  };


  const unassign = async (row: RosterRow) => {
    if (!row.assignment) return;
    setBusy(true);
    const { error } = await supabase
      .from("membership_holds")
      .update({ status: "cancelled" })
      .eq("id", row.assignment.holdId);
    setBusy(false);
    if (error) {
      toast.error("Could not release that time");
      return;
    }
    setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, assignment: null } : r)));
    await refresh();
  };

  // --- Step 4: review and send -------------------------------------------

  const assigned = rows.filter((r) => r.assignment && r.name.trim().length > 1);
  const totalCents = assigned.reduce((sum, r) => sum + (priceOf(r.assignment!.planKey) ?? 0), 0);

  const sendInvites = async () => {
    if (!assigned.length) return;
    setBusy(true);
    setSendResults([]);
    const knownIds = assigned.filter((r) => !r.isNew && r.formsStatus === "known").map((r) => r.assignment!.holdId);
    const others = assigned.filter((r) => r.isNew || r.formsStatus !== "known");

    const batches: { label: string; ids: string[] }[] = [];
    if (knownIds.length) {
      batches.push({
        label: assigned
          .filter((r) => !r.isNew && r.formsStatus === "known")
          .map((r) => r.name)
          .join(", "),
        ids: knownIds,
      });
    }
    for (const r of others) batches.push({ label: r.name, ids: [r.assignment!.holdId] });

    const results: { label: string; ok: boolean; detail: string }[] = [];
    for (const batch of batches) {
      try {
        const { data, error } = await supabase.functions.invoke("send-membership-hold-invites", {
          body: { hold_ids: batch.ids },
        });
        if (error || data?.error) throw new Error(data?.error || error?.message || "Send failed");
        results.push({
          label: batch.label,
          ok: true,
          detail: data?.sent ? "Text sent" : "Already sent, skipped",
        });
      } catch (e) {
        results.push({ label: batch.label, ok: false, detail: (e as Error).message });
      }
    }
    setSendResults(results);
    setBusy(false);
    if (results.every((r) => r.ok)) {
      toast.success(`Sent ${results.length} text${results.length === 1 ? "" : "s"}`);
      onSent?.();
    } else {
      toast.error("Some texts did not send. Retry the failed ones.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enroll a family</DialogTitle>
        </DialogHeader>

        {step === "search" && (
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
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {families.map((f, i) => (
                <button
                  key={`${f.parent_phone || f.parent_email || i}`}
                  type="button"
                  onClick={() => void pickFamily(f)}
                  className="w-full text-left rounded-md border p-3 hover:border-primary hover:bg-primary/5"
                >
                  <div className="text-sm font-medium">{f.parent_name || "No parent name"}</div>
                  <div className="text-xs text-muted-foreground">
                    {f.parent_phone ? formatPhone(f.parent_phone) : "No phone"}
                    {f.parent_email ? ` · ${f.parent_email}` : ""}
                  </div>
                  <div className="mt-1 text-xs text-foreground">
                    {f.swimmers.map((s) => s.swimmer_name).join(", ")}
                  </div>
                </button>
              ))}
              {!searching && query.trim().length >= 2 && families.length === 0 && (
                <p className="text-xs text-muted-foreground">No match found.</p>
              )}
            </div>
          </div>
        )}

        {step === "roster" && family && (
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <div className="font-medium">{family.parent_name}</div>
              <div className="text-xs text-muted-foreground">
                {family.parent_phone ? formatPhone(family.parent_phone) : "No phone"}
              </div>
            </div>

            <div className="space-y-2">
              {rows.map((row) => {
                const duplicate =
                  row.assignment &&
                  row.current.some((c) => c.planKey === row.assignment!.planKey);
                return (
                  <div key={row.key} className="rounded-md border p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        value={row.name}
                        placeholder="Swimmer name"
                        onChange={(e) => renameRow(row.key, e.target.value)}
                        className="h-9 flex-1 min-w-[10rem]"
                      />
                      {row.formsStatus === "checking" ? (
                        <Badge variant="outline" className="gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" /> Checking
                        </Badge>
                      ) : row.formsStatus === "known" ? (
                        <Badge variant="secondary">KNOWN</Badge>
                      ) : (
                        <Badge variant="outline">NEEDS FORMS</Badge>
                      )}
                      {row.isNew && (
                        <Button size="sm" variant="ghost" onClick={() => removeRow(row.key)}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    {row.current.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Currently enrolled:{" "}
                        {row.current
                          .map(
                            (c) =>
                              `${PLAN_LABELS[c.planKey]}${
                                c.dayOfWeek !== null && c.startTime
                                  ? ` · ${DAYS[c.dayOfWeek]} ${fmtTime(c.startTime)}`
                                  : ""
                              }`,
                          )
                          .join(" · ")}
                      </p>
                    )}

                    {row.assignment ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-primary/5 border border-primary/40 px-3 py-2 text-xs">
                        <span>
                          {PLAN_LABELS[row.assignment.planKey]} · {DAYS[row.assignment.dayOfWeek]}{" "}
                          {fmtTime(row.assignment.startTime)}
                          {row.assignment.instructorName ? ` · ${row.assignment.instructorName}` : ""}
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => void unassign(row)} disabled={busy}>
                          Unassign
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setAssigningKey(row.key);
                          setPlanChoice(null);
                          setCoachChoice(null);
                          setStep("assign");
                        }}
                      >
                        Assign a time
                      </Button>
                    )}

                    {duplicate && (
                      <p className="text-xs text-amber-600">
                        Heads up: this swimmer already holds a {PLAN_LABELS[row.assignment!.planKey]} spot.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <Button variant="outline" className="w-full" onClick={addSwimmer}>
              <Plus className="mr-2 h-4 w-4" /> Add a swimmer
            </Button>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("search")}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button className="flex-1" disabled={assigned.length === 0} onClick={() => setStep("review")}>
                Review and send
              </Button>
            </div>
          </div>
        )}

        {step === "assign" && assignRow && (
          <div className="space-y-3">
            <div className="text-sm">
              Assigning a time for{" "}
              <span className="font-medium">{assignRow.name || "this swimmer"}</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {PLAN_ORDER.filter((p) => slots.some((s) => s.plan_key === p)).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={planChoice === p ? "default" : "outline"}
                  onClick={() => {
                    setPlanChoice(p);
                    setCoachChoice(null);
                  }}
                >
                  {PLAN_LABELS[p]}
                </Button>
              ))}
            </div>

            {planChoice && coachChoice && (
              <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">
                  More than one coach is free at {fmtTime(coachChoice[0].start_time)}. Which one?
                </p>
                <div className="flex flex-wrap gap-2">
                  {coachChoice.map((s) => (
                    <Button
                      key={s.id}
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void createDraftHold(s)}
                    >
                      {instructorOf(s) || "Unassigned"}
                    </Button>
                  ))}
                  <Button size="sm" variant="ghost" onClick={() => setCoachChoice(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {planChoice && !coachChoice && (
              <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                {openTimes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No openings in this program.</p>
                ) : (
                  openTimes.map((d) => (
                    <div key={d.dow} className="flex flex-wrap items-center gap-2">
                      <span className="w-20 shrink-0 text-xs text-muted-foreground">{DAYS[d.dow]}</span>
                      {d.times.map((t) => (
                        <button
                          key={t.start}
                          type="button"
                          disabled={busy}
                          onClick={() => chooseTime(t.openSlots)}
                          className={cn(
                            "inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-all",
                            "hover:border-primary hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95",
                          )}
                        >
                          {fmtTime(t.start)} · {t.count}
                        </button>
                      ))}
                    </div>
                  ))
                )}
                {planChoice === "kid_group" && (
                  <p className="text-[11px] text-muted-foreground">
                    Level comes from the class:{" "}
                    {Array.from(
                      new Set(
                        slots
                          .filter((s) => s.plan_key === "kid_group")
                          .flatMap((s) => (s.accepted_levels?.length ? s.accepted_levels : s.swim_level ? [s.swim_level] : [])),
                      ),
                    )
                      .map((l) => LEVEL_GROUP_NAMES[l as keyof typeof LEVEL_GROUP_NAMES] ?? l)
                      .join(", ")}
                  </p>
                )}
              </div>
            )}

            <Button
              variant="outline"
              onClick={() => {
                setAssigningKey(null);
                setCoachChoice(null);
                setStep("roster");
              }}
              disabled={busy}
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to roster
            </Button>
          </div>
        )}

        {step === "review" && family && (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 px-3 font-medium">Swimmer</th>
                    <th className="py-2 px-3 font-medium">Program</th>
                    <th className="py-2 px-3 font-medium">Day and time</th>
                    <th className="py-2 px-3 font-medium">Instructor</th>
                    <th className="py-2 px-3 font-medium text-right">Monthly</th>
                  </tr>
                </thead>
                <tbody>
                  {assigned.map((r) => (
                    <tr key={r.key} className="border-b last:border-0">
                      <td className="py-2 px-3 font-medium">{r.name}</td>
                      <td className="py-2 px-3">{PLAN_LABELS[r.assignment!.planKey]}</td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        {DAYS[r.assignment!.dayOfWeek]} {fmtTime(r.assignment!.startTime)}
                      </td>
                      <td className="py-2 px-3">{r.assignment!.instructorName || "—"}</td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {(() => {
                          const cents = priceOf(r.assignment!.planKey);
                          return cents === null ? "—" : `$${(cents / 100).toFixed(0)}`;
                        })()}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-2 px-3 font-medium" colSpan={4}>
                      Combined monthly
                    </td>
                    <td className="py-2 px-3 text-right font-semibold tabular-nums">
                      ${(totalCents / 100).toFixed(0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="text-xs text-muted-foreground">
              Known swimmers get one text together. Every new swimmer gets their own text. No card is
              taken here and no consent is collected at the desk.
            </p>

            {sendResults.length > 0 && (
              <div className="space-y-1">
                {sendResults.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {r.ok ? (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <X className="h-3.5 w-3.5 text-destructive" />
                    )}
                    <span className="font-medium">{r.label}</span>
                    <span className="text-muted-foreground">{r.detail}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("roster")} disabled={busy}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button className="flex-1" onClick={() => void sendInvites()} disabled={busy || !assigned.length}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send signup links
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

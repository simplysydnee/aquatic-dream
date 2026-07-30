import { Fragment as FragmentRow, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { ArrowUpDown, Plus, Loader2, Save, X, ChevronDown, ChevronRight, Mail, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { StandingSlotsSummary } from "@/components/admin/StandingSlotsSummary";
import {
  CreateMembershipHoldDialog,
  type HoldSlotTarget,
} from "@/components/admin/holds/CreateMembershipHoldDialog";
import { MembershipHoldsPanel } from "@/components/admin/holds/MembershipHoldsPanel";


interface RosterMember {
  id: string;
  standing_slot_id: string | null;
  plan_key: PlanKey;
  child_first_name: string | null;
  child_last_name: string | null;
  parent_first_name: string | null;
  parent_last_name: string | null;
  parent_email: string | null;
  parent_phone: string | null;
  status: string;
  swim_level?: SwimLevel | null;
}

type PlanKey = "kid_group" | "private" | "adult_group";
type SwimLevel = "white" | "red" | "yellow" | "blue" | "green";

const PLAN_LABELS: Record<PlanKey, string> = {
  kid_group: "Small Group Swim",
  private: "Private Swim",
  adult_group: "Adult Swim",
};

const SWIM_LEVELS: SwimLevel[] = ["white", "red", "yellow", "blue", "green"];
import { LEVEL_GROUP_NAMES } from "@/components/swim-enrollment/types";
const LEVEL_LABELS = LEVEL_GROUP_NAMES;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DEFAULT_LOCATION = "1212 Kansas Ave, Modesto, CA";

interface Plan {
  plan_key: PlanKey;
  capacity_per_slot: number;
  name: string;
}
interface Instructor {
  id: string;
  name: string;
  is_active: boolean;
}
interface Slot {
  id: string;
  plan_key: PlanKey;
  instructor_id: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  capacity: number;
  location: string | null;
  active: boolean;
  swim_level: SwimLevel | null;
  accepted_levels?: string[] | null;
}

interface NewSlot {
  plan_key: PlanKey;
  instructor_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  capacity: number;
  location: string;
  active: boolean;
  swim_level: SwimLevel | null;
}

type SortKey =
  | "plan_key"
  | "instructor"
  | "day_of_week"
  | "start_time"
  | "end_time"
  | "capacity"
  | "enrolled"
  | "location"
  | "active";

const defaultNewSlot = (plans: Plan[]): NewSlot => ({
  plan_key: "kid_group",
  instructor_id: "",
  day_of_week: 1,
  start_time: "16:00",
  end_time: "16:30",
  capacity: plans.find((p) => p.plan_key === "kid_group")?.capacity_per_slot ?? 3,
  location: DEFAULT_LOCATION,
  active: true,
  swim_level: "white",
});

const timeLabel = (t: string) => {
  const [h, m] = t.split(":").map((n) => parseInt(n, 10));
  if (Number.isNaN(h)) return t;
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${m.toString().padStart(2, "0")}${ampm}`;
};

const StandingSlotsAdmin = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [enrolledCounts, setEnrolledCounts] = useState<Record<string, number>>({});
  const [rosterBySlot, setRosterBySlot] = useState<Record<string, RosterMember[]>>({});
  const [occupancyCounts, setOccupancyCounts] = useState<Record<string, number>>({});
  const [holdTarget, setHoldTarget] = useState<HoldSlotTarget | null>(null);
  const [holdsRefresh, setHoldsRefresh] = useState(0);

  const [expandedSlots, setExpandedSlots] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const [filterPlan, setFilterPlan] = useState<string>("all");
  const [filterInstructor, setFilterInstructor] = useState<string>("all");
  const [filterDay, setFilterDay] = useState<string>("all");
  const [filterActive, setFilterActive] = useState<string>("active");

  const [sortKey, setSortKey] = useState<SortKey>("day_of_week");
  const [sortAsc, setSortAsc] = useState(true);

  const [adding, setAdding] = useState(false);
  const [newSlot, setNewSlot] = useState<NewSlot | null>(null);
  const [saving, setSaving] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Slot | null>(null);

  const loadAll = async () => {
    setLoading(true);
    const [planRes, instRes, slotRes, memRes, occRes, holdRes] = await Promise.all([
      supabase.from("membership_plans").select("plan_key, capacity_per_slot, name").eq("active", true),
      supabase.rpc("get_instructors_admin"),
      supabase.from("standing_slots").select("*"),
      supabase
        .from("memberships")
        .select("id, standing_slot_id, plan_key, child_first_name, child_last_name, parent_first_name, parent_last_name, parent_email, parent_phone, status")
        .eq("status", "active"),
      supabase
        .from("memberships")
        .select("standing_slot_id")
        .in("status", ["active", "pending_cancel", "paused"]),
      supabase
        .from("membership_holds")
        .select("standing_slot_id")
        .eq("status", "held")
        .gt("held_until", new Date().toISOString()),
    ]);



    if (planRes.error) toast({ title: "Plans load failed", description: planRes.error.message, variant: "destructive" });
    if (instRes.error) toast({ title: "Instructors load failed", description: instRes.error.message, variant: "destructive" });
    if (slotRes.error) toast({ title: "Slots load failed", description: slotRes.error.message, variant: "destructive" });

    setPlans((planRes.data as Plan[]) || []);
    setInstructors(((instRes.data as Instructor[]) || []).filter((i) => i.is_active));
    const slotList = (slotRes.data as Slot[]) || [];
    setSlots(slotList);

    const slotLevelById = new Map(slotList.map((s) => [s.id, s.swim_level]));
    const counts: Record<string, number> = {};
    const roster: Record<string, RosterMember[]> = {};
    for (const m of (memRes.data as RosterMember[]) || []) {
      if (!m.standing_slot_id) continue;
      counts[m.standing_slot_id] = (counts[m.standing_slot_id] || 0) + 1;
      (roster[m.standing_slot_id] ||= []).push({
        ...m,
        swim_level: slotLevelById.get(m.standing_slot_id) ?? null,
      });
    }
    for (const list of Object.values(roster)) {
      list.sort((a, b) =>
        (a.child_last_name || "").localeCompare(b.child_last_name || "") ||
        (a.child_first_name || "").localeCompare(b.child_first_name || ""),
      );
    }
    const occ: Record<string, number> = {};
    for (const m of ((occRes.data as { standing_slot_id: string | null }[]) || [])) {
      if (!m.standing_slot_id) continue;
      occ[m.standing_slot_id] = (occ[m.standing_slot_id] || 0) + 1;
    }
    // Live phone holds reserve a spot too, same rule get-open-slots uses.
    for (const h of ((holdRes.data as { standing_slot_id: string | null }[]) || [])) {
      if (!h.standing_slot_id) continue;
      occ[h.standing_slot_id] = (occ[h.standing_slot_id] || 0) + 1;
    }
    setOccupancyCounts(occ);

    setEnrolledCounts(counts);
    setRosterBySlot(roster);
    setLoading(false);
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const instructorName = (id: string | null) =>
    (id && instructors.find((i) => i.id === id)?.name) || "—";

  const instructorNameMap = useMemo(
    () => Object.fromEntries(instructors.map((i) => [i.id, i.name])),
    [instructors],
  );


  const filtered = useMemo(() => {
    let list = slots.slice();
    if (filterPlan !== "all") list = list.filter((s) => s.plan_key === filterPlan);
    if (filterInstructor !== "all") list = list.filter((s) => s.instructor_id === filterInstructor);
    if (filterDay !== "all") list = list.filter((s) => s.day_of_week === parseInt(filterDay, 10));
    if (filterActive === "active") list = list.filter((s) => s.active);
    else if (filterActive === "inactive") list = list.filter((s) => !s.active);

    list.sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      switch (sortKey) {
        case "plan_key":
          av = PLAN_LABELS[a.plan_key];
          bv = PLAN_LABELS[b.plan_key];
          break;
        case "instructor":
          av = instructorName(a.instructor_id);
          bv = instructorName(b.instructor_id);
          break;
        case "enrolled":
          av = enrolledCounts[a.id] || 0;
          bv = enrolledCounts[b.id] || 0;
          break;
        case "active":
          av = a.active ? 1 : 0;
          bv = b.active ? 1 : 0;
          break;
        case "location":
          av = a.location || "";
          bv = b.location || "";
          break;
        default:
          av = a[sortKey] as string | number;
          bv = b[sortKey] as string | number;
      }
      if (av < bv) return sortAsc ? -1 : 1;
      if (av > bv) return sortAsc ? 1 : -1;
      return 0;
    });
    return list;
  }, [slots, filterPlan, filterInstructor, filterDay, filterActive, sortKey, sortAsc, enrolledCounts, instructors]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortAsc(!sortAsc);
    else {
      setSortKey(k);
      setSortAsc(true);
    }
  };

  const startAdd = () => {
    setNewSlot(defaultNewSlot(plans));
    setAdding(true);
  };

  const cancelAdd = () => {
    setAdding(false);
    setNewSlot(null);
  };

  const saveNew = async () => {
    if (!newSlot) return;
    if (!newSlot.instructor_id) {
      toast({ title: "Instructor required", variant: "destructive" });
      return;
    }
    if (newSlot.end_time <= newSlot.start_time) {
      toast({ title: "End time must be after start time", variant: "destructive" });
      return;
    }
    setSaving(true);
    if (newSlot.plan_key === "kid_group" && !newSlot.swim_level) {
      toast({ title: "Swim level required for Small Group Swim", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("standing_slots").insert({
      plan_key: newSlot.plan_key,
      instructor_id: newSlot.instructor_id,
      day_of_week: newSlot.day_of_week,
      start_time: newSlot.start_time,
      end_time: newSlot.end_time,
      capacity: newSlot.capacity,
      location: newSlot.location || DEFAULT_LOCATION,
      active: newSlot.active,
      swim_level: newSlot.plan_key === "kid_group" ? newSlot.swim_level : null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Slot added" });
    cancelAdd();
    await loadAll();
  };

  const startEdit = (s: Slot) => {
    setEditId(s.id);
    setEditDraft({ ...s });
  };
  const cancelEdit = () => {
    setEditId(null);
    setEditDraft(null);
  };
  const saveEdit = async () => {
    if (!editDraft) return;
    if (editDraft.end_time <= editDraft.start_time) {
      toast({ title: "End time must be after start time", variant: "destructive" });
      return;
    }
    if (editDraft.plan_key === "kid_group" && !editDraft.swim_level) {
      toast({ title: "Swim level required for Small Group Swim", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("standing_slots")
      .update({
        plan_key: editDraft.plan_key,
        instructor_id: editDraft.instructor_id,
        day_of_week: editDraft.day_of_week,
        start_time: editDraft.start_time,
        end_time: editDraft.end_time,
        capacity: editDraft.capacity,
        location: editDraft.location || DEFAULT_LOCATION,
        active: editDraft.active,
        swim_level: editDraft.plan_key === "kid_group" ? editDraft.swim_level : null,
      })
      .eq("id", editDraft.id);
    setSaving(false);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Slot updated" });
    cancelEdit();
    await loadAll();
  };

  const toggleActive = async (s: Slot, next: boolean) => {
    const enrolled = enrolledCounts[s.id] || 0;
    if (!next && enrolled > 0) {
      toast({
        title: "Deactivated",
        description: `${enrolled} active membership(s) still reference this slot. Slot is hidden but not deleted.`,
      });
    }
    const { error } = await supabase.from("standing_slots").update({ active: next }).eq("id", s.id);
    if (error) {
      toast({ title: "Toggle failed", description: error.message, variant: "destructive" });
      return;
    }
    await loadAll();
  };

  const toggleExpand = (id: string) => {
    setExpandedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Inactive slots are held in reserve and are not bookable.
  const reserveCount = useMemo(() => slots.filter((s) => !s.active).length, [slots]);


  const SortHead = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <button
      className="inline-flex items-center gap-1 hover:text-foreground"
      onClick={() => toggleSort(k)}
    >
      {children}
      <ArrowUpDown className={cn("h-3 w-3", sortKey === k ? "text-foreground" : "opacity-40")} />
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-semibold text-foreground">Standing Slots</h1>
          <p className="text-sm text-muted-foreground">
            Permanent weekly class slots that memberships enroll into.
          </p>
        </div>
        <Button onClick={startAdd} disabled={adding}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add slot
        </Button>
      </div>

      <StandingSlotsSummary
        slots={slots}
        occupancy={occupancyCounts}
        instructorNames={instructorNameMap}
        loading={loading}
        onHoldSlot={(slotId) => {
          const s = slots.find((x) => x.id === slotId);
          if (!s) return;
          setHoldTarget({
            id: s.id,
            plan_key: s.plan_key,
            day_of_week: s.day_of_week,
            start_time: s.start_time,
            end_time: s.end_time,
            instructor_name: s.instructor_id ? instructorNameMap[s.instructor_id] ?? null : null,
            monthly_price_cents: null,
            swim_level: s.swim_level,
            accepted_levels: s.accepted_levels ?? null,
          });
        }}
      />

      <MembershipHoldsPanel
        refreshKey={holdsRefresh}
        onChanged={() => void loadAll()}
        collapsedPrefix={
          reserveCount > 0
            ? `${reserveCount} slot${reserveCount === 1 ? "" : "s"} in reserve`
            : undefined
        }
      />

      <CreateMembershipHoldDialog
        slot={holdTarget}
        open={!!holdTarget}
        onOpenChange={(o) => !o && setHoldTarget(null)}
        onCreated={() => {
          setHoldsRefresh((n) => n + 1);
          void loadAll();
        }}
      />



      <Card className="p-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Program</label>
          <Select value={filterPlan} onValueChange={setFilterPlan}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All programs</SelectItem>
              {(Object.keys(PLAN_LABELS) as PlanKey[]).map((k) => (
                <SelectItem key={k} value={k}>{PLAN_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Instructor</label>
          <Select value={filterInstructor} onValueChange={setFilterInstructor}>
            <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All instructors</SelectItem>
              {instructors.map((i) => (
                <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Day</label>
          <Select value={filterDay} onValueChange={setFilterDay}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All days</SelectItem>
              {DAYS.map((d, i) => (
                <SelectItem key={d} value={String(i)}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Status</label>
          <Select value={filterActive} onValueChange={setFilterActive}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active only</SelectItem>
              <SelectItem value="inactive">Inactive only</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-2"></th>
              <th className="text-left px-3 py-2"><SortHead k="plan_key">Program</SortHead></th>
              <th className="text-left px-3 py-2">Level</th>
              <th className="text-left px-3 py-2"><SortHead k="instructor">Instructor</SortHead></th>
              <th className="text-left px-3 py-2"><SortHead k="day_of_week">Day</SortHead></th>
              <th className="text-left px-3 py-2"><SortHead k="start_time">Start</SortHead></th>
              <th className="text-left px-3 py-2"><SortHead k="end_time">End</SortHead></th>
              <th className="text-left px-3 py-2"><SortHead k="capacity">Capacity</SortHead></th>
              <th className="text-left px-3 py-2"><SortHead k="enrolled">Enrolled</SortHead></th>
              <th className="text-left px-3 py-2">Fill</th>
              <th className="text-left px-3 py-2"><SortHead k="location">Location</SortHead></th>
              <th className="text-left px-3 py-2"><SortHead k="active">Active</SortHead></th>
              <th className="text-right px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {adding && newSlot && (
              <tr className="border-t bg-amber-50/60">
                <td className="px-2 py-1"></td>
                <td className="px-2 py-1">
                  <Select
                    value={newSlot.plan_key}
                    onValueChange={(v: PlanKey) => {
                      const cap = plans.find((p) => p.plan_key === v)?.capacity_per_slot ?? newSlot.capacity;
                      setNewSlot({
                        ...newSlot,
                        plan_key: v,
                        capacity: cap,
                        swim_level: v === "kid_group" ? (newSlot.swim_level ?? "white") : null,
                      });
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(PLAN_LABELS) as PlanKey[]).map((k) => (
                        <SelectItem key={k} value={k}>{PLAN_LABELS[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-2 py-1">
                  {newSlot.plan_key === "kid_group" ? (
                    <Select
                      value={newSlot.swim_level ?? ""}
                      onValueChange={(v: SwimLevel) => setNewSlot({ ...newSlot, swim_level: v })}
                    >
                      <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="Level…" /></SelectTrigger>
                      <SelectContent>
                        {SWIM_LEVELS.map((lv) => (
                          <SelectItem key={lv} value={lv}>{LEVEL_LABELS[lv]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-2 py-1">
                  <Select
                    value={newSlot.instructor_id}
                    onValueChange={(v) => setNewSlot({ ...newSlot, instructor_id: v })}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      {instructors.map((i) => (
                        <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-2 py-1">
                  <Select
                    value={String(newSlot.day_of_week)}
                    onValueChange={(v) => setNewSlot({ ...newSlot, day_of_week: parseInt(v, 10) })}
                  >
                    <SelectTrigger className="h-8 text-xs w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DAYS.map((d, i) => (
                        <SelectItem key={d} value={String(i)}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-2 py-1">
                  <Input
                    type="time"
                    step={1800}
                    value={newSlot.start_time}
                    onChange={(e) => setNewSlot({ ...newSlot, start_time: e.target.value })}
                    className="h-8 text-xs w-28"
                  />
                </td>
                <td className="px-2 py-1">
                  <Input
                    type="time"
                    step={1800}
                    value={newSlot.end_time}
                    onChange={(e) => setNewSlot({ ...newSlot, end_time: e.target.value })}
                    className="h-8 text-xs w-28"
                  />
                </td>
                <td className="px-2 py-1">
                  <Input
                    type="number"
                    min={1}
                    value={newSlot.capacity}
                    onChange={(e) => setNewSlot({ ...newSlot, capacity: parseInt(e.target.value || "1", 10) })}
                    className="h-8 text-xs w-20"
                  />
                </td>
                <td className="px-2 py-1 text-muted-foreground">0</td>
                <td className="px-2 py-1 text-muted-foreground">0/{newSlot.capacity}</td>
                <td className="px-2 py-1">
                  <Input
                    value={newSlot.location}
                    onChange={(e) => setNewSlot({ ...newSlot, location: e.target.value })}
                    className="h-8 text-xs min-w-[220px]"
                  />
                </td>
                <td className="px-2 py-1">
                  <Switch
                    checked={newSlot.active}
                    onCheckedChange={(v) => setNewSlot({ ...newSlot, active: v })}
                  />
                </td>
                <td className="px-2 py-1 text-right whitespace-nowrap">
                  <Button size="sm" onClick={saveNew} disabled={saving} className="h-8">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={cancelAdd} className="h-8 ml-1">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            )}

            {loading && (
              <tr><td colSpan={13} className="px-3 py-8 text-center text-muted-foreground">
                <Loader2 className="inline h-4 w-4 animate-spin mr-2" />Loading…
              </td></tr>
            )}

            {!loading && filtered.length === 0 && !adding && (
              <tr><td colSpan={13} className="px-3 py-8 text-center text-muted-foreground">
                No slots match. Click "Add slot" to create one.
              </td></tr>
            )}

            {!loading && filtered.map((s) => {
              const enrolled = enrolledCounts[s.id] || 0;
              const full = enrolled >= s.capacity;
              const isEditing = editId === s.id && editDraft;
              if (isEditing) {
                return (
                  <tr key={s.id} className="border-t bg-amber-50/60">
                    <td className="px-2 py-1"></td>
                    <td className="px-2 py-1">
                      <Select
                        value={editDraft!.plan_key}
                        onValueChange={(v: PlanKey) => {
                          const cap = plans.find((p) => p.plan_key === v)?.capacity_per_slot ?? editDraft!.capacity;
                          setEditDraft({
                            ...editDraft!,
                            plan_key: v,
                            capacity: cap,
                            swim_level: v === "kid_group" ? (editDraft!.swim_level ?? "white") : null,
                          });
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(PLAN_LABELS) as PlanKey[]).map((k) => (
                            <SelectItem key={k} value={k}>{PLAN_LABELS[k]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-1">
                      {editDraft!.plan_key === "kid_group" ? (
                        <Select
                          value={editDraft!.swim_level ?? ""}
                          onValueChange={(v: SwimLevel) => setEditDraft({ ...editDraft!, swim_level: v })}
                        >
                          <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="Level…" /></SelectTrigger>
                          <SelectContent>
                            {SWIM_LEVELS.map((lv) => (
                              <SelectItem key={lv} value={lv}>{LEVEL_LABELS[lv]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      <Select
                        value={editDraft!.instructor_id || ""}
                        onValueChange={(v) => setEditDraft({ ...editDraft!, instructor_id: v })}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                        <SelectContent>
                          {instructors.map((i) => (
                            <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-1">
                      <Select
                        value={String(editDraft!.day_of_week)}
                        onValueChange={(v) => setEditDraft({ ...editDraft!, day_of_week: parseInt(v, 10) })}
                      >
                        <SelectTrigger className="h-8 text-xs w-24"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DAYS.map((d, i) => (
                            <SelectItem key={d} value={String(i)}>{d}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-1">
                      <Input type="time" step={1800} value={editDraft!.start_time.slice(0, 5)}
                        onChange={(e) => setEditDraft({ ...editDraft!, start_time: e.target.value })}
                        className="h-8 text-xs w-28" />
                    </td>
                    <td className="px-2 py-1">
                      <Input type="time" step={1800} value={editDraft!.end_time.slice(0, 5)}
                        onChange={(e) => setEditDraft({ ...editDraft!, end_time: e.target.value })}
                        className="h-8 text-xs w-28" />
                    </td>
                    <td className="px-2 py-1">
                      <Input type="number" min={1} value={editDraft!.capacity}
                        onChange={(e) => setEditDraft({ ...editDraft!, capacity: parseInt(e.target.value || "1", 10) })}
                        className="h-8 text-xs w-20" />
                    </td>
                    <td className="px-2 py-1 text-muted-foreground">{enrolled}</td>
                    <td className="px-2 py-1 text-muted-foreground">{enrolled}/{editDraft!.capacity}</td>
                    <td className="px-2 py-1">
                      <Input value={editDraft!.location || ""}
                        onChange={(e) => setEditDraft({ ...editDraft!, location: e.target.value })}
                        className="h-8 text-xs min-w-[220px]" />
                    </td>
                    <td className="px-2 py-1">
                      <Switch checked={editDraft!.active}
                        onCheckedChange={(v) => setEditDraft({ ...editDraft!, active: v })} />
                    </td>
                    <td className="px-2 py-1 text-right whitespace-nowrap">
                      <Button size="sm" onClick={saveEdit} disabled={saving} className="h-8">
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-8 ml-1">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              }
              const isExpanded = expandedSlots.has(s.id);
              const roster = rosterBySlot[s.id] || [];
              return (
                <FragmentRow key={s.id}>
                <tr className={cn("border-t hover:bg-muted/30", !s.active && "opacity-60")}>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => toggleExpand(s.id)}
                      className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                      aria-label={isExpanded ? "Collapse roster" : "Expand roster"}
                    >
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  </td>
                  <td className="px-3 py-2">{PLAN_LABELS[s.plan_key]}</td>
                  <td className="px-3 py-2">
                    {s.plan_key === "kid_group"
                      ? (s.swim_level ? LEVEL_LABELS[s.swim_level] : <span className="text-destructive text-xs">Not set</span>)
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2">{instructorName(s.instructor_id)}</td>
                  <td className="px-3 py-2">{DAYS[s.day_of_week] ?? s.day_of_week}</td>
                  <td className="px-3 py-2">{timeLabel(s.start_time)}</td>
                  <td className="px-3 py-2">{timeLabel(s.end_time)}</td>
                  <td className="px-3 py-2">{s.capacity}</td>
                  <td className="px-3 py-2">{enrolled}</td>
                  <td className="px-3 py-2">
                    <span className={cn("font-medium", full && "text-destructive")}>{enrolled}/{s.capacity}</span>
                    {full && <Badge variant="destructive" className="ml-2 text-[10px] px-1.5 py-0">FULL</Badge>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{s.location || "—"}</td>
                  <td className="px-3 py-2">
                    <Switch checked={s.active} onCheckedChange={(v) => toggleActive(s, v)} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => startEdit(s)}>
                      Edit
                    </Button>
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="bg-muted/20 border-t">
                    <td></td>
                    <td colSpan={12} className="px-3 py-3">
                      {roster.length === 0 ? (
                        <div className="text-xs text-muted-foreground italic">No active memberships in this slot.</div>
                      ) : (
                        <div className="space-y-1">
                          <div className="text-[11px] uppercase tracking-wide text-primary font-semibold mb-1.5">
                            Roster ({roster.length})
                          </div>
                          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                            {roster.map((m) => {
                              const childName = [m.child_first_name, m.child_last_name].filter(Boolean).join(" ") || "Unnamed swimmer";
                              const parentName = [m.parent_first_name, m.parent_last_name].filter(Boolean).join(" ");
                              return (
                                <div key={m.id} className="rounded-md border bg-card px-3 py-2 text-xs">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-medium text-foreground truncate">{childName}</span>
                                    {s.plan_key === "kid_group" && s.swim_level && (
                                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">
                                        {s.swim_level}
                                      </Badge>
                                    )}
                                  </div>
                                  {parentName && (
                                    <div className="text-muted-foreground mt-0.5 truncate">{parentName}</div>
                                  )}
                                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-muted-foreground">
                                    {m.parent_email && (
                                      <a href={`mailto:${m.parent_email}`} className="inline-flex items-center gap-1 hover:text-primary truncate">
                                        <Mail className="h-3 w-3" />{m.parent_email}
                                      </a>
                                    )}
                                    {m.parent_phone && (
                                      <a href={`tel:${m.parent_phone}`} className="inline-flex items-center gap-1 hover:text-primary">
                                        <Phone className="h-3 w-3" />{m.parent_phone}
                                      </a>
                                    )}
                                  </div>
                                  <div className="mt-1">
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                                      {m.status}
                                    </Badge>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                </FragmentRow>
              );
            })}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-muted-foreground">
        Deactivating a slot with active memberships hides it from booking but keeps the row so existing members are not orphaned.
      </p>
    </div>
  );
};

export default StandingSlotsAdmin;

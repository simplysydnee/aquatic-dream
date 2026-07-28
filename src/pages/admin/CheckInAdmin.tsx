import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LEVEL_DISPLAY, type SwimLevel } from "@/components/swim-enrollment/types";
import {
  CheckCircle2,
  Undo2,
  Search,
  Tablet,
  RotateCw,
  UserX,
  ShieldAlert,
  Mail,
  PenLine,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import FrontDeskEnrollmentWaiverDialog from "@/components/admin/calendar/FrontDeskEnrollmentWaiverDialog";

type RowKind = "group" | "private" | "semi_private" | "membership";

interface Row {
  kind: RowKind;
  id: string; // enrollment_id (group), occurrence_id (private / membership)
  session_id: string | null;
  child_name: string;
  child_age: number | null;
  parent_name: string;
  parent_email: string;
  parent_phone: string | null;
  has_waiver: boolean;
  checked_in: boolean;
  checked_in_at: string | null;
  no_show: boolean;
  notes: string | null;
  medical_notes?: string | null;
}

interface Slot {
  key: string;
  start_time: string;
  end_time: string;
  swim_level: string | null;
  session_name: string | null;
  instructor_name: string | null;
  lesson_type: RowKind;
  rows: Row[];
}


const daysForToday = (d: Date): string[] => {
  switch (format(d, "EEEE")) {
    case "Monday": return ["monday", "monday_wednesday"];
    case "Tuesday": return ["tuesday", "tuesday_thursday"];
    case "Wednesday": return ["wednesday", "monday_wednesday"];
    case "Thursday": return ["thursday", "tuesday_thursday"];
    case "Friday": return ["friday"];
    case "Saturday": return ["saturday"];
    case "Sunday": return ["sunday"];
    default: return [];
  }
};

const CheckInAdmin = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const today = new Date();
  const dateStr = format(today, "yyyy-MM-dd");

  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [waiverPrompt, setWaiverPrompt] = useState<Row | null>(null);
  const [signDialog, setSignDialog] = useState<Row | null>(null);
  const [emailingFor, setEmailingFor] = useState<string | null>(null);

  const checkedInBy = `admin:${user?.email || "unknown"}`;

  const fetchData = async () => {
    setLoading(true);
    const [sessionsRes, enrollRes, attendanceRes, occRes] = await Promise.all([
      supabase
        .from("swim_sessions")
        .select("id, start_time, end_time, swim_level, age_group, session_name, instructor_id, session_start_date, session_end_date, instructors(name)")
        .eq("is_active", true)
        .in("day_of_week", daysForToday(today))
        .lte("session_start_date", dateStr)
        .gte("session_end_date", dateStr),
      supabase
        .from("swim_enrollments")
        .select("id, session_id, child_name, child_age, parent_name, parent_email, parent_phone, status")
        .in("status", ["confirmed", "enrolled"]),
      supabase
        .from("attendance")
        .select("enrollment_id, checked_in, checked_in_at, notes")
        .eq("lesson_date", dateStr),
      supabase
        .from("lesson_booking_occurrences")
        .select("id, occurrence_date, status, checked_in_at, lesson_bookings!inner(id, lesson_type, instructor_name, parent_name, parent_email, parent_phone, child_name, child_age, start_time, end_time, status)")
        .eq("occurrence_date", dateStr)
        .not("status", "in", "(cancelled,abandoned)") as any,
    ]);

    const sessions = (sessionsRes.data || []) as any[];
    const enrollments = (enrollRes.data || []) as any[];
    const attMap = new Map<string, any>(
      (attendanceRes.data || []).map((a: any) => [a.enrollment_id, a])
    );

    // Universal waiver lookup
    const enrIds = enrollments.map((e) => e.id);
    const waiverByEnr = new Map<string, boolean>();
    if (enrIds.length) {
      const { data: w } = await (supabase.rpc as any)("enrollments_waiver_status", { _ids: enrIds });
      ((w as any[]) || []).forEach((r) => waiverByEnr.set(r.enrollment_id, !!r.has_waiver));
    }

    const occurrences = (((occRes as any).data) || []).filter(
      (o: any) => o.lesson_bookings?.status === "active"
    );
    const bookingIds = Array.from(
      new Set(occurrences.map((o: any) => o.lesson_bookings?.id).filter(Boolean))
    ) as string[];
    const waiverByBooking = new Map<string, boolean>();
    if (bookingIds.length) {
      const { data: w } = await (supabase.rpc as any)("bookings_waiver_status", { _ids: bookingIds });
      ((w as any[]) || []).forEach((r) => waiverByBooking.set(r.booking_id, !!r.has_waiver));
    }

    const groupSlots: Slot[] = sessions.map((s) => {
      const seen = new Set<string>();
      const rows: Row[] = [];
      for (const e of enrollments.filter((x) => x.session_id === s.id)) {
        const nameKey = `name:${(e.child_name || "").trim().toLowerCase()}`;
        if (seen.has(e.id) || seen.has(nameKey)) continue;
        seen.add(e.id);
        seen.add(nameKey);
        const a = attMap.get(e.id);
        rows.push({
          kind: "group",
          id: e.id,
          session_id: s.id,
          child_name: e.child_name,
          child_age: e.child_age ?? null,
          parent_name: e.parent_name,
          parent_email: e.parent_email,
          parent_phone: e.parent_phone,
          has_waiver: waiverByEnr.get(e.id) ?? false,
          checked_in: !!a?.checked_in,
          checked_in_at: a?.checked_in_at ?? null,
          no_show: a?.notes === "no_show",
          notes: a?.notes ?? null,
        });
      }
      return {
        key: `g:${s.id}`,
        start_time: s.start_time,
        end_time: s.end_time,
        swim_level: s.swim_level,
        session_name: s.session_name,
        instructor_name: s.instructors?.name ?? null,
        lesson_type: "group" as RowKind,
        rows,
      };
    }).filter((g) => g.rows.length > 0);

    const privateSlots: Slot[] = occurrences.map((o: any) => {
      const b = o.lesson_bookings;
      const kind: RowKind = b.lesson_type === "semi_private" ? "semi_private" : "private";
      const row: Row = {
        kind,
        id: o.id,
        session_id: null,
        child_name: b.child_name || "(no name)",
        child_age: b.child_age ?? null,
        parent_name: b.parent_name || "",
        parent_email: b.parent_email || "",
        parent_phone: b.parent_phone || null,
        has_waiver: waiverByBooking.get(b.id) ?? false,
        checked_in: !!o.checked_in_at,
        checked_in_at: o.checked_in_at ?? null,
        no_show: false,
        notes: null,
      };
      return {
        key: `p:${o.id}`,
        start_time: (b.start_time || "").slice(0, 8),
        end_time: (b.end_time || "").slice(0, 8),
        swim_level: null,
        session_name: kind === "semi_private" ? "Semi-Private" : "Private",
        instructor_name: b.instructor_name || null,
        lesson_type: kind,
        rows: [row],
      };
    });

    const all = [...groupSlots, ...privateSlots].sort((a, b) => {
      if (a.start_time !== b.start_time) return a.start_time.localeCompare(b.start_time);
      const ia = (a.instructor_name || "zzz").toLowerCase();
      const ib = (b.instructor_name || "zzz").toLowerCase();
      if (ia !== ib) return ia.localeCompare(ib);
      return (a.swim_level || a.session_name || "").localeCompare(b.swim_level || b.session_name || "");
    });

    setSlots(all);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setGroupAttendance = async (row: Row, next: { checked_in: boolean; notes: string | null }) => {
    if (!row.session_id) return;
    setBusyId(row.id);
    const { error } = await supabase.from("attendance").upsert(
      {
        enrollment_id: row.id,
        session_id: row.session_id,
        lesson_date: dateStr,
        checked_in: next.checked_in,
        checked_in_at: next.checked_in ? new Date().toISOString() : null,
        checked_in_by: checkedInBy,
        notes: next.notes,
      },
      { onConflict: "enrollment_id,lesson_date" }
    );
    setBusyId(null);
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    setSlots((prev) =>
      prev.map((g) => ({
        ...g,
        rows: g.rows.map((r) =>
          r.id === row.id
            ? {
                ...r,
                checked_in: next.checked_in,
                checked_in_at: next.checked_in ? new Date().toISOString() : null,
                no_show: next.notes === "no_show",
                notes: next.notes,
              }
            : r
        ),
      }))
    );
  };

  const setPrivateAttendance = async (row: Row, checkedIn: boolean) => {
    setBusyId(row.id);
    const { error } = await (supabase
      .from("lesson_booking_occurrences") as any)
      .update({
        checked_in_at: checkedIn ? new Date().toISOString() : null,
        checked_in_by: checkedIn ? checkedInBy : null,
      })
      .eq("id", row.id);
    setBusyId(null);
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    setSlots((prev) =>
      prev.map((g) => ({
        ...g,
        rows: g.rows.map((r) =>
          r.id === row.id
            ? { ...r, checked_in: checkedIn, checked_in_at: checkedIn ? new Date().toISOString() : null }
            : r
        ),
      }))
    );
  };

  const handleCheckInClick = (row: Row) => {
    if (!row.has_waiver) {
      setWaiverPrompt(row);
      return;
    }
    if (row.kind === "group") setGroupAttendance(row, { checked_in: true, notes: null });
    else setPrivateAttendance(row, true);
  };

  const handleUndo = (row: Row) => {
    if (row.kind === "group") setGroupAttendance(row, { checked_in: false, notes: null });
    else setPrivateAttendance(row, false);
  };

  const emailWaiverLink = async (row: Row) => {
    if (row.kind !== "group") {
      toast({ title: "Not supported", description: "Email waiver link is only available for group sessions right now." });
      return;
    }
    setEmailingFor(row.id);
    try {
      const { error } = await supabase.functions.invoke("send-enrollment-waiver-link", {
        body: { enrollmentId: row.id, siteUrl: window.location.origin },
      });
      if (error) throw error;
      toast({ title: "Waiver link emailed", description: row.parent_email });
      setWaiverPrompt(null);
    } catch (e: any) {
      toast({ title: "Failed to email waiver", description: e?.message, variant: "destructive" });
    } finally {
      setEmailingFor(null);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return slots;
    const q = search.trim().toLowerCase();
    return slots
      .map((g) => ({
        ...g,
        rows: g.rows.filter(
          (r) =>
            r.child_name.toLowerCase().includes(q) ||
            (r.parent_name || "").toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.rows.length > 0);
  }, [slots, search]);

  const totals = slots.reduce(
    (acc, g) => {
      acc.total += g.rows.length;
      acc.checked += g.rows.filter((e) => e.checked_in).length;
      acc.noshow += g.rows.filter((e) => e.no_show).length;
      acc.missingWaiver += g.rows.filter((e) => !e.has_waiver).length;
      return acc;
    },
    { total: 0, checked: 0, noshow: 0, missingWaiver: 0 }
  );

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground">Check-in</h2>
          <p className="text-sm text-muted-foreground">
            {format(today, "EEEE, MMMM d, yyyy")} · {totals.checked}/{totals.total} checked in
            {totals.noshow > 0 && ` · ${totals.noshow} no-show`}
            {totals.missingWaiver > 0 && ` · ${totals.missingWaiver} missing waiver`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RotateCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button asChild size="sm">
            <a href="/checkin" target="_blank" rel="noreferrer">
              <Tablet className="w-4 h-4 mr-1.5" /> Open Kiosk
            </a>
          </Button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search swimmer or parent name…"
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No swimmers scheduled for today.
          </CardContent>
        </Card>
      ) : (
        filtered.map((g) => {
          const levelInfo = g.swim_level ? LEVEL_DISPLAY[g.swim_level as SwimLevel] : null;
          const checked = g.rows.filter((e) => e.checked_in).length;
          const isPrivate = g.lesson_type !== "group";
          return (
            <Card key={g.key}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-lg">
                      {format(new Date(`2000-01-01T${g.start_time}`), "h:mm a")}
                    </span>
                    {isPrivate ? (
                      <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200">
                        {g.lesson_type === "semi_private" ? "Semi-Private" : "Private"}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className={levelInfo?.color || ""}>
                        {levelInfo?.name || g.swim_level}
                      </Badge>
                    )}
                    {g.instructor_name && (
                      <span className="text-xs text-muted-foreground">w/ {g.instructor_name}</span>
                    )}
                    {!isPrivate && g.session_name && (
                      <span className="text-xs text-muted-foreground">{g.session_name}</span>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {checked}/{g.rows.length} checked in
                  </span>
                </div>

                <div className="space-y-2">
                  {g.rows.map((e) => {
                    const busy = busyId === e.id;
                    return (
                      <div
                        key={e.id}
                        className={`flex items-center justify-between gap-2 p-2.5 rounded border ${
                          e.checked_in
                            ? "bg-green-50 border-green-200"
                            : e.no_show
                            ? "bg-red-50 border-red-200"
                            : "border-border"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium truncate">{e.child_name}</p>
                            {!e.has_waiver && (
                              <Badge variant="destructive" className="gap-1 text-[10px] py-0 h-5" title="No waiver of any type on file (visitor, enrollment, or private lesson)">
                                <ShieldAlert className="w-3 h-3" /> Waiver missing
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {e.child_age != null ? `Age ${e.child_age} · ` : ""}{e.parent_name}
                            {e.parent_phone ? ` · ${e.parent_phone}` : ""}
                          </p>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          {e.checked_in ? (
                            <>
                              <Badge className="bg-green-600 hover:bg-green-600">
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> In
                              </Badge>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                onClick={() => handleUndo(e)}
                              >
                                <Undo2 className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" disabled={busy} onClick={() => handleCheckInClick(e)}>
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Check in
                              </Button>
                              {e.kind === "group" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() =>
                                    setGroupAttendance(e, {
                                      checked_in: false,
                                      notes: e.no_show ? null : "no_show",
                                    })
                                  }
                                >
                                  <UserX className="w-3.5 h-3.5 mr-1" />
                                  {e.no_show ? "Clear" : "No-show"}
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}

      <Dialog open={!!waiverPrompt} onOpenChange={(o) => !o && setWaiverPrompt(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-destructive" />
              Waiver required before check-in
            </DialogTitle>
            <DialogDescription>
              {waiverPrompt && (
                <>
                  No signed waiver (visitor, enrollment, or private lesson) on file for{" "}
                  <span className="font-medium text-foreground">{waiverPrompt.child_name}</span> (parent:{" "}
                  {waiverPrompt.parent_name}). Choose how to handle it.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Button
              onClick={() => {
                if (waiverPrompt && waiverPrompt.kind === "group") {
                  setSignDialog(waiverPrompt);
                  setWaiverPrompt(null);
                } else {
                  toast({ title: "Use Waivers page", description: "Sign a visitor waiver for this swimmer." });
                }
              }}
            >
              <PenLine className="w-4 h-4 mr-2" />
              Sign now (in person)
            </Button>
            {waiverPrompt?.kind === "group" && (
              <Button
                variant="outline"
                disabled={!!emailingFor}
                onClick={() => waiverPrompt && emailWaiverLink(waiverPrompt)}
              >
                <Mail className="w-4 h-4 mr-2" />
                {emailingFor ? "Sending…" : "Email waiver link to parent"}
              </Button>
            )}
            <p className="text-xs text-muted-foreground px-1">
              A signed waiver is required before any swimmer can be checked in.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setWaiverPrompt(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FrontDeskEnrollmentWaiverDialog
        open={!!signDialog}
        onOpenChange={(o) => !o && setSignDialog(null)}
        enrollment={
          signDialog && signDialog.kind === "group"
            ? {
                id: signDialog.id,
                parent_name: signDialog.parent_name,
                parent_email: signDialog.parent_email,
                child_name: signDialog.child_name,
              }
            : null
        }
        onSigned={async () => {
          const target = signDialog;
          if (target && target.kind === "group") {
            await setGroupAttendance(target, { checked_in: true, notes: null });
          }
          await fetchData();
        }}
      />
    </div>
  );
};

export default CheckInAdmin;

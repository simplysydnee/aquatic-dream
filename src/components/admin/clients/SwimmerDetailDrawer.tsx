import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Mail, Phone, User, BookOpen, Waves, Calendar, Pencil, Info, DollarSign, MessageSquare, StickyNote, ShieldCheck, HelpCircle, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import type { Swimmer } from "@/hooks/useSwimmers";
import SwimmerStatusBadges from "./SwimmerStatusBadges";
import InternalCommentsPanel from "@/components/admin/InternalCommentsPanel";
import { formatPhone, phoneHref } from "@/lib/phone";
import { LEVEL_BADGE_COLORS, type SwimLevel } from "@/components/swim-enrollment/types";
import { cn } from "@/lib/utils";
import { formatPaymentStatus, paymentStatusBadgeClass, paymentStatusTooltip } from "@/lib/paymentLabels";
import CommunicationsTab from "@/components/admin/swimmer/tabs/CommunicationsTab";
import PaymentsTab from "@/components/admin/swimmer/tabs/PaymentsTab";
import ComplianceTab from "@/components/admin/swimmer/tabs/ComplianceTab";
import EditSwimmerDialog, { type EditTarget } from "@/components/admin/calendar/EditSwimmerDialog";
import { useAuth } from "@/hooks/useAuth";

type Occurrence = {
  id: string;
  booking_id: string;
  occurrence_date: string;
  payment_status: string;
  status: string;
  cancelled_at: string | null;
  checked_in_at: string | null;
};

type AttendanceRow = {
  enrollment_id: string;
  lesson_date: string;
  checked_in: boolean;
};

type LessonDateRow = {
  session_id: string;
  lesson_date: string;
  is_cancelled: boolean;
};

interface Props {
  swimmer: Swimmer | null;
  siblings: Swimmer[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenRequest: (id: string) => void;
  onOpenEnrollment: (id: string) => void;
  onSelectSwimmer: (s: Swimmer) => void;
  onChanged?: (newKey?: string) => void;
}


const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");
const fmtDateTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

const levelClass = (level?: string | null) => {
  if (!level) return "";
  const key = level.toLowerCase() as SwimLevel;
  const c = LEVEL_BADGE_COLORS[key];
  if (!c) return "";
  return cn(c.bg, c.text, "ring-1", c.ring, "border-transparent");
};

type LessonStatusKind = "attended" | "no_show" | "cancelled" | "upcoming";

const lessonStatusBadge = (kind: LessonStatusKind) => {
  switch (kind) {
    case "attended":
      return { label: "Completed", className: "bg-emerald-100 text-emerald-800 border-emerald-200" };
    case "no_show":
      return { label: "No-show", className: "bg-rose-100 text-rose-800 border-rose-200" };
    case "cancelled":
      return { label: "Cancelled", className: "bg-muted text-muted-foreground border-border" };
    case "upcoming":
      return { label: "Upcoming", className: "bg-sky-100 text-sky-800 border-sky-200" };
  }
};

const LessonStatusIcon = ({ kind, className }: { kind: LessonStatusKind; className?: string }) => {
  switch (kind) {
    case "attended":
      return <CheckCircle2 className={cn("h-3.5 w-3.5 text-emerald-600", className)} />;
    case "no_show":
      return <XCircle className={cn("h-3.5 w-3.5 text-rose-600", className)} />;
    case "cancelled":
      return <XCircle className={cn("h-3.5 w-3.5 text-muted-foreground", className)} />;
    case "upcoming":
      return <Calendar className={cn("h-3.5 w-3.5 text-sky-600", className)} />;
  }
};

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function SwimmerDetailDrawer({
  swimmer,
  siblings,
  open,
  onOpenChange,
  onOpenRequest,
  onOpenEnrollment,
  onSelectSwimmer,
  onChanged,

}: Props) {
  const { isAdmin } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [lessonDates, setLessonDates] = useState<LessonDateRow[]>([]);
  const [loadingOccurrences, setLoadingOccurrences] = useState(false);
  const [loadingLessonDates, setLoadingLessonDates] = useState(false);

  const bookingIds = swimmer ? swimmer.bookings.map((b) => b.id) : [];
  const bookingIdsKey = bookingIds.join(",");
  const enrollmentIds = swimmer ? swimmer.enrollments.map((e) => e.id) : [];
  const enrollmentIdsKey = enrollmentIds.join(",");
  const sessionIds = swimmer
    ? Array.from(new Set(swimmer.enrollments.map((e) => e.session_id).filter(Boolean) as string[]))
    : [];
  const sessionIdsKey = sessionIds.join(",");

  useEffect(() => {
    if (!swimmer) {
      setOccurrences([]);
      setAttendance([]);
      setLessonDates([]);
      setLoadingOccurrences(false);
      setLoadingLessonDates(false);
      return;
    }
    let cancelled = false;
    if (bookingIds.length) {
      setLoadingOccurrences(true);
      supabase
        .from("lesson_booking_occurrences")
        .select("id, booking_id, occurrence_date, payment_status, status, cancelled_at, checked_in_at")
        .in("booking_id", bookingIds)
        .order("occurrence_date", { ascending: true })
        .then(({ data }) => {
          if (cancelled) return;
          if (data) setOccurrences(data as Occurrence[]);
          setLoadingOccurrences(false);
        });
    } else {
      setOccurrences([]);
      setLoadingOccurrences(false);
    }
    if (enrollmentIds.length) {
      supabase
        .from("attendance")
        .select("enrollment_id, lesson_date, checked_in")
        .in("enrollment_id", enrollmentIds)
        .then(({ data }) => {
          if (!cancelled && data) setAttendance(data as AttendanceRow[]);
        });
    } else {
      setAttendance([]);
    }
    if (sessionIds.length) {
      setLoadingLessonDates(true);
      supabase
        .from("session_lesson_dates")
        .select("session_id, lesson_date, is_cancelled")
        .in("session_id", sessionIds)
        .order("lesson_date", { ascending: true })
        .then(({ data }) => {
          if (cancelled) return;
          if (data) setLessonDates(data as LessonDateRow[]);
          setLoadingLessonDates(false);
        });
    } else {
      setLessonDates([]);
      setLoadingLessonDates(false);
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swimmer?.key, bookingIdsKey, enrollmentIdsKey, sessionIdsKey]);

  if (!swimmer) return null;

  // Split entries into Enrollments vs Lessons & Requests, newest first.
  const enrollmentEntries = [...swimmer.enrollments]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map((e) => ({
      id: e.id,
      date: e.created_at,
      title: e.session?.period?.name || "Session",
      sub: `${e.swim_level || "—"} · ${e.session?.day_of_week || "—"} · Pay: ${e.payment_status}${
        e.is_first_time ? ` · Reg fee: ${e.session_fee_status}` : ""
      }`,
      level: e.swim_level,
      onClick: () => onOpenEnrollment(e.id),
    }));

  const requestEntries = swimmer.requests.map((r) => ({
    id: `req-${r.id}`,
    date: r.created_at,
    title: `Lesson Request · ${r.lesson_type}`,
    sub: `Status: ${r.status}${r.preferred_times ? ` · Prefers: ${r.preferred_times}` : ""}`,
    onClick: () => onOpenRequest(r.id),
  })).sort((a, b) => (a.date < b.date ? 1 : -1));

  const fmtTime = (t: string) => format(new Date(`2000-01-01T${t}`), "h:mm a");
  const fmtOccDate = (d: string) => format(new Date(d + "T00:00:00"), "EEE, MMM d, yyyy");

  const totalActivity =
    enrollmentEntries.length + requestEntries.length + (occurrences.length || swimmer.bookings.length);

  const editTarget: EditTarget | null =
    swimmer.enrollments[0]
      ? {
          kind: "swim_enrollment",
          id: swimmer.enrollments[0].id,
          child_name: swimmer.child_name,
          child_age: swimmer.child_age,
          parent_name: swimmer.parent_name,
          parent_email: swimmer.parent_email,
          parent_phone: swimmer.parent_phone,
        }
      : swimmer.bookings[0]
        ? {
            kind: "lesson_booking",
            id: swimmer.bookings[0].id,
            child_name: swimmer.child_name,
            parent_name: swimmer.parent_name,
            parent_email: swimmer.parent_email,
            parent_phone: swimmer.parent_phone,
          }
        : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col">
        <SheetHeader className="p-4 sm:p-6 border-b">
          <SheetTitle className="text-base sm:text-xl flex items-center gap-2 flex-wrap">
            <User className="h-5 w-5 text-primary" />
            {swimmer.child_name}
            {swimmer.child_age != null && (
              <span className="text-muted-foreground font-normal text-base">({swimmer.child_age})</span>
            )}
            {swimmer.swim_level && (
              <Badge variant="outline" className={cn("text-[10px] uppercase font-bold", levelClass(swimmer.swim_level))}>
                {swimmer.swim_level}
              </Badge>
            )}
            {isAdmin && editTarget && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 ml-auto"
                onClick={() => setEditOpen(true)}
                title="Edit swimmer info"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
          </SheetTitle>
          <SwimmerStatusBadges statuses={swimmer.statuses} className="mt-2" />
        </SheetHeader>

        <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden min-w-0">
          <TabsList className="mx-3 sm:mx-6 mt-3 sm:mt-4 grid grid-cols-6 w-auto h-auto p-1 border border-border bg-muted/40 rounded-lg gap-1">
            {[
              { value: "overview", icon: Info, label: "Info" },
              { value: "activity", icon: Waves, label: "Activity", count: totalActivity },
              { value: "compliance", icon: ShieldCheck, label: "Waivers" },
              { value: "payments", icon: DollarSign, label: "Payments" },
              { value: "comms", icon: MessageSquare, label: "Messages" },
              { value: "notes", icon: StickyNote, label: "Notes" },
            ].map(({ value, icon: Icon, label, count }) => (
              <TabsTrigger
                key={value}
                value={value}
                title={label}
                className="relative min-w-0 flex flex-col items-center justify-center gap-1 border border-transparent rounded-md text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:border-border data-[state=active]:shadow-sm text-[10px] sm:text-xs px-1 py-2 leading-tight"
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="font-medium">{label}</span>
                {count != null && count > 0 && (
                  <span className="absolute top-0.5 right-0.5 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[9px] font-semibold leading-none">
                    {count}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          <ScrollArea className="flex-1">
            <TabsContent value="overview" className="p-4 sm:p-6 space-y-4 sm:space-y-6 mt-0">
              <div className="grid grid-cols-1 sm:grid-cols-1 gap-4 sm:gap-0 sm:space-y-6">
                <section>
                  <h3 className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Swimmer</h3>
                  <div className="space-y-1 text-sm">
                    <div><span className="text-muted-foreground">Name:</span> {swimmer.child_name}</div>
                    <div><span className="text-muted-foreground">Age:</span> {swimmer.child_age ?? "—"}</div>
                    <div><span className="text-muted-foreground">DOB:</span> {fmtDate(swimmer.child_dob)}</div>
                    <div><span className="text-muted-foreground">Level:</span> {swimmer.swim_level || "—"}</div>
                  </div>
                </section>

                <section>
                  <h3 className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Parent</h3>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2"><User className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span className="truncate">{swimmer.parent_name}</span></div>
                    <a href={`mailto:${swimmer.parent_email}`} className="flex items-center gap-2 text-primary hover:underline">
                      <Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{swimmer.parent_email}</span>
                    </a>
                    {swimmer.parent_phone && (
                      <a href={phoneHref(swimmer.parent_phone)} className="flex items-center gap-2 text-primary hover:underline">
                        <Phone className="h-3.5 w-3.5 shrink-0" />{formatPhone(swimmer.parent_phone)}
                      </a>
                    )}
                  </div>
                </section>
              </div>

              <section>
                <h3 className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Lifetime</h3>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  <div className="rounded-md border p-2 sm:p-3 text-center">
                    <div className="text-xl sm:text-2xl font-bold text-foreground">{swimmer.requests.length}</div>
                    <div className="text-[10px] sm:text-xs text-muted-foreground">Requests</div>
                  </div>
                  <div className="rounded-md border p-2 sm:p-3 text-center">
                    <div className="text-xl sm:text-2xl font-bold text-foreground">{swimmer.enrollments.length}</div>
                    <div className="text-[10px] sm:text-xs text-muted-foreground">Enrollments</div>
                  </div>
                  <div className="rounded-md border p-2 sm:p-3 text-center">
                    <div className="text-xl sm:text-2xl font-bold text-foreground">{swimmer.bookings.length}</div>
                    <div className="text-[10px] sm:text-xs text-muted-foreground">Bookings</div>
                  </div>
                </div>
              </section>

              {siblings.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Siblings (same parent)</h3>
                  <div className="space-y-1.5">
                    {siblings.map((sib) => (
                      <button
                        key={sib.key}
                        onClick={() => onSelectSwimmer(sib)}
                        className="w-full flex items-center justify-between rounded-md border p-2.5 text-left hover:bg-muted/50 transition-colors"
                      >
                        <span className="text-sm font-medium">
                          {sib.child_name}{" "}
                          {sib.child_age != null && (
                            <span className="text-muted-foreground font-normal">({sib.child_age})</span>
                          )}
                        </span>
                        <Badge variant="outline" className="text-xs">{sib.primary_status.label}</Badge>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </TabsContent>

            <TabsContent value="activity" className="p-4 sm:p-6 mt-0 space-y-4 sm:space-y-6">
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Waves className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-sm">Enrollments ({enrollmentEntries.length})</h3>
                </div>
                {enrollmentEntries.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No session enrollments.</p>
                ) : (
                  <div className="space-y-2">
                    {enrollmentEntries.map((e) => {
                      const enr = swimmer.enrollments.find((x) => x.id === e.id);
                      const sid = enr?.session_id ?? null;
                      const dates = sid
                        ? lessonDates
                            .filter((d) => d.session_id === sid)
                            .sort((a, b) => (a.lesson_date < b.lesson_date ? -1 : 1))
                        : [];
                      const today = todayISO();
                      const attMap = new Map(
                        attendance
                          .filter((a) => a.enrollment_id === e.id)
                          .map((a) => [a.lesson_date, a.checked_in]),
                      );
                      return (
                        <div key={e.id} className="rounded-md border p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-xs text-muted-foreground">Enrolled: {fmtDateTime(e.date)}</div>
                              <div className="font-medium text-sm flex items-center gap-1.5 flex-wrap">
                                {e.title}
                                {e.level && (
                                  <Badge variant="outline" className={cn("text-[10px] uppercase", levelClass(e.level))}>
                                    {e.level}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">{e.sub}</div>
                            </div>
                            <Button variant="link" size="sm" className="h-auto p-0 text-xs shrink-0" onClick={e.onClick}>
                              Open →
                            </Button>
                          </div>
                          {dates.length > 0 && (
                            <ul className="mt-3 divide-y border-t">
                              {dates.map((d) => {
                                let kind: LessonStatusKind;
                                if (d.is_cancelled) kind = "cancelled";
                                else if (d.lesson_date > today) kind = "upcoming";
                                else kind = attMap.get(d.lesson_date) ? "attended" : "no_show";
                                const badge = lessonStatusBadge(kind);
                                return (
                                  <li key={d.lesson_date} className="py-2 flex items-center justify-between gap-2">
                                    <span className="text-xs text-foreground">{fmtOccDate(d.lesson_date)}</span>
                                    <Badge variant="outline" className={cn("text-[10px]", badge.className)}>
                                      {badge.label}
                                    </Badge>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section>
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-sm">
                    Lessons & Requests ({requestEntries.length + occurrences.length})
                  </h3>
                </div>

                {requestEntries.length === 0 && swimmer.bookings.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No lesson requests or private bookings.</p>
                ) : (
                  <div className="space-y-3">
                    {requestEntries.map((item) => (
                      <div key={item.id} className="rounded-md border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs text-muted-foreground">{fmtDateTime(item.date)}</div>
                            <div className="font-medium text-sm flex items-center gap-1.5">
                              <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                              {item.title}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">{item.sub}</div>
                          </div>
                          <Button variant="link" size="sm" className="h-auto p-0 text-xs shrink-0" onClick={item.onClick}>
                            Open →
                          </Button>
                        </div>
                      </div>
                    ))}

                    {swimmer.bookings.map((b) => {
                      const occs = occurrences
                        .filter((o) => o.booking_id === b.id)
                        .sort((a, b2) => (a.occurrence_date < b2.occurrence_date ? -1 : 1));
                      return (
                        <div key={`bk-${b.id}`} className="rounded-md border">
                          <div className="p-3 border-b bg-muted/30">
                            <div className="font-medium text-sm flex items-center gap-1.5 flex-wrap">
                              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                              {b.lesson_type === "private" ? "Private" : "Semi-private"} lesson series
                              {b.recurring && (
                                <Badge variant="outline" className="text-[10px]">Recurring</Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {fmtTime(b.start_time)}–{fmtTime(b.end_time)}
                              {b.instructor_name ? ` · ${b.instructor_name}` : ""}
                              {` · $${Number(b.price_per_session ?? 0).toFixed(2)}/lesson`}
                            </div>
                          </div>
                          {occs.length === 0 ? (
                            <div className="p-3 text-xs text-muted-foreground italic">
                              No scheduled lessons yet.
                            </div>
                          ) : (
                            <ul className="divide-y">
                              {occs.map((o) => {
                                const isCancelled = o.status === "cancelled" || !!o.cancelled_at;
                                const today = todayISO();
                                let attKind: LessonStatusKind;
                                if (isCancelled) attKind = "cancelled";
                                else if (o.occurrence_date > today) attKind = "upcoming";
                                else attKind = o.checked_in_at ? "attended" : "no_show";
                                const attBadge = lessonStatusBadge(attKind);
                                const tip = paymentStatusTooltip(o.payment_status);
                                return (
                                  <li key={o.id} className="p-3 flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="text-sm font-medium truncate">{fmtOccDate(o.occurrence_date)}</div>
                                      <div className="text-xs text-muted-foreground">
                                        {fmtTime(b.start_time)}–{fmtTime(b.end_time)}
                                        {b.instructor_name ? ` · ${b.instructor_name}` : ""}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                                      <Badge variant="outline" className={cn("text-[10px]", attBadge.className)}>
                                        {attBadge.label}
                                      </Badge>
                                      {!isCancelled && (
                                        tip ? (
                                          <TooltipProvider>
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <Badge
                                                  variant="outline"
                                                  className={cn(
                                                    "cursor-help inline-flex items-center gap-1 text-[10px]",
                                                    paymentStatusBadgeClass(o.payment_status),
                                                  )}
                                                >
                                                  {formatPaymentStatus(o.payment_status)}
                                                  <HelpCircle className="h-3 w-3 opacity-70" />
                                                </Badge>
                                              </TooltipTrigger>
                                              <TooltipContent className="max-w-xs">{tip}</TooltipContent>
                                            </Tooltip>
                                          </TooltipProvider>
                                        ) : (
                                          <Badge variant="outline" className={cn("text-[10px]", paymentStatusBadgeClass(o.payment_status))}>
                                            {formatPaymentStatus(o.payment_status)}
                                          </Badge>
                                        )
                                      )}
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </TabsContent>

            <TabsContent value="compliance" className="p-4 sm:p-6 mt-0">
              <ComplianceTab swimmer={swimmer} />
            </TabsContent>

            <TabsContent value="payments" className="p-4 sm:p-6 mt-0">
              <PaymentsTab swimmer={swimmer} />
            </TabsContent>

            <TabsContent value="comms" className="p-4 sm:p-6 mt-0">
              <CommunicationsTab swimmer={swimmer} />
            </TabsContent>

            <TabsContent value="notes" className="p-4 sm:p-6 mt-0">
              <InternalCommentsPanel
                targetType="swimmer"
                targetKey={swimmer.key}
                title="Internal Notes"
                emptyHint="No internal notes for this swimmer yet. Add the first one below."
              />
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </SheetContent>

      {editTarget && (
        <EditSwimmerDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          target={editTarget}
          onSaved={(newKey) => {
            setEditOpen(false);
            onChanged?.(newKey);
          }}
        />
      )}

    </Sheet>
  );
}

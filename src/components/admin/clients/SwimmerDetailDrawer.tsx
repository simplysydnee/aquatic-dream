import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mail, Phone, User, BookOpen, Waves, Calendar, Pencil } from "lucide-react";
import type { Swimmer } from "@/hooks/useSwimmers";
import SwimmerStatusBadges from "./SwimmerStatusBadges";
import InternalCommentsPanel from "@/components/admin/InternalCommentsPanel";
import { formatPhone, phoneHref } from "@/lib/phone";
import { LEVEL_BADGE_COLORS, type SwimLevel } from "@/components/swim-enrollment/types";
import { cn } from "@/lib/utils";
import CommunicationsTab from "@/components/admin/swimmer/tabs/CommunicationsTab";
import PaymentsTab from "@/components/admin/swimmer/tabs/PaymentsTab";
import EditSwimmerDialog, { type EditTarget } from "@/components/admin/calendar/EditSwimmerDialog";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  swimmer: Swimmer | null;
  siblings: Swimmer[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenRequest: (id: string) => void;
  onOpenEnrollment: (id: string) => void;
  onSelectSwimmer: (s: Swimmer) => void;
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

export default function SwimmerDetailDrawer({
  swimmer,
  siblings,
  open,
  onOpenChange,
  onOpenRequest,
  onOpenEnrollment,
  onSelectSwimmer,
}: Props) {
  const { isAdmin } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
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

  const lessonEntries = [
    ...swimmer.requests.map((r) => ({
      id: `req-${r.id}`,
      date: r.created_at,
      kind: "request" as const,
      title: `Lesson Request · ${r.lesson_type}`,
      sub: `Status: ${r.status}${r.preferred_times ? ` · Prefers: ${r.preferred_times}` : ""}`,
      onClick: () => onOpenRequest(r.id),
    })),
    ...swimmer.bookings.map((b) => ({
      id: `bk-${b.id}`,
      date: b.created_at,
      kind: "booking" as const,
      title: `Booking · ${b.lesson_type}`,
      sub: `${b.series_start} → ${b.series_end || "ongoing"} · ${b.start_time}-${b.end_time}`,
      onClick: undefined,
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  const totalActivity = enrollmentEntries.length + lessonEntries.length;

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

        <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-6 mt-4 grid grid-cols-5 w-auto h-auto p-1 border border-border bg-background rounded-lg gap-1">
            <TabsTrigger value="overview" className="border border-transparent rounded-md text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-sm">Info</TabsTrigger>
            <TabsTrigger value="activity" className="border border-transparent rounded-md text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-sm">Enrollments ({totalActivity})</TabsTrigger>
            <TabsTrigger value="payments" className="border border-transparent rounded-md text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-sm">Payments</TabsTrigger>
            <TabsTrigger value="comms" className="border border-transparent rounded-md text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-sm">Communications</TabsTrigger>
            <TabsTrigger value="notes" className="border border-transparent rounded-md text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-sm">Notes</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1">
            <TabsContent value="overview" className="p-6 space-y-6 mt-0">
              <section>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Swimmer</h3>
                <div className="space-y-1 text-sm">
                  <div><span className="text-muted-foreground">Name:</span> {swimmer.child_name}</div>
                  <div><span className="text-muted-foreground">Age:</span> {swimmer.child_age ?? "—"}</div>
                  <div><span className="text-muted-foreground">DOB:</span> {fmtDate(swimmer.child_dob)}</div>
                  <div><span className="text-muted-foreground">Level:</span> {swimmer.swim_level || "—"}</div>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Parent</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2"><User className="h-3.5 w-3.5 text-muted-foreground" />{swimmer.parent_name}</div>
                  <a href={`mailto:${swimmer.parent_email}`} className="flex items-center gap-2 text-primary hover:underline">
                    <Mail className="h-3.5 w-3.5" />{swimmer.parent_email}
                  </a>
                  {swimmer.parent_phone && (
                    <a href={phoneHref(swimmer.parent_phone)} className="flex items-center gap-2 text-primary hover:underline">
                      <Phone className="h-3.5 w-3.5" />{formatPhone(swimmer.parent_phone)}
                    </a>
                  )}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Lifetime</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-md border p-3 text-center">
                    <div className="text-2xl font-bold text-foreground">{swimmer.requests.length}</div>
                    <div className="text-xs text-muted-foreground">Requests</div>
                  </div>
                  <div className="rounded-md border p-3 text-center">
                    <div className="text-2xl font-bold text-foreground">{swimmer.enrollments.length}</div>
                    <div className="text-xs text-muted-foreground">Enrollments</div>
                  </div>
                  <div className="rounded-md border p-3 text-center">
                    <div className="text-2xl font-bold text-foreground">{swimmer.bookings.length}</div>
                    <div className="text-xs text-muted-foreground">Bookings</div>
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

            <TabsContent value="activity" className="p-6 mt-0 space-y-6">
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Waves className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-sm">Enrollments ({enrollmentEntries.length})</h3>
                </div>
                {enrollmentEntries.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No session enrollments.</p>
                ) : (
                  <div className="space-y-2">
                    {enrollmentEntries.map((e) => (
                      <div key={e.id} className="rounded-md border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs text-muted-foreground">{fmtDateTime(e.date)}</div>
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
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-sm">Lessons & Requests ({lessonEntries.length})</h3>
                </div>
                {lessonEntries.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No lesson requests or private bookings.</p>
                ) : (
                  <div className="space-y-2">
                    {lessonEntries.map((item) => {
                      const Icon = item.kind === "request" ? BookOpen : Calendar;
                      return (
                        <div key={item.id} className="rounded-md border p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-xs text-muted-foreground">{fmtDateTime(item.date)}</div>
                              <div className="font-medium text-sm flex items-center gap-1.5">
                                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                                {item.title}
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">{item.sub}</div>
                            </div>
                            {item.onClick && (
                              <Button variant="link" size="sm" className="h-auto p-0 text-xs shrink-0" onClick={item.onClick}>
                                Open →
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </TabsContent>

            <TabsContent value="payments" className="p-6 mt-0">
              <PaymentsTab swimmer={swimmer} />
            </TabsContent>

            <TabsContent value="comms" className="p-6 mt-0">
              <CommunicationsTab swimmer={swimmer} />
            </TabsContent>

            <TabsContent value="notes" className="p-6 mt-0">
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
          onSaved={() => setEditOpen(false)}
        />
      )}
    </Sheet>
  );
}

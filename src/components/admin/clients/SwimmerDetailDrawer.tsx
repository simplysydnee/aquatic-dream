import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mail, Phone, User, Calendar, BookOpen, CreditCard, Waves } from "lucide-react";
import type { Swimmer } from "@/hooks/useSwimmers";
import SwimmerStatusBadges from "./SwimmerStatusBadges";

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

export default function SwimmerDetailDrawer({
  swimmer,
  siblings,
  open,
  onOpenChange,
  onOpenRequest,
  onOpenEnrollment,
  onSelectSwimmer,
}: Props) {
  if (!swimmer) return null;

  // Build chronological timeline
  const timeline: Array<{ id: string; date: string; kind: "request" | "enrollment" | "booking"; label: string; sub: string; onClick?: () => void }> = [];
  swimmer.requests.forEach((r) =>
    timeline.push({
      id: `req-${r.id}`,
      date: r.created_at,
      kind: "request",
      label: `Lesson Request · ${r.lesson_type}`,
      sub: `Status: ${r.status}${r.preferred_times ? ` · Prefers: ${r.preferred_times}` : ""}`,
      onClick: () => onOpenRequest(r.id),
    }),
  );
  swimmer.enrollments.forEach((e) =>
    timeline.push({
      id: `enr-${e.id}`,
      date: e.created_at,
      kind: "enrollment",
      label: `Enrollment · ${e.session?.period?.name || "Session"}`,
      sub: `${e.swim_level || "—"} · ${e.session?.day_of_week || "—"} · Pay: ${e.payment_status}${e.is_first_time ? ` · Reg fee: ${e.session_fee_status}` : ""}`,
      onClick: () => onOpenEnrollment(e.id),
    }),
  );
  swimmer.bookings.forEach((b) =>
    timeline.push({
      id: `bk-${b.id}`,
      date: b.created_at,
      kind: "booking",
      label: `Booking · ${b.lesson_type}`,
      sub: `${b.series_start} → ${b.series_end || "ongoing"} · ${b.start_time}-${b.end_time}`,
    }),
  );
  timeline.sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col">
        <SheetHeader className="p-6 border-b">
          <SheetTitle className="text-xl flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            {swimmer.child_name}
            {swimmer.child_age != null && <span className="text-muted-foreground font-normal text-base">({swimmer.child_age})</span>}
          </SheetTitle>
          <SwimmerStatusBadges statuses={swimmer.statuses} className="mt-2" />
        </SheetHeader>

        <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-6 mt-4 self-start">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="timeline">Timeline ({timeline.length})</TabsTrigger>
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
                    <a href={`tel:${swimmer.parent_phone}`} className="flex items-center gap-2 text-primary hover:underline">
                      <Phone className="h-3.5 w-3.5" />{swimmer.parent_phone}
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
                        <span className="text-sm font-medium">{sib.child_name} {sib.child_age != null && <span className="text-muted-foreground font-normal">({sib.child_age})</span>}</span>
                        <Badge variant="outline" className="text-xs">{sib.primary_status.label}</Badge>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </TabsContent>

            <TabsContent value="timeline" className="p-6 mt-0">
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity yet.</p>
              ) : (
                <ol className="relative border-l border-border pl-5 space-y-4">
                  {timeline.map((item) => {
                    const Icon = item.kind === "request" ? BookOpen : item.kind === "enrollment" ? Waves : Calendar;
                    return (
                      <li key={item.id} className="relative">
                        <span className="absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full bg-background border">
                          <Icon className="h-3 w-3 text-primary" />
                        </span>
                        <div className="text-xs text-muted-foreground">{fmtDateTime(item.date)}</div>
                        <div className="font-medium text-sm">{item.label}</div>
                        <div className="text-xs text-muted-foreground">{item.sub}</div>
                        {item.onClick && (
                          <Button variant="link" size="sm" className="h-auto p-0 mt-1 text-xs" onClick={item.onClick}>
                            Open →
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

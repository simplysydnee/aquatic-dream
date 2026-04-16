import { useState } from "react";
import { format } from "date-fns";
import { X, Clock, User, Pencil, UserPlus, Phone, Mail, Lock, AlertTriangle, Send, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { CalendarSwimSession, CalendarEnrollment, CalendarPoolEvent, AttendanceRecord, EnrollmentAgreement } from "@/hooks/useCalendarData";
import type { ICSSession } from "./CalendarDayView";
import { LEVEL_DISPLAY, type SwimLevel } from "@/components/swim-enrollment/types";
import { Checkbox } from "@/components/ui/checkbox";
import AddSwimmerDialog from "./AddSwimmerDialog";

interface SwimBlockInfo {
  kind: "swim";
  session: CalendarSwimSession;
  enrollments: CalendarEnrollment[];
  attendance: AttendanceRecord[];
  agreements: EnrollmentAgreement[];
  dateStr: string;
}

interface EventBlockInfo {
  kind: "event";
  event: CalendarPoolEvent;
}

interface ICSBlockInfo {
  kind: "ics";
  session: ICSSession;
}

type BlockInfo = SwimBlockInfo | EventBlockInfo | ICSBlockInfo;

interface Props {
  block: BlockInfo | null;
  onClose: () => void;
  onEdit: () => void;
  onCheckIn?: (enrollmentId: string, sessionId: string, isCheckedIn: boolean) => void;
  onRefetch?: () => void;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function fmtICSTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

const CalendarBlockDetail = ({ block, onClose, onEdit, onCheckIn, onRefetch }: Props) => {
  const [showAddSwimmer, setShowAddSwimmer] = useState(false);
  const [sendingPaymentFor, setSendingPaymentFor] = useState<string | null>(null);

  if (!block) return null;

  const handleSendPaymentLink = async (enrollmentId: string) => {
    setSendingPaymentFor(enrollmentId);
    try {
      const { error } = await supabase.functions.invoke("send-session-payment-link", {
        body: { enrollmentId, environment: "sandbox", siteUrl: window.location.origin },
      });
      if (error) throw error;
      toast.success("Payment link sent!");
    } catch (err: any) {
      toast.error(err?.message || "Failed to send payment link");
    } finally {
      setSendingPaymentFor(null);
    }
  };

  const isSwim = block.kind === "swim";
  const isICS = block.kind === "ics";

  const title = isSwim
    ? LEVEL_DISPLAY[block.session.swim_level as SwimLevel]?.name || block.session.swim_level
    : isICS
    ? block.session.client_name || block.session.session_type || "I Can Swim"
    : block.event.title;

  const fmtTime = (t: string) => format(new Date(`2000-01-01T${t}`), "h:mm a");

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-sm bg-card border-l shadow-xl h-full overflow-y-auto animate-in slide-in-from-right-full duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-card border-b px-4 py-3 flex items-start justify-between z-10">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground">{title}</h3>
              {isICS && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isSwim
                ? block.session.day_of_week
                : isICS
                ? "I Can Swim 209"
                : format(new Date(block.event.event_date + "T00:00:00"), "EEEE, MMM d")}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ICS Detail (read-only) */}
        {isICS && (
          <div className="p-4 space-y-4">
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Clock className="w-3.5 h-3.5" /> Time
              </div>
              <p className="text-sm font-medium">
                {fmtICSTime(block.session.start_time)} – {fmtICSTime(block.session.end_time)}
              </p>
            </div>

            {block.session.instructor_name && (
              <div className="rounded-lg bg-muted/50 p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <User className="w-3.5 h-3.5" /> Instructor
                </div>
                <p className="text-sm font-medium">{block.session.instructor_name}</p>
              </div>
            )}

            <div className="rounded-lg bg-muted/50 p-3">
              <div className="text-xs text-muted-foreground mb-1">Status</div>
              <p className="text-sm font-medium capitalize">{block.session.status}</p>
            </div>

            <div className="border-t pt-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Contact Information
              </h4>

              {block.session.client_name && (
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                    {getInitials(block.session.client_name)}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{block.session.client_name}</p>
                    <p className="text-xs text-muted-foreground">Swimmer</p>
                  </div>
                </div>
              )}

              {block.session.parent_name && (
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-secondary/50 flex items-center justify-center shrink-0">
                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{block.session.parent_name}</p>
                    <p className="text-xs text-muted-foreground">Parent / Guardian</p>
                  </div>
                </div>
              )}

              {block.session.parent_email && (
                <a href={`mailto:${block.session.parent_email}`} className="flex items-center gap-3 mb-3 group">
                  <div className="w-8 h-8 rounded-full bg-secondary/50 flex items-center justify-center shrink-0">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-primary group-hover:underline">{block.session.parent_email}</p>
                </a>
              )}

              {block.session.parent_phone && (
                <a href={`tel:${block.session.parent_phone}`} className="flex items-center gap-3 mb-3 group">
                  <div className="w-8 h-8 rounded-full bg-secondary/50 flex items-center justify-center shrink-0">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-primary group-hover:underline">{block.session.parent_phone}</p>
                </a>
              )}

              {!block.session.parent_name && !block.session.parent_email && !block.session.parent_phone && (
                <p className="text-sm text-muted-foreground italic">No contact info available</p>
              )}
            </div>
          </div>
        )}

        {/* Swim / Event details */}
        {!isICS && (
          <>
            {/* Info tiles */}
            <div className={cn("grid gap-3 p-4", isSwim && block.session.instructors ? "grid-cols-3" : "grid-cols-2")}>
              <div className="rounded-lg bg-muted/50 p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <Clock className="w-3.5 h-3.5" /> Time
                </div>
                <p className="text-sm font-medium">
                  {isSwim
                    ? `${fmtTime(block.session.start_time)} – ${fmtTime(block.session.end_time)}`
                    : `${fmtTime(block.event.start_time)} – ${fmtTime(block.event.end_time)}`}
                </p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <User className="w-3.5 h-3.5" /> {isSwim ? "Capacity" : "Instructor"}
                </div>
                <p className="text-sm font-medium">
                  {isSwim
                    ? `${block.enrollments.length}/${block.session.max_students}`
                    : block.event.instructor_name || "—"}
                </p>
              </div>
              {isSwim && block.session.instructors && (
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <User className="w-3.5 h-3.5" /> Instructor
                  </div>
                  <p className="text-sm font-medium">{block.session.instructors.name}</p>
                </div>
              )}
            </div>

            {/* Roster with contact info */}
            {isSwim && (
              <div className="px-4 pb-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Roster ({block.enrollments.length})
                </h4>
                {block.enrollments.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No students enrolled</p>
                ) : (
                  <div className="space-y-3">
                    {block.enrollments.map((enr) => {
                      const att = block.attendance.find(
                        (a) => a.enrollment_id === enr.id && a.lesson_date === block.dateStr
                      );
                      const isCheckedIn = !!att?.checked_in;
                      const agreement = block.agreements.find((ag) => ag.enrollment_id === enr.id);

                      return (
                        <div key={enr.id} className="rounded-lg border bg-card p-3">
                          {/* Row 1: Check-in + student name */}
                          <div className="flex items-center gap-3">
                            <Checkbox
                              checked={isCheckedIn}
                              onCheckedChange={() => onCheckIn?.(enr.id, block.session.id, isCheckedIn)}
                            />
                            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                              {getInitials(enr.child_name)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className={cn("text-sm font-medium", isCheckedIn && "line-through text-muted-foreground")}>
                                  {enr.child_name}
                                </p>
                                {enr.medical_notes && (
                                  <span title={enr.medical_notes}>
                                    <Stethoscope className="w-3 h-3 text-amber-500" />
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">Age {enr.child_age}</p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Badge className={cn(
                                "text-[10px] px-1.5 py-0.5",
                                enr.payment_status === "paid"
                                  ? "bg-green-100 text-green-700 hover:bg-green-100"
                                  : "bg-yellow-100 text-yellow-700 hover:bg-yellow-100"
                              )}>
                                {enr.payment_status === "paid" ? "Paid" : "Unpaid"}
                              </Badge>
                              {isCheckedIn && (
                                <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">
                                  ✓ In
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Row 2: Parent contact */}
                          <div className="mt-2 pl-[52px] space-y-1">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <User className="w-3 h-3 shrink-0" />
                              <span className="font-medium">{enr.parent_name}</span>
                            </div>
                            {enr.parent_phone && (
                              <a href={`tel:${enr.parent_phone}`} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                                <Phone className="w-3 h-3 shrink-0" />
                                {enr.parent_phone}
                              </a>
                            )}
                            {enr.parent_email && (
                              <a href={`mailto:${enr.parent_email}`} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                                <Mail className="w-3 h-3 shrink-0" />
                                {enr.parent_email}
                              </a>
                            )}
                          </div>

                          {/* Row 3: Emergency contact */}
                          {agreement ? (
                            <div className="mt-2 pl-[52px] pt-2 border-t border-dashed">
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                                <AlertTriangle className="w-3 h-3 shrink-0 text-amber-500" />
                                <span className="font-semibold uppercase tracking-wide text-[10px]">Emergency Contact</span>
                              </div>
                              <p className="text-xs font-medium">{agreement.emergency_contact_name} ({agreement.emergency_contact_relationship})</p>
                              <a href={`tel:${agreement.emergency_contact_phone}`} className="flex items-center gap-1.5 text-xs text-primary hover:underline mt-0.5">
                                <Phone className="w-3 h-3 shrink-0" />
                                {agreement.emergency_contact_phone}
                              </a>
                            </div>
                          ) : (
                            <div className="mt-2 pl-[52px] pt-2 border-t border-dashed">
                              <p className="text-[10px] text-muted-foreground italic">No emergency contact on file</p>
                            </div>
                          )}

                          {/* Row 4: Send Payment Link for unpaid */}
                          {enr.payment_status !== "paid" && (
                            <div className="mt-2 pl-[52px] pt-2 border-t border-dashed">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1.5"
                                disabled={sendingPaymentFor === enr.id}
                                onClick={() => handleSendPaymentLink(enr.id)}
                              >
                                <Send className="w-3 h-3" />
                                {sendingPaymentFor === enr.id ? "Sending…" : "Send Payment Link"}
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="sticky bottom-0 bg-card border-t p-4 flex gap-2">
              <Button size="sm" variant="outline" onClick={onEdit} className="flex-1 gap-1.5">
                <Pencil className="w-3.5 h-3.5" /> Edit
              </Button>
              {isSwim && (
                <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={() => setShowAddSwimmer(true)}>
                  <UserPlus className="w-3.5 h-3.5" /> Add Swimmer
                </Button>
              )}
            </div>

            {isSwim && (
              <AddSwimmerDialog
                open={showAddSwimmer}
                onOpenChange={setShowAddSwimmer}
                sessionId={block.session.id}
                sessionName={block.session.session_name || block.session.swim_level}
                swimLevel={block.session.swim_level}
                dateStr={block.dateStr}
                onSaved={onRefetch || (() => {})}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CalendarBlockDetail;
export type { BlockInfo, SwimBlockInfo, EventBlockInfo, ICSBlockInfo };

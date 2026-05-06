import { useState, useEffect } from "react";
import { format } from "date-fns";
import { X, Clock, User, Pencil, UserPlus, Phone, Mail, Lock, AlertTriangle, Send, Stethoscope, CreditCard, CheckCircle2 } from "lucide-react";
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
import LessonOccurrenceCheckoutDialog from "./LessonOccurrenceCheckoutDialog";
import FrontDeskWaiverDialog from "./FrontDeskWaiverDialog";
import FrontDeskEnrollmentWaiverDialog from "./FrontDeskEnrollmentWaiverDialog";
import EditSwimmerDialog, { type EditTarget } from "./EditSwimmerDialog";
import { getStripeEnvironment } from "@/lib/stripe";
import { ClipboardSignature } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  const [lessonOcc, setLessonOcc] = useState<any | null>(null);
  const [lessonBooking, setLessonBooking] = useState<any | null>(null);
  const [loadingLesson, setLoadingLesson] = useState(false);
  const [resending, setResending] = useState(false);
  const [marking, setMarking] = useState(false);
  const [showCardCheckout, setShowCardCheckout] = useState(false);
  const [showFrontDeskWaiver, setShowFrontDeskWaiver] = useState(false);
  const [resendingWaiver, setResendingWaiver] = useState(false);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [enrWaiverTarget, setEnrWaiverTarget] = useState<{ id: string; parent_name: string; parent_email: string; child_name: string } | null>(null);

  const refetchLesson = async () => {
    if (!eventId) return;
    const { data } = await supabase
      .from("lesson_booking_occurrences")
      .select("*, lesson_bookings(*)")
      .eq("pool_event_id", eventId)
      .maybeSingle();
    setLessonOcc(data || null);
    setLessonBooking((data as any)?.lesson_bookings || null);
  };

  const handleResendWaiver = async () => {
    if (!lessonOcc) return;
    setResendingWaiver(true);
    try {
      const { error } = await supabase.functions.invoke("send-lesson-booking-confirmation", {
        body: { occurrenceId: lessonOcc.id, environment: getStripeEnvironment(), siteUrl: window.location.origin },
      });
      if (error) throw error;
      toast.success("Waiver + payment link re-sent");
      await refetchLesson();
    } catch (err: any) {
      toast.error(err?.message || "Failed to resend");
    } finally {
      setResendingWaiver(false);
    }
  };

  const eventId = block?.kind === "event" ? block.event.id : null;
  const isLessonEventType = block?.kind === "event" && (
    block.event.event_type === "private-lesson" ||
    block.event.event_type === "semi-private-lesson" ||
    block.event.event_type === "private_lesson" ||
    block.event.event_type === "semi_private_lesson"
  );

  useEffect(() => {
    let active = true;
    if (!eventId || !isLessonEventType) {
      setLessonOcc(null); setLessonBooking(null); return;
    }
    setLoadingLesson(true);
    (async () => {
      const { data } = await supabase
        .from("lesson_booking_occurrences")
        .select("*, lesson_bookings(*)")
        .eq("pool_event_id", eventId)
        .maybeSingle();
      if (!active) return;
      setLessonOcc(data || null);
      setLessonBooking((data as any)?.lesson_bookings || null);
      setLoadingLesson(false);
    })();
    return () => { active = false; };
  }, [eventId, isLessonEventType]);

  if (!block) return null;

  const handleSendPaymentLink = async (enrollmentId: string) => {
    setSendingPaymentFor(enrollmentId);
    try {
      const { error } = await supabase.functions.invoke("send-session-payment-link", {
        body: { enrollmentId, environment: getStripeEnvironment(), siteUrl: window.location.origin },
      });
      if (error) throw error;
      toast.success("Payment link sent!");
    } catch (err: any) {
      toast.error(err?.message || "Failed to send payment link");
    } finally {
      setSendingPaymentFor(null);
    }
  };

  const handleResendLessonLink = async () => {
    if (!lessonOcc) return;
    setResending(true);
    try {
      const { error } = await supabase.functions.invoke("send-lesson-booking-confirmation", {
        body: { occurrenceId: lessonOcc.id, environment: getStripeEnvironment(), siteUrl: window.location.origin },
      });
      if (error) throw error;
      toast.success("Payment link emailed to parent");
      const { data } = await supabase.from("lesson_booking_occurrences").select("*, lesson_bookings(*)").eq("id", lessonOcc.id).maybeSingle();
      setLessonOcc(data); setLessonBooking((data as any)?.lesson_bookings || null);
    } catch (err: any) {
      toast.error(err?.message || "Failed to resend");
    } finally { setResending(false); }
  };

  const [markDialogOpen, setMarkDialogOpen] = useState(false);
  const [markMethod, setMarkMethod] = useState<"cash" | "check" | "comp" | "other">("cash");
  const [markReference, setMarkReference] = useState("");

  const handleMarkPaidConfirm = async () => {
    if (!lessonOcc) return;
    const trimmedRef = markReference.trim();
    if (!trimmedRef) {
      toast.error("Reference number is required (receipt #, check #, or note)");
      return;
    }
    setMarking(true);
    try {
      const { error } = await supabase
        .from("lesson_booking_occurrences")
        .update({
          payment_status: markMethod === "comp" ? "comp" : "paid",
          paid_at: new Date().toISOString(),
          payment_method: markMethod,
          payment_reference: trimmedRef,
        })
        .eq("id", lessonOcc.id);
      if (error) throw error;
      toast.success(`Marked ${markMethod === "comp" ? "comp" : "paid"} (${markMethod})`);
      setMarkDialogOpen(false);
      setMarkReference("");
      const { data } = await supabase.from("lesson_booking_occurrences").select("*, lesson_bookings(*)").eq("id", lessonOcc.id).maybeSingle();
      setLessonOcc(data); setLessonBooking((data as any)?.lesson_bookings || null);
    } catch (err: any) {
      toast.error(err?.message || "Failed to mark paid");
    } finally { setMarking(false); }
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
                              <button
                                title="Edit swimmer info"
                                onClick={() => setEditTarget({
                                  kind: "swim_enrollment",
                                  id: enr.id,
                                  child_name: enr.child_name,
                                  child_age: enr.child_age ?? null,
                                  parent_name: enr.parent_name,
                                  parent_email: enr.parent_email || "",
                                  parent_phone: enr.parent_phone || null,
                                })}
                                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
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
                            <div className="mt-2 pl-[52px] pt-2 border-t border-dashed space-y-2">
                              <p className="text-[10px] text-muted-foreground italic">No waiver / emergency contact on file</p>
                              <Button
                                size="sm"
                                variant="default"
                                className="h-7 text-xs gap-1.5"
                                onClick={() => setEnrWaiverTarget({
                                  id: enr.id,
                                  parent_name: enr.parent_name,
                                  parent_email: enr.parent_email || "",
                                  child_name: enr.child_name,
                                })}
                              >
                                <ClipboardSignature className="w-3 h-3" /> Complete Waivers
                              </Button>
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

            {/* Lesson booking (private/semi-private) panel */}
            {isLessonEventType && (
              <div className="px-4 pb-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Lesson Booking
                </h4>
                {loadingLesson && <p className="text-xs text-muted-foreground">Loading…</p>}
                {!loadingLesson && !lessonOcc && (
                  <p className="text-sm text-muted-foreground italic">No booking record linked to this event.</p>
                )}
                {!loadingLesson && lessonOcc && lessonBooking && (
                  <div className="rounded-lg border bg-card p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium truncate">{lessonBooking.child_name || lessonBooking.parent_name}</p>
                          <button
                            title="Edit swimmer info"
                            onClick={() => setEditTarget({
                              kind: "lesson_booking",
                              id: lessonBooking.id,
                              child_name: lessonBooking.child_name,
                              parent_name: lessonBooking.parent_name,
                              parent_email: lessonBooking.parent_email,
                              parent_phone: lessonBooking.parent_phone || null,
                            })}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground">{lessonBooking.parent_name}</p>
                      </div>
                      <Badge className={cn(
                        "text-[10px] px-1.5 py-0.5 shrink-0",
                        lessonOcc.payment_status === "paid"
                          ? "bg-green-100 text-green-700 hover:bg-green-100"
                          : lessonOcc.payment_status === "comp"
                          ? "bg-blue-100 text-blue-700 hover:bg-blue-100"
                          : "bg-yellow-100 text-yellow-700 hover:bg-yellow-100"
                      )}>
                        {lessonOcc.payment_status === "paid"
                          ? `Paid${lessonOcc.payment_method ? ` (${lessonOcc.payment_method})` : ""}`
                          : lessonOcc.payment_status === "comp" ? "Comp"
                          : lessonOcc.payment_status === "flagged_no_pay" ? "Unpaid (flagged)"
                          : "Unpaid"}
                      </Badge>
                    </div>
                    {lessonBooking.parent_email && (
                      <a href={`mailto:${lessonBooking.parent_email}`} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                        <Mail className="w-3 h-3" />{lessonBooking.parent_email}
                      </a>
                    )}
                    {lessonBooking.parent_phone && (
                      <a href={`tel:${lessonBooking.parent_phone}`} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                        <Phone className="w-3 h-3" />{lessonBooking.parent_phone}
                      </a>
                    )}
                    <div className="text-xs text-muted-foreground">
                      ${Number(lessonBooking.price_per_session).toFixed(2)} • {lessonBooking.lesson_type === "private" ? "Private" : "Semi-Private"}
                      {lessonOcc.payment_link_sent_at && (
                        <span> • Link sent {format(new Date(lessonOcc.payment_link_sent_at), "MMM d, h:mma")}</span>
                      )}
                    </div>
                    {lessonOcc.payment_status === "paid" && lessonOcc.stripe_session_id && (
                      <a
                        href={
                          lessonOcc.stripe_session_id.startsWith("pi_")
                            ? `https://dashboard.stripe.com/payments/${lessonOcc.stripe_session_id}`
                            : `https://dashboard.stripe.com/checkout/sessions/${lessonOcc.stripe_session_id}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                      >
                        <CreditCard className="w-3 h-3" />View payment in Stripe
                      </a>
                    )}

                    {lessonOcc.payment_status !== "paid" && (
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-dashed">
                        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" disabled={resending} onClick={handleResendLessonLink}>
                          <Send className="w-3 h-3" />{resending ? "Sending…" : (lessonOcc.payment_link_sent_at ? "Resend link" : "Send link")}
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => setShowCardCheckout(true)}>
                          <CreditCard className="w-3 h-3" />Charge card
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5 col-span-2" onClick={() => { setMarkMethod("cash"); setMarkReference(""); setMarkDialogOpen(true); }}>
                          <CheckCircle2 className="w-3 h-3" />Mark paid (cash / check / comp)
                        </Button>
                      </div>
                    )}

                    {/* Waiver row */}
                    <div className="pt-2 border-t border-dashed space-y-2">
                      <div className="flex items-center gap-1.5 text-xs">
                        <Lock className="w-3 h-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Waiver:</span>
                        {lessonBooking.waiver_signed_at ? (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 hover:bg-green-100">
                            Signed {format(new Date(lessonBooking.waiver_signed_at), "MMM d")}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-700 hover:bg-orange-100">
                            Not signed
                          </Badge>
                        )}
                      </div>
                      {!lessonBooking.waiver_signed_at && (
                        <div className="flex flex-col gap-1.5">
                          <Button
                            size="sm"
                            variant="default"
                            className="h-8 text-xs gap-1.5 w-full"
                            onClick={() => setShowFrontDeskWaiver(true)}
                          >
                            <ClipboardSignature className="w-3.5 h-3.5" /> Complete Waivers
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" disabled={resendingWaiver} onClick={handleResendWaiver}>
                            <Send className="w-3 h-3" />{resendingWaiver ? "Sending…" : "Resend waiver email"}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}


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

            <LessonOccurrenceCheckoutDialog
              open={showCardCheckout}
              onOpenChange={(o) => {
                setShowCardCheckout(o);
                if (!o && lessonOcc) {
                  // refresh after close in case payment completed
                  supabase.from("lesson_booking_occurrences").select("*, lesson_bookings(*)").eq("id", lessonOcc.id).maybeSingle().then(({ data }) => {
                    setLessonOcc(data); setLessonBooking((data as any)?.lesson_bookings || null);
                  });
                }
              }}
              occurrenceId={lessonOcc?.id || null}
              title={lessonBooking ? `Charge ${lessonBooking.parent_name} — $${Number(lessonBooking.price_per_session).toFixed(2)}` : undefined}
            />

            <FrontDeskWaiverDialog
              open={showFrontDeskWaiver}
              onOpenChange={setShowFrontDeskWaiver}
              booking={lessonBooking ? {
                id: lessonBooking.id,
                waiver_token: lessonBooking.waiver_token,
                parent_name: lessonBooking.parent_name,
                parent_email: lessonBooking.parent_email,
                child_name: lessonBooking.child_name,
                lesson_type: lessonBooking.lesson_type,
              } : null}
              onSigned={refetchLesson}
            />

            <EditSwimmerDialog
              open={!!editTarget}
              onOpenChange={(o) => { if (!o) setEditTarget(null); }}
              target={editTarget}
              onSaved={() => {
                if (editTarget?.kind === "lesson_booking") refetchLesson();
                onRefetch?.();
              }}
            />

            <FrontDeskEnrollmentWaiverDialog
              open={!!enrWaiverTarget}
              onOpenChange={(o) => { if (!o) setEnrWaiverTarget(null); }}
              enrollment={enrWaiverTarget}
              onSigned={() => {
                onRefetch?.();
              }}
            />

            {/* Mark-paid (manual) dialog — requires reference for audit trail */}
            <Dialog open={markDialogOpen} onOpenChange={setMarkDialogOpen}>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>Record manual payment</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Method</Label>
                    <Select value={markMethod} onValueChange={(v) => setMarkMethod(v as any)}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="check">Check</SelectItem>
                        <SelectItem value="comp">Comp (no charge)</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Reference (required)</Label>
                    <Input
                      placeholder={
                        markMethod === "cash" ? "Receipt # or note" :
                        markMethod === "check" ? "Check #" :
                        markMethod === "comp" ? "Reason for comp" : "Reference"
                      }
                      value={markReference}
                      onChange={(e) => setMarkReference(e.target.value)}
                      className="h-9"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Required for audit. Stripe payments are recorded automatically and don't need this.
                    </p>
                  </div>
                  <div className="flex gap-2 justify-end pt-2">
                    <Button size="sm" variant="ghost" onClick={() => setMarkDialogOpen(false)}>Cancel</Button>
                    <Button size="sm" disabled={marking || !markReference.trim()} onClick={handleMarkPaidConfirm}>
                      {marking ? "Saving…" : "Confirm"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
    </div>
  );
};

export default CalendarBlockDetail;
export type { BlockInfo, SwimBlockInfo, EventBlockInfo, ICSBlockInfo };

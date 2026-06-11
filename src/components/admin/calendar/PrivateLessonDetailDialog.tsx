import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import type { PrivateLessonBooking } from "@/hooks/useCalendarData";
import { Mail, User, Clock, CreditCard, ClipboardSignature, Trash2, Loader2, CalendarCog } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ReschedulePrivateLessonDialog from "@/components/admin/booking/ReschedulePrivateLessonDialog";

interface Props {
  lesson: PrivateLessonBooking | null;
  onClose: () => void;
  onChanged: () => void;
}

const SITE = "https://aquaticdreamsswim.com";

function fmtTime(t: string) {
  if (!t) return "";
  return format(new Date(`2000-01-01T${t}`), "h:mm a");
}

const paymentBadge = (status: string) => {
  const s = status || "unpaid";
  const map: Record<string, { label: string; cls: string }> = {
    paid: { label: "Paid", cls: "bg-green-100 text-green-800 border-green-300" },
    card_on_file: { label: "Card on file", cls: "bg-blue-100 text-blue-800 border-blue-300" },
    unpaid: { label: "Unpaid", cls: "bg-orange-100 text-orange-800 border-orange-300" },
    comp: { label: "Comp", cls: "bg-purple-100 text-purple-800 border-purple-300" },
  };
  const m = map[s] || { label: s, cls: "bg-muted text-foreground border-border" };
  return <Badge className={m.cls} variant="outline">{m.label}</Badge>;
};

export default function PrivateLessonDetailDialog({ lesson, onClose, onChanged }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [rescheduleBooking, setRescheduleBooking] = useState<any | null>(null);
  if (!lesson) return null;

  const waiverUrl = lesson.waiver_token ? `${SITE}/lesson-waiver/${lesson.waiver_token}` : null;

  const resendConfirmation = async () => {
    setBusy("resend");
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-private-booking", {
        body: {
          resend_confirmation_for: lesson.booking_id,
        },
      });
      if (error || (data as any)?.error) throw new Error(error?.message || (data as any)?.error);
      toast.success("Confirmation email re-sent");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setBusy(null);
    }
  };

  const cancelOccurrence = async () => {
    if (!confirm("Cancel this lesson occurrence?")) return;
    setBusy("cancel");
    try {
      const { error } = await supabase
        .from("lesson_booking_occurrences")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", lesson.occurrence_id);
      if (error) throw error;
      toast.success("Lesson cancelled");
      onChanged();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={!!lesson} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {lesson.lesson_type === "semi_private" ? "Semi-Private Lesson" : "Private Lesson"}
            {paymentBadge(lesson.payment_status)}
          </DialogTitle>
          <DialogDescription>
            {format(new Date(lesson.occurrence_date + "T00:00:00"), "EEEE, MMMM d, yyyy")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-muted-foreground" /> {fmtTime(lesson.start_time)} – {fmtTime(lesson.end_time)}</div>
          {lesson.instructor_name && (
            <div className="flex items-center gap-2"><User className="w-4 h-4 text-muted-foreground" /> Coach {lesson.instructor_name}</div>
          )}
          <Separator />
          <div>
            <p className="font-semibold">{lesson.child_name || lesson.parent_name}</p>
            {lesson.child_age != null && <p className="text-xs text-muted-foreground">Age {lesson.child_age}</p>}
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Parent: {lesson.parent_name}</p>
            <p className="flex items-center gap-1"><Mail className="w-3 h-3" /> {lesson.parent_email}</p>
            {lesson.parent_phone && <p>📞 {lesson.parent_phone}</p>}
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2"><CreditCard className="w-4 h-4 text-muted-foreground" /> Price</span>
            <span className="font-semibold">${lesson.price_per_session}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2"><ClipboardSignature className="w-4 h-4 text-muted-foreground" /> Waiver</span>
            <span>{lesson.waiver_signed_at ? <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">Signed</Badge> : <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-300">Not signed</Badge>}</span>
          </div>
          {waiverUrl && !lesson.waiver_signed_at && (
            <a href={waiverUrl} target="_blank" rel="noreferrer" className="text-xs text-primary break-all">{waiverUrl}</a>
          )}
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" /> Confirmation email</span>
            <span>
              {lesson.confirmation_email_status === "sent" ? (
                <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                  Sent{lesson.confirmation_email_sent_at ? ` ${format(new Date(lesson.confirmation_email_sent_at), "MMM d, h:mm a")}` : ""}
                </Badge>
              ) : lesson.confirmation_email_status === "failed" ? (
                <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300">Failed</Badge>
              ) : (
                <Badge variant="outline" className="bg-muted text-muted-foreground border-border">Unknown</Badge>
              )}
            </span>
          </div>
          {lesson.confirmation_email_status === "failed" && lesson.confirmation_email_error && (
            <p className="text-xs text-red-700 bg-red-50 p-2 rounded break-words">{lesson.confirmation_email_error}</p>
          )}
          {lesson.notes && (
            <div className="text-xs text-muted-foreground bg-muted/40 p-2 rounded">
              <p className="font-semibold mb-1">Notes</p>{lesson.notes}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={resendConfirmation} disabled={busy !== null}>
            {busy === "resend" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Mail className="w-4 h-4 mr-1" />}
            Resend confirmation
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              setBusy("reschedule");
              try {
                const { data, error } = await supabase
                  .from("lesson_bookings")
                  .select("id, child_name, parent_name, instructor_id, instructor_name, start_time, end_time, lesson_booking_occurrences(id, occurrence_date, status, start_time_override, end_time_override, instructor_override_id, instructor_override_name)")
                  .eq("id", lesson.booking_id)
                  .maybeSingle();
                if (error || !data) throw new Error(error?.message || "Could not load booking");
                setRescheduleBooking(data);
              } catch (e: any) {
                toast.error(e?.message || "Failed");
              } finally {
                setBusy(null);
              }
            }}
            disabled={busy !== null}
          >
            {busy === "reschedule" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CalendarCog className="w-4 h-4 mr-1" />}
            Reschedule
          </Button>
          <Button variant="destructive" size="sm" onClick={cancelOccurrence} disabled={busy !== null}>
            {busy === "cancel" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
            Cancel lesson
          </Button>
          <Button size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
      <ReschedulePrivateLessonDialog
        open={!!rescheduleBooking}
        onOpenChange={(o) => { if (!o) setRescheduleBooking(null); }}
        booking={rescheduleBooking}
        initialOccurrenceId={lesson.occurrence_id}
        initialMode="one"
        onDone={() => { setRescheduleBooking(null); onChanged(); onClose(); }}
      />
    </Dialog>
  );
}

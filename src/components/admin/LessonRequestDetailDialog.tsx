import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Phone, Send, MailCheck, CalendarPlus, UserCog } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import InternalCommentsPanel from "@/components/admin/InternalCommentsPanel";
import { formatPhone, phoneHref } from "@/lib/phone";
import BookFromRequestDialog from "@/components/admin/BookFromRequestDialog";

export interface LessonRequest {
  id: string;
  parent_name: string;
  parent_email: string;
  parent_phone: string | null;
  child_name: string;
  child_age: number;
  child_dob?: string | null;
  lesson_type: string;
  preferred_times: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  last_replied_at?: string | null;
  last_reply_message?: string | null;
  is_adult_swimmer?: boolean | null;
}

interface Props {
  request: LessonRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (r: LessonRequest) => void;
}

export default function LessonRequestDetailDialog({ request, open, onOpenChange, onUpdated }: Props) {
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("new");
  const [bookOpen, setBookOpen] = useState(false);

  useEffect(() => {
    if (!request) return;
    setStatus(request.status);
    setSubject(`Re: Your lesson request for ${request.child_name}`);
    setBody(
      `Thanks so much for reaching out about ${request.lesson_type === "private" ? "private" : "semi-private"} lessons for ${request.child_name}.\n\n[Add your reply here — availability, scheduling, next steps, etc.]\n\nLet me know if any of those work and I'll get you on the calendar.`
    );
  }, [request]);

  if (!request) return null;

  const updateStatus = async (newStatus: string) => {
    setStatus(newStatus);
    await supabase.from("lesson_requests").update({ status: newStatus }).eq("id", request.id);
    onUpdated({ ...request, status: newStatus });
  };

  const handleSendReply = async () => {
    if (!body.trim()) {
      toast({ title: "Message is empty", description: "Add a message before sending.", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "lesson-request-reply",
          recipientEmail: request.parent_email,
          idempotencyKey: `lesson-reply-${request.id}-${Date.now()}`,
          templateData: {
            parentName: request.parent_name,
            childName: request.child_name,
            subject,
            body,
          },
        },
      });
      if (error) throw error;

      const nowIso = new Date().toISOString();
      await supabase
        .from("lesson_requests")
        .update({ status: "contacted", last_replied_at: nowIso, last_reply_message: body })
        .eq("id", request.id);

      onUpdated({ ...request, status: "contacted", last_replied_at: nowIso, last_reply_message: body });
      toast({ title: "Reply sent", description: `Email sent to ${request.parent_email}` });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Failed to send", description: e.message ?? "Try again in a moment.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Lesson Request — {request.child_name}
            <Badge variant="outline" className={request.lesson_type === "private" ? "bg-purple-50 text-purple-700 border-purple-300" : "bg-blue-50 text-blue-700 border-blue-300"}>
              {request.lesson_type === "private" ? "Private" : "Semi-Private"}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Child</div>
              <div className="font-medium">{request.child_name} (age {request.child_age})</div>
              {request.child_dob && (
                <div className="text-xs text-muted-foreground">DOB: {new Date(request.child_dob).toLocaleDateString()}</div>
              )}
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Submitted</div>
              <div>{new Date(request.created_at).toLocaleString()}</div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="mt-1 inline-flex items-center gap-1 text-xs text-green-700 cursor-help">
                      <MailCheck className="h-3.5 w-3.5" />
                      Auto-confirmation sent
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    A generic "we got your request" email was sent to the parent automatically when they submitted the form. This is not a personal reply — status stays "New" until you send one.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Parent</div>
              <div className="font-medium">{request.parent_name}</div>
              <a href={`mailto:${request.parent_email}`} className="flex items-center gap-1 text-primary hover:underline">
                <Mail className="h-3 w-3" /> {request.parent_email}
              </a>
              {request.parent_phone && (
                <a href={phoneHref(request.parent_phone)} className="flex items-center gap-1 text-primary hover:underline">
                  <Phone className="h-3 w-3" /> {formatPhone(request.parent_phone)}
                </a>
              )}
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Status</div>
              <Select value={status} onValueChange={updateStatus}>
                <SelectTrigger className="w-full h-8 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="declined">Declined</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Preferred Times</div>
            <div className="bg-muted/50 rounded p-2 whitespace-pre-wrap">{request.preferred_times || "—"}</div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Notes</div>
            <div className="bg-muted/50 rounded p-2 whitespace-pre-wrap">{request.notes || "—"}</div>
          </div>

          {request.last_replied_at && (
            <div className="border-l-2 border-primary/50 pl-3 py-1 bg-primary/5 rounded-r">
              <div className="text-xs text-muted-foreground">Last reply sent {new Date(request.last_replied_at).toLocaleString()}</div>
              {request.last_reply_message && (
                <div className="text-xs mt-1 whitespace-pre-wrap text-muted-foreground">{request.last_reply_message}</div>
              )}
            </div>
          )}

          <div className="border-t pt-4">
            <InternalCommentsPanel
              targetType="lesson_request"
              targetKey={request.id}
              title="Internal Notes"
              emptyHint="Document call attempts, voicemails, or anything other staff should know."
            />
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="font-semibold text-foreground">Reply via Email</div>
            <div>
              <Label htmlFor="reply-subject" className="text-xs">Subject</Label>
              <Input id="reply-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="reply-body" className="text-xs">Message</Label>
              <Textarea id="reply-body" value={body} onChange={(e) => setBody(e.target.value)} rows={8} />
              <p className="text-xs text-muted-foreground mt-1">
                This is your first <strong>personal</strong> reply (separate from the auto-confirmation the parent already received). Sending will move status from "New" to "Contacted".
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2 flex-wrap">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button variant="secondary" onClick={() => setBookOpen(true)}>
            <CalendarPlus className="h-4 w-4 mr-2" />
            Book Lesson
          </Button>
          <Button onClick={handleSendReply} disabled={sending}>
            <Send className="h-4 w-4 mr-2" />
            {sending ? "Sending…" : "Send Reply"}
          </Button>
        </DialogFooter>
      </DialogContent>
      <BookFromRequestDialog
        request={request}
        open={bookOpen}
        onOpenChange={setBookOpen}
        onBooked={(updated) => {
          setStatus(updated.status);
          onUpdated(updated);
        }}
      />
    </Dialog>
  );
}

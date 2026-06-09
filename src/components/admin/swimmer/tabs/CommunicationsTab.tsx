import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Mail, Send, Inbox, AlertCircle, RotateCcw, Link2 } from "lucide-react";
import type { Swimmer } from "@/hooks/useSwimmers";

interface Props {
  swimmer: Swimmer;
}

interface LogRow {
  id: string;
  template_name: string;
  status: string;
  created_at: string;
  error_message: string | null;
  message_id: string | null;
  metadata: any;
}

interface EnrollmentRow {
  id: string;
  created_at: string;
  swim_level: string | null;
  session_id: string | null;
  payment_status: string | null;
  is_first_time: boolean | null;
}

const fmt = (iso: string) => new Date(iso).toLocaleString();

const PAYMENT_LINK_TEMPLATES: Record<
  string,
  { fn: string; label: string; description: string }
> = {
  "session-welcome": {
    fn: "send-session-welcome-email",
    label: "Resend welcome + fresh payment link",
    description:
      "Regenerates the session welcome email with a brand-new Stripe checkout URL.",
  },
  "session-payment-link": {
    fn: "send-session-payment-link",
    label: "Send fresh session payment link",
    description: "Creates a new $240 Stripe checkout URL and emails it.",
  },
  "registration-fee-payment-link": {
    fn: "send-registration-fee-payment-link",
    label: "Send fresh registration fee link",
    description: "Creates a new $45 Stripe checkout URL and emails it.",
  },
};

const statusTone = (s: string) => {
  switch (s) {
    case "sent":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "pending":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "bounced":
    case "complained":
    case "failed":
    case "dlq":
      return "bg-red-100 text-red-800 border-red-200";
    default:
      return "bg-muted text-muted-foreground";
  }
};

// Convert rendered HTML email body into editable plain text for Compose.
// Strips the unsubscribe footer and collapses common tags.
function htmlToPlain(html: string): string {
  if (!html) return "";
  let s = html;
  // Drop everything from common footer markers onward
  const footerIdx = s.search(
    /(unsubscribe|preferences|you (are|received this)|view in browser)/i,
  );
  if (footerIdx > 200) s = s.slice(0, footerIdx);
  s = s
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h\d|li)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return s;
}

export default function CommunicationsTab({ swimmer }: Props) {
  const { toast } = useToast();
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string>("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("email_send_log")
      .select(
        "id, template_name, status, created_at, error_message, message_id, metadata",
      )
      .ilike("recipient_email", swimmer.parent_email)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      console.error("load email log", error);
      setLogs([]);
    } else {
      const seen = new Set<string>();
      const unique: LogRow[] = [];
      for (const row of data || []) {
        const key = row.message_id || row.id;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(row as LogRow);
      }
      setLogs(unique);
    }
    setLoading(false);
  };

  const loadEnrollments = async () => {
    const { data } = await supabase
      .from("swim_enrollments")
      .select("id, created_at, swim_level, session_id, payment_status, is_first_time")
      .ilike("parent_email", swimmer.parent_email)
      .ilike("child_name", swimmer.child_name)
      .order("created_at", { ascending: false });
    const rows = (data || []) as EnrollmentRow[];
    setEnrollments(rows);
    if (rows.length && !selectedEnrollmentId) {
      setSelectedEnrollmentId(rows[0].id);
    }
  };

  useEffect(() => {
    load();
    loadEnrollments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swimmer.parent_email, swimmer.child_name]);

  const prefillResend = (log: LogRow) => {
    const subj: string =
      log.metadata?.subject ||
      log.metadata?.templateData?.subject ||
      log.template_name;
    const html: string = log.metadata?.html || "";
    const plain = htmlToPlain(html) || `(Original message content unavailable — please retype.)`;
    setSubject(subj.startsWith("Re: ") ? subj : `Re: ${subj}`);
    setBody(plain);
    setShowCompose(true);
    setTimeout(() => {
      document.getElementById("email-subject")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  const sendFreshPaymentLink = async (log: LogRow) => {
    const cfg = PAYMENT_LINK_TEMPLATES[log.template_name];
    if (!cfg) return;
    if (!selectedEnrollmentId) {
      toast({
        title: "Pick an enrollment first",
        description: "Choose which enrollment the payment link applies to.",
        variant: "destructive",
      });
      return;
    }
    setBusyRow(log.id);
    try {
      const { data, error } = await supabase.functions.invoke(cfg.fn, {
        body: { enrollmentId: selectedEnrollmentId, environment: "live" },
      });
      if (error || (data as any)?.error) {
        throw new Error(error?.message || (data as any)?.error || "Send failed");
      }
      toast({ title: "Fresh payment link sent", description: `Re-emailed ${swimmer.parent_email}` });
      setTimeout(load, 1200);
    } catch (e: any) {
      toast({ title: "Send failed", description: e?.message, variant: "destructive" });
    } finally {
      setBusyRow(null);
    }
  };

  const sendEmail = async () => {
    if (!subject.trim() || !body.trim()) {
      toast({ title: "Subject and message required", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "admin-freeform",
          recipientEmail: swimmer.parent_email,
          templateData: {
            parentName: swimmer.parent_name,
            subject: subject.trim(),
            body: body.trim(),
          },
        },
      });
      if (error) throw error;
      toast({ title: "Email queued", description: `Sent to ${swimmer.parent_email}` });
      setSubject("");
      setBody("");
      setShowCompose(false);
      setTimeout(load, 1000);
    } catch (e: any) {
      toast({ title: "Send failed", description: e?.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const enrollmentLabel = (e: EnrollmentRow) =>
    `${e.swim_level || "—"} · ${new Date(e.created_at).toLocaleDateString()} · ${e.payment_status || "unpaid"}`;

  const hasPaymentEnrollments = useMemo(() => enrollments.length > 0, [enrollments]);

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
        <Inbox className="h-3.5 w-3.5 shrink-0" />
        Outbound emails only. Replies sent by parents go to the inbox at{" "}
        <span className="font-medium text-foreground">info@aquaticdreamsswim.com</span>.
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm">
          <span className="font-semibold">{logs.length}</span>{" "}
          <span className="text-muted-foreground">emails sent to {swimmer.parent_email}</span>
        </div>
        <Button size="sm" onClick={() => setShowCompose((v) => !v)} className="gap-1.5">
          <Mail className="h-3.5 w-3.5" />
          {showCompose ? "Cancel" : "Compose"}
        </Button>
      </div>

      {hasPaymentEnrollments && (
        <div className="rounded-md border bg-card p-2.5 flex items-center gap-2 text-xs">
          <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground shrink-0">Payment links apply to:</span>
          <Select value={selectedEnrollmentId} onValueChange={setSelectedEnrollmentId}>
            <SelectTrigger className="h-7 text-xs flex-1">
              <SelectValue placeholder="Select enrollment" />
            </SelectTrigger>
            <SelectContent>
              {enrollments.map((e) => (
                <SelectItem key={e.id} value={e.id} className="text-xs">
                  {enrollmentLabel(e)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {showCompose && (
        <div className="rounded-lg border p-3 space-y-2 bg-card">
          <div>
            <Label htmlFor="email-subject" className="text-xs">Subject</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Quick update about your lessons"
            />
          </div>
          <div>
            <Label htmlFor="email-body" className="text-xs">Message</Label>
            <Textarea
              id="email-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              placeholder="Hi there, just following up..."
            />
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={sendEmail} disabled={sending} className="gap-1.5">
              <Send className="h-3.5 w-3.5" />
              {sending ? "Sending…" : "Send email"}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-muted-foreground py-4 text-center">Loading…</p>
      ) : logs.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-4 text-center">
          No emails on record for this parent yet.
        </p>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const subj = log.metadata?.subject || log.metadata?.templateData?.subject;
            const paymentCfg = PAYMENT_LINK_TEMPLATES[log.template_name];
            const rowBusy = busyRow === log.id;
            return (
              <div key={log.id} className="rounded-md border p-2.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm">{subj || log.template_name}</div>
                    <div className="text-muted-foreground mt-0.5">
                      {log.template_name} · {fmt(log.created_at)}
                    </div>
                    {log.error_message && (
                      <div className="mt-1 flex items-start gap-1 text-red-700">
                        <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>{log.error_message}</span>
                      </div>
                    )}
                  </div>
                  <Badge variant="outline" className={statusTone(log.status)}>
                    {log.status}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => prefillResend(log)}
                    disabled={rowBusy}
                  >
                    <RotateCcw className="h-3 w-3" />
                    Resend (edit)
                  </Button>
                  {paymentCfg && (
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 text-xs gap-1"
                      onClick={() => sendFreshPaymentLink(log)}
                      disabled={rowBusy || !selectedEnrollmentId}
                      title={paymentCfg.description}
                    >
                      <Link2 className="h-3 w-3" />
                      {rowBusy ? "Sending…" : paymentCfg.label}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

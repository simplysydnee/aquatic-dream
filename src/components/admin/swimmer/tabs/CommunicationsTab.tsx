import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Mail, Send, Inbox, AlertCircle } from "lucide-react";
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

const fmt = (iso: string) => new Date(iso).toLocaleString();

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

export default function CommunicationsTab({ swimmer }: Props) {
  const { toast } = useToast();
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("email_send_log")
      .select("id, template_name, status, created_at, error_message, message_id, metadata")
      .ilike("recipient_email", swimmer.parent_email)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      console.error("load email log", error);
      setLogs([]);
    } else {
      // Dedupe by message_id keeping latest status per email
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

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swimmer.parent_email]);

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

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
        <Inbox className="h-3.5 w-3.5 shrink-0" />
        Outbound emails only. Replies sent by parents go to the inbox at{" "}
        <span className="font-medium text-foreground">info@aquaticdreamsswim.com</span>.
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm">
          <span className="font-semibold">{logs.length}</span>{" "}
          <span className="text-muted-foreground">emails sent to {swimmer.parent_email}</span>
        </div>
        <Button size="sm" onClick={() => setShowCompose((v) => !v)} className="gap-1.5">
          <Mail className="h-3.5 w-3.5" />
          {showCompose ? "Cancel" : "Compose"}
        </Button>
      </div>

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
              rows={6}
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
            return (
              <div key={log.id} className="rounded-md border p-2.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

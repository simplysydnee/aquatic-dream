import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, MessageSquare, Send } from "lucide-react";

interface Props {
  parentPhone: string | null;
  parentName: string;
}

interface TextRow {
  id: string;
  direction: string;
  body: string;
  status: string | null;
  error: string | null;
  kind: string | null;
  sent_by_label: string | null;
  created_at: string;
}

const normalizePhone = (raw: string | null): string | null => {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.startsWith("+")) return raw;
  return digits ? `+${digits}` : null;
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const kindLabel = (kind: string | null) => {
  if (!kind || kind === "other") return null;
  return kind.replace(/_/g, " ");
};

export default function TextsThread({ parentPhone, parentName }: Props) {
  const { toast } = useToast();
  const phone = useMemo(() => normalizePhone(parentPhone), [parentPhone]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TextRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    if (!phone) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const digits = phone.replace(/\D/g, "").slice(-10);
    const { data: convs } = await supabase
      .from("sms_conversations")
      .select("id, parent_phone")
      .or(`parent_phone.eq.${phone},parent_phone.eq.${digits},parent_phone.eq.+1${digits}`);
    const conv = convs?.[0] ?? null;
    setConversationId(conv?.id ?? null);
    if (!conv) {
      setMessages([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("sms_messages")
      .select("id, direction, body, status, error, kind, sent_by_label, created_at")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true })
      .limit(500);
    setMessages((data || []) as TextRow[]);
    setLoading(false);
  }, [phone]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`sms-thread-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sms_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          load();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  const send = async () => {
    if (!reply.trim() || !phone) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-sms-message", {
        body: conversationId
          ? { conversation_id: conversationId, body: reply.trim() }
          : { phone, body: reply.trim() },
      });
      if (error || (data as { error?: string } | null)?.error) {
        throw new Error(error?.message || (data as { error?: string })?.error || "Send failed");
      }
      setReply("");
      await load();
    } catch (e) {
      toast({
        title: "Text not sent",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  if (!phone) {
    return (
      <p className="text-xs text-muted-foreground italic py-6 text-center">
        No phone number on file for {parentName}, so there is nothing to text yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          Texts sent from the TextMagic dashboard do not show up here. Send from this page so the
          family history stays complete.
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 text-sm">
        <div>
          <span className="font-semibold">{messages.length}</span>{" "}
          <span className="text-muted-foreground">texts with {phone}</span>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground py-4 text-center">Loading…</p>
      ) : messages.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-6 text-center">
          No texts on record for this family yet.
        </p>
      ) : (
        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {messages.map((m) => {
            const inbound = m.direction === "inbound";
            const label = kindLabel(m.kind);
            return (
              <div
                key={m.id}
                className={`flex ${inbound ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg border px-3 py-2 text-xs ${
                    inbound ? "bg-muted" : "bg-primary/10 border-primary/20"
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words text-foreground">{m.body}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span>{fmt(m.created_at)}</span>
                    {m.sent_by_label && <span>· {m.sent_by_label}</span>}
                    {label && (
                      <Badge variant="outline" className="h-4 px-1 text-[10px] capitalize">
                        {label}
                      </Badge>
                    )}
                    {m.status === "failed" && (
                      <Badge variant="outline" className="h-4 px-1 text-[10px] text-red-700 border-red-200">
                        failed
                      </Badge>
                    )}
                  </div>
                  {m.error && <div className="mt-1 text-[11px] text-red-700">{m.error}</div>}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}

      <div className="rounded-lg border p-2.5 space-y-2 bg-card">
        <Textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={3}
          placeholder={`Text ${parentName}…`}
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={send} disabled={sending || !reply.trim()} className="gap-1.5">
            {sending ? <MessageSquare className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
            {sending ? "Sending…" : "Send text"}
          </Button>
        </div>
      </div>
    </div>
  );
}

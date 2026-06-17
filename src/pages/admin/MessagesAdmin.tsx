import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Loader2, Send, Search, MessageSquare, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type Conversation = {
  id: string;
  parent_phone: string;
  parent_name: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_direction: "inbound" | "outbound" | null;
};

type Message = {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  body: string;
  status: string;
  created_at: string;
};

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("+")) {
    const d = "+" + trimmed.slice(1).replace(/\D/g, "");
    return d.length > 1 ? d : null;
  }
  const just = trimmed.replace(/\D/g, "");
  if (just.length === 10) return `+1${just}`;
  if (just.length === 11 && just.startsWith("1")) return `+${just}`;
  return just ? `+${just}` : null;
}

export default function MessagesAdmin() {
  const { isAdmin, isInstructor } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [search, setSearch] = useState("");
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const [composeMode, setComposeMode] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newSending, setNewSending] = useState(false);

  const allowed = isAdmin || isInstructor;

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    (async () => {
      setLoadingConvs(true);
      const { data, error } = await supabase
        .from("sms_conversations")
        .select("id, parent_phone, parent_name, last_message_at, last_message_preview, last_direction")
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (cancelled) return;
      if (error) {
        toast({ title: "Failed to load conversations", description: error.message, variant: "destructive" });
      } else {
        const list = (data as Conversation[]) ?? [];
        setConversations(list);
        if (!activeId && list.length) setActiveId(list[0].id);
      }
      setLoadingConvs(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    const channel = supabase
      .channel("sms_conversations_inbox")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sms_conversations" },
        (payload) => {
          setConversations((prev) => {
            if (payload.eventType === "INSERT") {
              const row = payload.new as Conversation;
              if (prev.some((c) => c.id === row.id)) return prev;
              return [row, ...prev];
            }
            if (payload.eventType === "UPDATE") {
              const row = payload.new as Conversation;
              const next = prev.map((c) => (c.id === row.id ? { ...c, ...row } : c));
              next.sort((a, b) => {
                const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
                const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
                return tb - ta;
              });
              return next;
            }
            if (payload.eventType === "DELETE") {
              return prev.filter((c) => c.id !== (payload.old as Conversation).id);
            }
            return prev;
          });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [allowed]);

  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    let cancelled = false;
    (async () => {
      setLoadingMsgs(true);
      const { data, error } = await supabase
        .from("sms_messages")
        .select("id, conversation_id, direction, body, status, created_at")
        .eq("conversation_id", activeId)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        toast({ title: "Failed to load messages", description: error.message, variant: "destructive" });
      } else {
        setMessages((data as Message[]) ?? []);
      }
      setLoadingMsgs(false);
    })();
    return () => { cancelled = true; };
  }, [activeId]);

  useEffect(() => {
    if (!activeId) return;
    const channel = supabase
      .channel(`sms_messages_${activeId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "sms_messages",
          filter: `conversation_id=eq.${activeId}`,
        },
        (payload) => {
          const row = payload.new as Message;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeId]);

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages.length, activeId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        (c.parent_name ?? "").toLowerCase().includes(q) ||
        c.parent_phone.toLowerCase().includes(q),
    );
  }, [conversations, search]);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  const handleSend = async () => {
    const body = composer.trim();
    if (!body || !active || sending) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-sms-message", {
        body: { conversation_id: active.id, body },
      });
      if (error) throw error;
      if (data && (data as any).ok === false) {
        throw new Error((data as any).error || "SMS failed");
      }
      setComposer("");
    } catch (e: any) {
      toast({ title: "Failed to send", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleNewSend = async () => {
    const phone = normalizePhone(newPhone);
    const body = newBody.trim();
    if (!phone || !body || newSending) return;
    setNewSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-sms-message", {
        body: { phone, body },
      });
      if (error) throw error;
      const result = data as { ok: boolean; conversation_id?: string; error?: string } | undefined;
      if (!result || result.ok === false) {
        throw new Error(result?.error || "SMS failed");
      }
      setComposeMode(false);
      setNewPhone("");
      setNewBody("");
      if (result.conversation_id) {
        setActiveId(result.conversation_id);
      }
    } catch (e: any) {
      toast({ title: "Failed to send", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setNewSending(false);
    }
  };

  if (!allowed) {
    return <div className="p-6 text-sm text-muted-foreground">You don't have access to messages.</div>;
  }

  return (
    <div className="h-[calc(100vh-8rem)] grid grid-cols-1 md:grid-cols-[320px_1fr] gap-0 border rounded-md overflow-hidden bg-background">
      <div className="border-r flex flex-col min-h-0">
        <div className="p-3 border-b space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => setComposeMode(true)}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            New message
          </Button>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or phone"
              className="pl-8"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingConvs ? (
            <div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No conversations yet.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setComposeMode(true)}
              >
                Start a new conversation
              </Button>
            </div>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => { setActiveId(c.id); setComposeMode(false); }}
                className={cn(
                  "w-full text-left px-3 py-2.5 border-b hover:bg-muted/50 transition-colors",
                  !composeMode && activeId === c.id && "bg-muted",
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium truncate text-sm">
                    {c.parent_name || c.parent_phone}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatTime(c.last_message_at)}
                  </span>
                </div>
                {c.parent_name && (
                  <div className="text-[11px] text-muted-foreground truncate">{c.parent_phone}</div>
                )}
                <div className="text-xs text-muted-foreground truncate mt-0.5">
                  {c.last_direction === "outbound" && <span className="opacity-70">You: </span>}
                  {c.last_message_preview ?? "—"}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex flex-col min-h-0">
        {composeMode ? (
          <>
            <div className="px-4 py-3 border-b">
              <div className="font-medium text-sm">New message</div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-muted/20">
              <div className="space-y-4 max-w-md">
                <div>
                  <label className="text-xs font-medium mb-1 block text-muted-foreground">To</label>
                  <Input
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="+1 555 123 4567"
                  />
                </div>
                <Textarea
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  placeholder="Type a message…"
                  rows={4}
                  className="resize-none"
                  maxLength={1000}
                />
              </div>
            </div>
            <div className="border-t p-3 bg-background">
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setComposeMode(false);
                    setNewPhone("");
                    setNewBody("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleNewSend}
                  disabled={!normalizePhone(newPhone) || !newBody.trim() || newSending}
                >
                  {newSending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Send className="h-4 w-4 mr-1.5" />}
                  Send
                </Button>
              </div>
            </div>
          </>
        ) : !active ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Select a conversation
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b">
              <div className="font-medium text-sm">{active.parent_name || "Unknown"}</div>
              <div className="text-xs text-muted-foreground">{active.parent_phone}</div>
            </div>
            <div ref={threadRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/20">
              {loadingMsgs ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : messages.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8">No messages yet.</div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "flex flex-col max-w-[75%]",
                      m.direction === "outbound" ? "ml-auto items-end" : "items-start",
                    )}
                  >
                    <div
                      className={cn(
                        "px-3 py-2 rounded-lg text-sm whitespace-pre-wrap break-words",
                        m.direction === "outbound"
                          ? "bg-primary text-primary-foreground"
                          : "bg-background border",
                      )}
                    >
                      {m.body}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 px-1">
                      {formatTime(m.created_at)}
                      {m.status === "failed" && <span className="text-destructive ml-1">· failed</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="border-t p-3 bg-background">
              <div className="flex gap-2 items-end">
                <Textarea
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Type a message… (Cmd/Ctrl+Enter to send)"
                  rows={2}
                  className="resize-none"
                  maxLength={1000}
                />
                <Button onClick={handleSend} disabled={!composer.trim() || sending} size="icon" className="h-9 w-9 shrink-0">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSwimmerModal } from "@/components/admin/swimmer/SwimmerModalProvider";

interface InboundRow {
  id: string;
  conversation_id: string;
  body: string;
  direction: string;
  created_at: string;
}

const GROUP_WINDOW_MS = 4000;

/**
 * Toasts inbound family texts that arrive while the admin app is open.
 * Automated sends and staff replies never toast, since we only subscribe to
 * inbound rows.
 */
export default function InboundSmsNotifier() {
  const navigate = useNavigate();
  const { openByPhone } = useSwimmerModal();
  const buffer = useRef<InboundRow[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const flush = async () => {
      const rows = buffer.current;
      buffer.current = [];
      timer.current = null;
      if (!rows.length) return;

      const conversationIds = Array.from(new Set(rows.map((r) => r.conversation_id)));
      const { data: convs } = await supabase
        .from("sms_conversations")
        .select("id, parent_name, parent_phone")
        .in("id", conversationIds);

      const byId = new Map((convs || []).map((c) => [c.id, c]));
      const nameFor = (id: string) => {
        const c = byId.get(id);
        return c?.parent_name || c?.parent_phone || "Unknown number";
      };

      const goTo = (conversationId: string) => {
        const conv = byId.get(conversationId);
        if (conv?.parent_phone) {
          const opened = openByPhone(conv.parent_phone, "comms");
          if (opened) return;
        }
        navigate("/admin/messages");
      };

      if (rows.length === 1) {
        const row = rows[0];
        toast(`New text from ${nameFor(row.conversation_id)}`, {
          description: row.body.slice(0, 120),
          action: { label: "Open", onClick: () => goTo(row.conversation_id) },
        });
        return;
      }

      const families = conversationIds.length;
      toast(
        `${rows.length} new texts from ${families} ${families === 1 ? "family" : "families"}`,
        {
          description: conversationIds.map(nameFor).slice(0, 3).join(", "),
          action:
            families === 1
              ? { label: "Open", onClick: () => goTo(conversationIds[0]) }
              : { label: "View inbox", onClick: () => navigate("/admin/messages") },
        },
      );
    };

    const channel = supabase
      .channel("sms-inbound-toasts")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "sms_messages",
          filter: "direction=eq.inbound",
        },
        (payload) => {
          buffer.current.push(payload.new as InboundRow);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(flush, GROUP_WINDOW_MS);
        },
      )
      .subscribe();

    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [navigate, openByPhone]);

  return null;
}

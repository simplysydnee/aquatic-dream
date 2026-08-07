import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Lightweight cross-component signal so the Texts thread can tell the sidebar
// badge to refetch right after it marks a conversation read.
const EVENT = "sms-unread-changed";

export const notifyUnreadTextsChanged = () => {
  window.dispatchEvent(new CustomEvent(EVENT));
};

/**
 * Number of conversations with at least one inbound text the current staff
 * member has not read yet. Per person, never global.
 */
export function useUnreadTexts(): { unreadTexts: number; refresh: () => void } {
  const [unreadTexts, setUnreadTexts] = useState(0);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc("unread_sms_conversation_count");
    if (error) {
      console.error("unread text count failed", error);
      return;
    }
    setUnreadTexts(typeof data === "number" ? data : 0);
  }, []);

  useEffect(() => {
    refresh();

    const onChanged = () => refresh();
    window.addEventListener(EVENT, onChanged);

    const channel = supabase
      .channel("sms-unread-badge")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "sms_messages",
          filter: "direction=eq.inbound",
        },
        () => refresh(),
      )
      .subscribe();

    return () => {
      window.removeEventListener(EVENT, onChanged);
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { unreadTexts, refresh };
}

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface InternalComment {
  id: string;
  target_type: "swimmer" | "lesson_request";
  target_key: string;
  body: string;
  author_id: string | null;
  author_name: string;
  created_at: string;
  updated_at: string;
}

export function useInternalComments(targetType: "swimmer" | "lesson_request", targetKey: string | null) {
  const [comments, setComments] = useState<InternalComment[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!targetKey) {
      setComments([]);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("internal_comments")
      .select("*")
      .eq("target_type", targetType)
      .eq("target_key", targetKey)
      .order("created_at", { ascending: false });
    setComments((data || []) as InternalComment[]);
    setLoading(false);
  }, [targetType, targetKey]);

  useEffect(() => {
    load();
    if (!targetKey) return;
    const channel = supabase
      .channel(`comments-${targetType}-${targetKey}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "internal_comments", filter: `target_key=eq.${targetKey}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, targetType, targetKey]);

  const add = useCallback(
    async (body: string) => {
      if (!targetKey || !body.trim()) return;
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .maybeSingle();
      const author_name = profile?.full_name || profile?.email || user.email || "Staff";
      await supabase.from("internal_comments").insert({
        target_type: targetType,
        target_key: targetKey,
        body: body.trim(),
        author_id: user.id,
        author_name,
      });
    },
    [targetType, targetKey],
  );

  const remove = useCallback(async (id: string) => {
    await supabase.from("internal_comments").delete().eq("id", id);
  }, []);

  const update = useCallback(async (id: string, body: string) => {
    await supabase.from("internal_comments").update({ body: body.trim() }).eq("id", id);
  }, []);

  return { comments, loading, add, remove, update, refetch: load };
}

/** Lightweight hook to fetch counts for many targets in a single round-trip. */
export function useCommentCounts(targetType: "swimmer" | "lesson_request", targetKeys: string[]) {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    if (targetKeys.length === 0) {
      setCounts({});
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("internal_comments")
        .select("target_key")
        .eq("target_type", targetType)
        .in("target_key", targetKeys);
      if (cancelled) return;
      const map: Record<string, number> = {};
      (data || []).forEach((row: any) => {
        map[row.target_key] = (map[row.target_key] || 0) + 1;
      });
      setCounts(map);
    })();

    const channel = supabase
      .channel(`comment-counts-${targetType}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "internal_comments" },
        async () => {
          const { data } = await supabase
            .from("internal_comments")
            .select("target_key")
            .eq("target_type", targetType)
            .in("target_key", targetKeys);
          if (cancelled) return;
          const map: Record<string, number> = {};
          (data || []).forEach((row: any) => {
            map[row.target_key] = (map[row.target_key] || 0) + 1;
          });
          setCounts(map);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [targetType, targetKeys.join("|")]);

  return counts;
}

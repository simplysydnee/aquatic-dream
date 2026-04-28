import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Trash2, Send } from "lucide-react";
import { useInternalComments } from "@/hooks/useInternalComments";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

interface Props {
  targetType: "swimmer" | "lesson_request";
  targetKey: string | null;
  title?: string;
  emptyHint?: string;
}

export default function InternalCommentsPanel({
  targetType,
  targetKey,
  title = "Internal Notes",
  emptyHint = "No notes yet. Add the first one below.",
}: Props) {
  const { comments, loading, add, remove } = useInternalComments(targetType, targetKey);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const handleAdd = async () => {
    if (!body.trim()) return;
    setSubmitting(true);
    await add(body);
    setBody("");
    setSubmitting(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">{title}</h3>
        {comments.length > 0 && (
          <span className="text-xs text-muted-foreground">({comments.length})</span>
        )}
      </div>

      <div className="space-y-2">
        {loading && <div className="text-xs text-muted-foreground">Loading…</div>}
        {!loading && comments.length === 0 && (
          <p className="text-xs text-muted-foreground italic">{emptyHint}</p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="rounded-md border bg-muted/30 p-2.5 text-sm">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="text-xs font-semibold text-foreground">{c.author_name}</div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">
                  {new Date(c.created_at).toLocaleString()}
                </span>
                {c.author_id === currentUserId && (
                  <button
                    onClick={() => remove(c.id)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Delete note"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div className="whitespace-pre-wrap text-foreground">{c.body}</div>
          </div>
        ))}
      </div>

      <div className="space-y-2 pt-2 border-t">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add an internal note (e.g. 'Left voicemail Tues 2pm')…"
          rows={2}
          className="text-sm"
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={handleAdd} disabled={submitting || !body.trim()}>
            <Send className="h-3.5 w-3.5 mr-1.5" />
            {submitting ? "Saving…" : "Add Note"}
          </Button>
        </div>
      </div>
    </div>
  );
}

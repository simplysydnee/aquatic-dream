import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import type { StaffSession, StaffSkillCommentRow } from "./staffTypes";

const VISIBLE_LIMIT = 3;

const formatCommentDate = (iso: string): string =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));

interface Props {
  swimmerId: string;
  skillId: string;
  occurrenceId: string | null;
  session: StaffSession;
  comments: StaffSkillCommentRow[];
  expanded: boolean;
  onToggle: () => void;
  onCommentAdded: (comment: StaffSkillCommentRow) => void;
}

/** Internal-only comment thread for a single skill. Append only, no audience control. */
export function StaffSkillCommentThread({
  swimmerId,
  skillId,
  occurrenceId,
  session,
  comments,
  expanded,
  onToggle,
  onCommentAdded,
}: Props) {
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const count = comments.length;
  const visible = showAll ? comments : comments.slice(0, VISIBLE_LIMIT);

  const save = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSaving(true);
    const { data, error } = await supabase.rpc("staff_add_skill_comment", {
      p_swimmer_id: swimmerId,
      p_skill_id: skillId,
      p_body: trimmed,
      p_instructor_id: session.instructorId,
      p_occurrence_id: occurrenceId,
    });
    setSaving(false);
    if (error) {
      // Keep the typed text so nothing is lost to a wifi blip.
      toast({ title: "Comment not saved", description: error.message, variant: "destructive" });
      return;
    }
    const row = (data as StaffSkillCommentRow[] | null)?.[0];
    if (row) onCommentAdded(row);
    setBody("");
  };

  return (
    <div className="mt-3 border-t border-border pt-2">
      <button
        type="button"
        onClick={onToggle}
        className="text-sm font-medium text-muted-foreground underline underline-offset-4"
      >
        {count > 0 ? `${count} comment${count === 1 ? "" : "s"}` : "Add comment"}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {visible.map((c) => (
            <div key={c.note_id} className="rounded-lg bg-muted/60 p-3">
              <p className="whitespace-pre-wrap text-base">{c.body}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {c.instructor_first_name ?? "Staff"} · {formatCommentDate(c.created_at)}
              </p>
            </div>
          ))}
          {!showAll && count > VISIBLE_LIMIT && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="text-sm font-medium text-primary underline underline-offset-4"
            >
              Show all {count}
            </button>
          )}

          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="What is happening with this skill?"
            className="text-base"
          />
          <Button className="h-11 px-5 text-base" disabled={saving || !body.trim()} onClick={() => void save()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </div>
      )}
    </div>
  );
}

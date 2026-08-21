import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { LEVEL_GROUP_NAMES, type SwimLevel } from "@/components/swim-enrollment/types";
import { PARENT_NOTE_MAX, type StaffNoteRow, type StaffSession } from "./staffTypes";

interface Props {
  swimmerId: string;
  occurrenceId: string | null;
  session: StaffSession;
  notes: StaffNoteRow[];
  onNoteSaved: (note: StaffNoteRow) => void;
}

const formatNoteDate = (iso: string): string =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));

/**
 * Two note composers plus the note history.
 *
 * Internal notes are staff-only: this component renders inside /staff, which is
 * gated by can_use_staff_mode plus a PIN, and staff_swimmer_notes is a staff-only
 * RPC. The Phase 5 parent chart must NOT reuse this component or that RPC.
 */
export function StaffSwimmerNotes({ swimmerId, occurrenceId, session, notes, onNoteSaved }: Props) {
  const { toast } = useToast();
  const [internalBody, setInternalBody] = useState("");
  const [parentBody, setParentBody] = useState("");
  const [savingAudience, setSavingAudience] = useState<"internal" | "parent" | null>(null);

  const internalNotes = useMemo(() => notes.filter((n) => n.audience === "internal"), [notes]);
  const parentNotesByLevel = useMemo(() => {
    const groups = new Map<string, StaffNoteRow[]>();
    notes
      .filter((n) => n.audience === "parent")
      .forEach((n) => {
        const key = n.swim_level ?? "unassigned";
        const list = groups.get(key) ?? [];
        list.push(n);
        groups.set(key, list);
      });
    return Array.from(groups.entries());
  }, [notes]);

  const save = async (audience: "internal" | "parent") => {
    const body = (audience === "internal" ? internalBody : parentBody).trim();
    if (!body) {
      toast({ title: "Write something first", description: "An empty note cannot be saved.", variant: "destructive" });
      return;
    }
    setSavingAudience(audience);
    const { data, error } = await supabase.rpc("staff_save_note", {
      p_swimmer_id: swimmerId,
      p_audience: audience,
      p_body: body,
      p_instructor_id: session.instructorId,
      p_occurrence_id: occurrenceId ?? undefined,
    });
    setSavingAudience(null);
    if (error) {
      toast({ title: "Note not saved", description: error.message, variant: "destructive" });
      return;
    }
    const saved = (data as StaffNoteRow[] | null)?.[0];
    if (saved) onNoteSaved(saved);
    if (audience === "internal") setInternalBody("");
    else setParentBody("");
    toast({ title: audience === "internal" ? "Lesson note saved" : "Note to parent saved" });
  };

  const remaining = PARENT_NOTE_MAX - parentBody.length;

  return (
    <div className="mt-6 space-y-5">
      <Card className="p-5">
        <Label htmlFor="internal-note" className="text-lg font-semibold">
          Lesson notes (internal)
        </Label>
        <p className="mt-1 text-sm text-muted-foreground">Staff only. Never sent to families.</p>
        <Textarea
          id="internal-note"
          value={internalBody}
          onChange={(e) => setInternalBody(e.target.value)}
          rows={3}
          className="mt-3 text-base"
          placeholder="What happened in the water today"
        />
        <Button
          className="mt-3 h-12 px-6 text-base"
          onClick={() => void save("internal")}
          disabled={savingAudience !== null || internalBody.trim().length === 0}
        >
          {savingAudience === "internal" ? "Saving…" : "Save lesson note"}
        </Button>
      </Card>

      <Card className="p-5">
        <Label htmlFor="parent-note" className="text-lg font-semibold">
          Note to parent (optional)
        </Label>
        <p className="mt-1 text-sm text-muted-foreground">Short and encouraging. Saves now, sends later.</p>
        <Textarea
          id="parent-note"
          value={parentBody}
          maxLength={PARENT_NOTE_MAX}
          onChange={(e) => setParentBody(e.target.value.slice(0, PARENT_NOTE_MAX))}
          rows={3}
          className="mt-3 text-base"
          placeholder="Great job floating on her back today"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className={remaining <= 20 ? "text-sm font-medium text-destructive" : "text-sm text-muted-foreground"}>
            {remaining} characters left
          </span>
          <Button
            className="h-12 px-6 text-base"
            onClick={() => void save("parent")}
            disabled={savingAudience !== null || parentBody.trim().length === 0}
          >
            {savingAudience === "parent" ? "Saving…" : "Save note to parent"}
          </Button>
        </div>
      </Card>

      {internalNotes.length > 0 && (
        <Card className="p-5">
          <h3 className="text-lg font-semibold">Lesson note history (internal)</h3>
          <ul className="mt-3 space-y-3">
            {internalNotes.map((note) => (
              <li key={note.note_id} className="rounded-lg border border-border p-3">
                <p className="text-base">{note.body}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {note.instructor_first_name ?? "Staff"} · {formatNoteDate(note.created_at)}
                  {note.swim_level ? ` · ${LEVEL_GROUP_NAMES[note.swim_level as SwimLevel] ?? note.swim_level}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {parentNotesByLevel.length > 0 && (
        <Card className="p-5">
          <h3 className="text-lg font-semibold">Notes to parent</h3>
          <div className="mt-3 space-y-4">
            {parentNotesByLevel.map(([level, list]) => (
              <div key={level}>
                <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {LEVEL_GROUP_NAMES[level as SwimLevel] ?? "No level set"}
                </p>
                <ul className="mt-2 space-y-3">
                  {list.map((note) => (
                    <li key={note.note_id} className="rounded-lg border border-border p-3">
                      <p className="text-base">{note.body}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {note.instructor_first_name ?? "Staff"} · {formatNoteDate(note.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

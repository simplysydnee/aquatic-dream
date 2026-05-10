import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export type CancelTargetKind = "session_date" | "lesson_occurrence" | "pool_event";

/**
 * A unified target for cancellation. The dialog handles all three kinds
 * the same way: mark cancelled, optionally credit each affected swimmer,
 * optionally email the parent.
 */
export interface CancelTarget {
  kind: CancelTargetKind;
  /** The id of the row to flag (session_lesson_dates.id, lesson_booking_occurrences.id, or pool_events.id) */
  id: string;
  /** Display title for the dialog list */
  title: string;
  /** ISO date (yyyy-MM-dd) of the lesson */
  date: string;
  /** Time label, e.g. "3:00 PM – 3:30 PM" */
  timeLabel?: string;
  /** Affected swimmers (one row per credit / email) */
  swimmers: Array<{
    parentName: string;
    parentEmail: string;
    childName: string;
    /** Amount paid for this single occurrence, in dollars. 0 = no credit will be issued. */
    paidAmount: number;
  }>;
  /** Pre-computed extras needed for emailing */
  meta?: Record<string, any>;
}

export interface CancelInput {
  targets: CancelTarget[];
  reason: string;
  reasonNote?: string;
  notifyCustomers: boolean;
}

export async function performCancellation({
  targets,
  reason,
  reasonNote,
  notifyCustomers,
}: CancelInput) {
  const userRes = await supabase.auth.getUser();
  const userId = userRes.data.user?.id ?? null;
  const fullReason = reasonNote?.trim() ? `${reason}: ${reasonNote.trim()}` : reason;
  const cancelledAt = new Date().toISOString();

  const groupedByKind: Record<CancelTargetKind, string[]> = {
    session_date: [],
    lesson_occurrence: [],
    pool_event: [],
  };
  for (const t of targets) groupedByKind[t.kind].push(t.id);

  // Mark cancelled
  if (groupedByKind.session_date.length) {
    await supabase
      .from("session_lesson_dates")
      .update({
        is_cancelled: true,
        cancel_reason: fullReason,
        cancelled_at: cancelledAt,
        cancelled_by: userId,
      })
      .in("id", groupedByKind.session_date);
  }
  if (groupedByKind.lesson_occurrence.length) {
    await supabase
      .from("lesson_booking_occurrences")
      .update({
        status: "cancelled",
        cancel_reason: fullReason,
        cancelled_at: cancelledAt,
        cancelled_by: userId,
      })
      .in("id", groupedByKind.lesson_occurrence);
  }
  // pool_events stay as records; we only mark the linked occurrence above.
  // (Deleting them would lose history.) Owner can still delete from edit.

  // Issue account credits for any swimmer with a paid amount
  const creditRows: any[] = [];
  for (const t of targets) {
    for (const s of t.swimmers) {
      if (s.paidAmount > 0) {
        creditRows.push({
          parent_email: s.parentEmail.toLowerCase(),
          amount_cents: Math.round(s.paidAmount * 100),
          source:
            t.kind === "session_date"
              ? "session_cancel"
              : "lesson_cancel",
          source_ref: t.id,
          note: `${t.title} on ${t.date} — ${fullReason}`,
          created_by: userId,
        });
      }
    }
  }
  if (creditRows.length) {
    await supabase.from("client_credits").insert(creditRows);
  }

  // Send emails
  if (notifyCustomers) {
    const sends: Promise<any>[] = [];
    for (const t of targets) {
      const lessonDate = (() => {
        try {
          return format(new Date(t.date + "T00:00:00"), "EEEE, MMM d");
        } catch {
          return t.date;
        }
      })();
      // Dedupe by parent email per target to avoid sending twice
      const seen = new Set<string>();
      for (const s of t.swimmers) {
        const key = s.parentEmail.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        // Sum credit across this parent for this target (private = 1 row, but be safe)
        const credit = t.swimmers
          .filter((x) => x.parentEmail.toLowerCase() === key)
          .reduce((a, x) => a + x.paidAmount, 0);
        sends.push(
          supabase.functions.invoke("send-transactional-email", {
            body: {
              templateName: "lesson-cancellation",
              recipientEmail: s.parentEmail,
              idempotencyKey: `cancel-${t.kind}-${t.id}-${key}`,
              templateData: {
                parentName: s.parentName,
                childName: s.childName,
                lessonDate,
                lessonTime: t.timeLabel,
                reason: fullReason,
                action: "cancelled",
                creditAmount: credit > 0 ? `$${credit.toFixed(2)}` : undefined,
              },
            },
          })
        );
      }
    }
    await Promise.allSettled(sends);
  }
}

export interface ReassignInput {
  /** session_lesson_dates rows to override */
  sessionDateIds: string[];
  /** pool_events rows to overwrite instructor_name on */
  poolEventIds: string[];
  newInstructorId: string | null;
  newInstructorName: string;
  notifyCustomers: boolean;
  /** For email: { id -> { date, timeLabel, swimmer: { parentName, parentEmail, childName } } } */
  notifyMeta?: Record<
    string,
    {
      date: string;
      timeLabel?: string;
      swimmer: { parentName: string; parentEmail: string; childName: string };
    }
  >;
}

export async function performReassign({
  sessionDateIds,
  poolEventIds,
  newInstructorId,
  newInstructorName,
  notifyCustomers,
  notifyMeta,
}: ReassignInput) {
  if (sessionDateIds.length) {
    await supabase
      .from("session_lesson_dates")
      .update({ instructor_override_id: newInstructorId })
      .in("id", sessionDateIds);
  }
  if (poolEventIds.length) {
    await supabase
      .from("pool_events")
      .update({ instructor_name: newInstructorName })
      .in("id", poolEventIds);
  }

  if (notifyCustomers && notifyMeta) {
    const sends: Promise<any>[] = [];
    for (const id of [...sessionDateIds, ...poolEventIds]) {
      const m = notifyMeta[id];
      if (!m) continue;
      const lessonDate = (() => {
        try {
          return format(new Date(m.date + "T00:00:00"), "EEEE, MMM d");
        } catch {
          return m.date;
        }
      })();
      sends.push(
        supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "lesson-cancellation",
            recipientEmail: m.swimmer.parentEmail,
            idempotencyKey: `reassign-${id}-${m.swimmer.parentEmail.toLowerCase()}`,
            templateData: {
              parentName: m.swimmer.parentName,
              childName: m.swimmer.childName,
              lessonDate,
              lessonTime: m.timeLabel,
              action: "reassigned",
              newInstructorName,
            },
          },
        })
      );
    }
    await Promise.allSettled(sends);
  }
}

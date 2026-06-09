import { supabase } from "@/integrations/supabase/client";

const PER_LESSON_RATE = 30;
const DEFAULT_FULL_SESSION = 240;
const TOTAL_LESSONS = 8;

export interface RemainingLessonsInfo {
  remaining: number;
  total: number;
  perLessonRate: number;
  suggestedDollars: number;
  fullSessionDollars: number;
  isProrated: boolean;
}

/**
 * Counts non-cancelled session_lesson_dates with lesson_date >= today
 * (server-side date — comparison happens on the DB).
 * Suggested charge = remaining * $30, floored at 1 lesson ($30 min) so
 * we never send a $0 payment link. If we get back the full count (or
 * more), we fall back to swim_sessions.session_price.
 */
export async function getSessionRemainingLessons(
  sessionId: string,
): Promise<RemainingLessonsInfo> {
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: dates }, { data: session }] = await Promise.all([
    supabase
      .from("session_lesson_dates")
      .select("lesson_date, is_cancelled")
      .eq("session_id", sessionId)
      .eq("is_cancelled", false)
      .gte("lesson_date", today),
    supabase
      .from("swim_sessions")
      .select("session_price")
      .eq("id", sessionId)
      .maybeSingle(),
  ]);

  const fullSessionDollars = Number(session?.session_price) || DEFAULT_FULL_SESSION;
  const remaining = (dates ?? []).length;
  const total = TOTAL_LESSONS;

  // If we couldn't read dates, suggest the full session price.
  if (!dates || remaining === 0) {
    return {
      remaining,
      total,
      perLessonRate: PER_LESSON_RATE,
      suggestedDollars: fullSessionDollars,
      fullSessionDollars,
      isProrated: false,
    };
  }

  const prorated = Math.max(remaining, 1) * PER_LESSON_RATE;
  // Cap suggestion at full session price — never charge more than $240 prorated.
  const suggestedDollars = Math.min(prorated, fullSessionDollars);
  const isProrated = suggestedDollars < fullSessionDollars;

  return {
    remaining,
    total,
    perLessonRate: PER_LESSON_RATE,
    suggestedDollars,
    fullSessionDollars,
    isProrated,
  };
}

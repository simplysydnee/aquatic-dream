import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

/**
 * Public parent chart data. The share_token is the credential; there is no login.
 * Every column is hand-picked. Internal notes are excluded in the SERVER query
 * (audience = 'parent'), never client side.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Instructors are stored with a single full name; parents only ever see the first word. */
const firstNameOf = (full: string | null | undefined): string | null => {
  if (!full) return null;
  const first = full.trim().split(/\s+/)[0];
  return first || null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NEUTRAL_404 = { error: "This progress chart is not available." };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    // Same neutral response for malformed and unknown tokens.
    if (!UUID_RE.test(token)) return json(NEUTRAL_404, 404);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const { data: swimmer, error: swimmerError } = await supabase
      .from("swimmers")
      .select("id, first_name, current_level, is_active")
      .eq("share_token", token)
      .maybeSingle();

    if (swimmerError) return json({ error: "Unable to load this chart right now." }, 500);
    if (!swimmer) return json(NEUTRAL_404, 404);

    const swimmerId = swimmer.id as string;

    const [defsRes, skillsRes, notesRes, historyRes] = await Promise.all([
      supabase
        .from("skill_definitions")
        .select("id, swim_level, position, kind, name, success_goal")
        .eq("is_active", true)
        .order("swim_level", { ascending: true })
        .order("position", { ascending: true }),
      supabase
        .from("swimmer_skills")
        .select("skill_definition_id, state, met_at, met_by")
        .eq("swimmer_id", swimmerId),
      // audience = 'parent' is enforced HERE, in the server query. Internal notes
      // never enter the response payload.
      supabase
        .from("lesson_notes")
        .select("id, body, swim_level, instructor_id, created_at")
        .eq("swimmer_id", swimmerId)
        .eq("audience", "parent")
        .order("created_at", { ascending: false }),
      supabase
        .from("swimmer_level_history")
        .select("from_level, to_level, reason, created_at")
        .eq("swimmer_id", swimmerId)
        .order("created_at", { ascending: true }),
    ]);

    if (defsRes.error || skillsRes.error || notesRes.error || historyRes.error) {
      return json({ error: "Unable to load this chart right now." }, 500);
    }

    // Resolve instructor FIRST names only, for the ids actually referenced.
    const instructorIds = new Set<string>();
    for (const s of skillsRes.data ?? []) if (s.met_by) instructorIds.add(s.met_by as string);
    for (const n of notesRes.data ?? []) if (n.instructor_id) instructorIds.add(n.instructor_id as string);

    const firstNames = new Map<string, string | null>();
    if (instructorIds.size > 0) {
      const { data: instructors } = await supabase
        .from("instructors")
        .select("id, name")
        .in("id", [...instructorIds]);
      for (const i of instructors ?? []) firstNames.set(i.id as string, firstNameOf(i.name as string));
    }

    const stateById = new Map(
      (skillsRes.data ?? []).map((s) => [s.skill_definition_id as string, s]),
    );

    const skills = (defsRes.data ?? []).map((d) => {
      const s = stateById.get(d.id as string);
      const mastered = s?.state === "met";
      return {
        skill_id: d.id,
        swim_level: d.swim_level,
        position: d.position,
        kind: d.kind,
        name: d.name,
        success_goal: d.success_goal,
        // Parents see mastered or still-working-on. 'emerging' is not surfaced.
        mastered,
        met_at: mastered ? s?.met_at ?? null : null,
        met_by_first_name: mastered ? firstNames.get((s?.met_by as string) ?? "") ?? null : null,
      };
    });

    const notes = (notesRes.data ?? []).map((n) => ({
      note_id: n.id,
      body: n.body,
      swim_level: n.swim_level,
      instructor_first_name: firstNames.get((n.instructor_id as string) ?? "") ?? null,
      created_at: n.created_at,
    }));

    const level_history = (historyRes.data ?? []).map((h) => ({
      from_level: h.from_level,
      to_level: h.to_level,
      reason: h.reason,
      created_at: h.created_at,
    }));

    return json({
      swimmer: {
        first_name: swimmer.first_name,
        current_level: swimmer.current_level,
        is_active: swimmer.is_active,
      },
      skills,
      notes,
      level_history,
    });
  } catch {
    return json({ error: "Unable to load this chart right now." }, 500);
  }
});

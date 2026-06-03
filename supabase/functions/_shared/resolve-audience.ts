// Shared audience resolver for marketing campaigns.
// Imported by send-marketing-campaign and preview-marketing-campaign.

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export interface Recipient {
  id: string | null;
  email: string;
  first_name: string | null;
}

export async function resolveAudience(
  supabase: SupabaseClient,
  audience: any,
): Promise<Recipient[]> {
  const tags: string[] = audience?.tags ?? [];
  const sources: string[] = audience?.sources ?? [];
  const sessionPeriodIds: string[] = audience?.session_period_ids ?? [];
  const swimSessionIds: string[] = audience?.swim_session_ids ?? [];
  const swimLevels: string[] = (audience?.swim_levels ?? []).map((s: string) => String(s).toLowerCase());
  const lessonInterests: string[] = audience?.lesson_interests ?? [];
  const lessonInterestAge: string = audience?.lesson_interest_age ?? "all";

  const hasEnrollmentFilter = sessionPeriodIds.length > 0 || swimSessionIds.length > 0 || swimLevels.length > 0;
  const hasLessonFilter = lessonInterests.length > 0;
  const hasContactFilter = tags.length > 0 || sources.length > 0;
  const includeAll = audience?.include_all !== false && !hasEnrollmentFilter && !hasLessonFilter && !hasContactFilter;

  const byEmail = new Map<string, Recipient>();
  const add = (email: string | null | undefined, first_name: string | null, id: string | null = null) => {
    if (!email) return;
    const key = String(email).trim().toLowerCase();
    if (!key) return;
    const cur = byEmail.get(key);
    if (!cur) byEmail.set(key, { id, email: key, first_name });
    else if (!cur.id && id) cur.id = id;
  };

  // Load all marketing_contacts (paged) — for unsubscribe state and id lookup.
  const PAGE = 1000;
  const allContacts: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("marketing_contacts")
      .select("id, email, first_name, tags, source, subscribed")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data || [];
    allContacts.push(...rows);
    if (rows.length < PAGE) break;
  }
  const unsubscribed = new Set(
    allContacts.filter((r: any) => r.subscribed === false).map((r: any) => String(r.email).toLowerCase()),
  );
  const contactByEmail = new Map<string, any>();
  allContacts.forEach((r: any) => contactByEmail.set(String(r.email).toLowerCase(), r));

  if (includeAll) {
    allContacts.filter((r: any) => r.subscribed !== false).forEach((r: any) => add(r.email, r.first_name, r.id));
  } else if (hasContactFilter) {
    allContacts.filter((r: any) => {
      if (r.subscribed === false) return false;
      if (sources.length && sources.includes(r.source)) return true;
      if (tags.length && (r.tags || []).some((t: string) => tags.includes(t))) return true;
      return false;
    }).forEach((r: any) => add(r.email, r.first_name, r.id));
  }

  if (hasEnrollmentFilter) {
    let q = supabase
      .from("swim_enrollments")
      .select("parent_email, parent_first_name, parent_name, swim_level, session_id, status, swim_sessions(session_period_id)")
      .in("status", ["pending", "confirmed", "enrolled", "pending_payment"]);
    if (swimSessionIds.length) q = q.in("session_id", swimSessionIds);
    if (swimLevels.length) q = q.in("swim_level", swimLevels);
    const { data, error } = await q;
    if (error) throw error;
    (data || []).forEach((r: any) => {
      if (sessionPeriodIds.length) {
        const pid = r.swim_sessions?.session_period_id;
        if (!pid || !sessionPeriodIds.includes(pid)) return;
      }
      const first = r.parent_first_name || (r.parent_name ? String(r.parent_name).split(" ")[0] : null);
      add(r.parent_email, first);
    });
  }

  if (hasLessonFilter) {
    let q = supabase
      .from("lesson_requests")
      .select("parent_email, parent_first_name, parent_name, lesson_type, is_adult_swimmer, child_age");
    const types = lessonInterests.filter((t) => t !== "adult");
    const wantsAdult = lessonInterests.includes("adult");
    const orParts: string[] = [];
    if (types.length) orParts.push(`lesson_type.in.(${types.map((t) => `"${t}"`).join(",")})`);
    if (wantsAdult) orParts.push(`is_adult_swimmer.eq.true`);
    if (orParts.length) q = q.or(orParts.join(","));
    const { data, error } = await q;
    if (error) throw error;
    (data || []).forEach((r: any) => {
      if (lessonInterestAge === "u14" && (r.child_age == null || r.child_age >= 14)) return;
      if (lessonInterestAge === "14plus" && (r.child_age == null || r.child_age < 14)) return;
      const first = r.parent_first_name || (r.parent_name ? String(r.parent_name).split(" ")[0] : null);
      add(r.parent_email, first);
    });
  }

  const out: Recipient[] = [];
  for (const [email, rec] of byEmail) {
    if (unsubscribed.has(email)) continue;
    const c = contactByEmail.get(email);
    out.push({ id: rec.id ?? c?.id ?? null, email, first_name: rec.first_name ?? c?.first_name ?? null });
  }
  console.log(`resolveAudience: ${out.length} recipients (contacts=${allContacts.length}, includeAll=${includeAll}, enroll=${hasEnrollmentFilter}, lesson=${hasLessonFilter})`);
  return out;
}

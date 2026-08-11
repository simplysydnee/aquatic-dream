// Fall 2026 re-engagement announcement.
// Builds the one-time outreach list. Pure data assembly, sends nothing.
// Used by build-fall2026-outreach (report) and send-fall2026-outreach (send).

export const FALL2026_LINK = "https://aquaticdreamsswim.com/join?src=fall2026";
export const FALL2026_KIND = "fall2026_outreach";

export type Segment = "PREVIOUS" | "INQUIRY";

export interface Recipient {
  phone: string;
  segment: Segment;
  parentFirstName: string;
  childNames: string[];
  message: string;
  parentEmail: string | null;
}

export interface ExcludedFamily {
  reason: "no_phone" | "unusable_name";
  program: "previous" | "inquiry";
  parentName: string;
  parentEmail: string | null;
  childNames: string[];
  detail: string;
}

export interface OutreachList {
  recipients: Recipient[];
  excluded: ExcludedFamily[];
  counts: { PREVIOUS: number; INQUIRY: number; total: number };
  excludedMemberPhones: number;
  excludedActiveEnrollmentPhones: number;
}

const JUNK_NAME = /(^|\b)(test|kid|kids|child|swimmer|na|n\/a|none|unknown|tbd|doubleev\w*)(\b|$)/i;

export const phoneKey = (raw: string | null | undefined): string | null => {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
};

const clean = (raw: string | null | undefined): string => (raw ?? "").replace(/\s+/g, " ").trim();

/** First whitespace token of a cleaned name, so "Julia Tejeda" renders "Julia". */
export const firstToken = (raw: string | null | undefined): string => {
  const c = clean(raw);
  if (!c) return "";
  return c.split(" ")[0];
};

export const isUsableName = (name: string): boolean => {
  const c = clean(name);
  if (c.length < 2) return false;
  if (/\d/.test(c)) return false;
  if (JUNK_NAME.test(c)) return false;
  return true;
};

export const renderMessage = (segment: Segment, parentFirst: string): string =>
  segment === "PREVIOUS"
    ? `Hi ${parentFirst}! Fall lessons are here at Aquatic Dreams, come join us. Weekly spots are limited: ${FALL2026_LINK}`
    : `Hi ${parentFirst}! Fall swim lessons are open at Aquatic Dreams. See openings and enroll: ${FALL2026_LINK}`;

type SourceKind = "enrollment" | "booking" | "request";

interface SourceRow {
  src: SourceKind;
  phone: string | null;
  parentName: string;
  parentEmail: string | null;
  childFirst: string;
  childKey: string;
}

interface Bucket {
  sources: Set<SourceKind>;
  parentNames: string[];
  parentEmail: string | null;
  kids: Map<string, string>;
}

// deno-lint-ignore no-explicit-any
export async function buildFall2026List(admin: any): Promise<OutreachList> {
  const rows: SourceRow[] = [];

  const { data: enrollments } = await admin
    .from("swim_enrollments")
    .select(
      "parent_phone, parent_name, parent_first_name, parent_email, child_name, child_first_name, child_last_name, status",
    )
    .neq("status", "cancelled");
  for (const e of enrollments ?? []) {
    const childFirst = firstToken(e.child_first_name || e.child_name);
    rows.push({
      src: "enrollment",
      phone: e.parent_phone,
      parentName: clean(e.parent_first_name || e.parent_name),
      parentEmail: e.parent_email ?? null,
      childFirst,
      childKey: `${childFirst} ${clean(e.child_last_name)}`.trim().toLowerCase(),
    });
  }

  const { data: bookings } = await admin
    .from("lesson_bookings")
    .select("parent_phone, parent_name, parent_email, child_name, lesson_type, status")
    .in("lesson_type", ["private", "semi-private"])
    .not("status", "in", "(cancelled,abandoned)");
  for (const b of bookings ?? []) {
    const childFirst = firstToken(b.child_name);
    rows.push({
      src: "booking",
      phone: b.parent_phone,
      parentName: clean(b.parent_name),
      parentEmail: b.parent_email ?? null,
      childFirst,
      childKey: clean(b.child_name).toLowerCase() || childFirst.toLowerCase(),
    });
  }

  const { data: requests } = await admin
    .from("lesson_requests")
    .select(
      "parent_phone, parent_name, parent_first_name, parent_last_name, parent_email, child_name, child_first_name, child_last_name",
    );
  for (const r of requests ?? []) {
    const childFirst = firstToken(r.child_first_name || r.child_name);
    rows.push({
      src: "request",
      phone: r.parent_phone,
      parentName: clean(r.parent_first_name || r.parent_name),
      parentEmail: r.parent_email ?? null,
      childFirst,
      childKey:
        `${childFirst} ${clean(r.child_last_name)}`.trim().toLowerCase() ||
        clean(r.child_name).toLowerCase(),
    });
  }

  // Exclusion 1: families already on an active-ish membership.
  const { data: members } = await admin
    .from("memberships")
    .select("parent_phone")
    .in("status", ["active", "pending_cancel", "paused"]);
  const memberPhones = new Set<string>();
  for (const m of members ?? []) {
    const k = phoneKey(m.parent_phone);
    if (k) memberPhones.add(k);
  }

  // Exclusion 2: families mid-session right now under the old session system.
  const today = new Date().toISOString().slice(0, 10);
  const { data: activeEnrollments } = await admin
    .from("swim_enrollments")
    .select("parent_phone, status, swim_sessions!inner(session_end_date)")
    .eq("status", "confirmed")
    .gte("swim_sessions.session_end_date", today);
  const activeEnrollmentPhones = new Set<string>();
  for (const e of activeEnrollments ?? []) {
    const k = phoneKey(e.parent_phone);
    if (k) activeEnrollmentPhones.add(k);
  }

  const byPhone = new Map<string, Bucket>();
  const byEmailNoPhone = new Map<string, Bucket>();
  const emailsWithPhone = new Set<string>();

  for (const r of rows) {
    if (phoneKey(r.phone) && r.parentEmail) emailsWithPhone.add(r.parentEmail.toLowerCase());
  }

  const put = (map: Map<string, Bucket>, key: string, r: SourceRow) => {
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { sources: new Set(), parentNames: [], parentEmail: r.parentEmail, kids: new Map() };
      map.set(key, bucket);
    }
    bucket.sources.add(r.src);
    if (r.parentName) bucket.parentNames.push(r.parentName);
    if (!bucket.parentEmail && r.parentEmail) bucket.parentEmail = r.parentEmail;
    if (r.childKey && r.childFirst && !bucket.kids.has(r.childKey)) {
      bucket.kids.set(r.childKey, r.childFirst);
    }
  };

  for (const r of rows) {
    const key = phoneKey(r.phone);
    if (key) {
      put(byPhone, key, r);
      continue;
    }
    const email = (r.parentEmail || "").toLowerCase();
    // A family reachable by phone on any other row is not a no-phone family.
    if (email && emailsWithPhone.has(email)) continue;
    put(byEmailNoPhone, email || `unknown:${r.parentName.toLowerCase()}`, r);
  }

  const recipients: Recipient[] = [];
  const excluded: ExcludedFamily[] = [];

  // Real history beats inquiry history.
  const segmentOf = (sources: Set<SourceKind>): Segment =>
    sources.has("enrollment") || sources.has("booking") ? "PREVIOUS" : "INQUIRY";

  for (const [phone, bucket] of byPhone) {
    if (memberPhones.has(phone)) continue;
    if (activeEnrollmentPhones.has(phone)) continue;

    const segment = segmentOf(bucket.sources);
    const program = segment === "PREVIOUS" ? "previous" : "inquiry";
    const parentRaw =
      bucket.parentNames.find((n) => isUsableName(firstToken(n))) ?? bucket.parentNames[0] ?? "";
    const parentFirst = firstToken(parentRaw);
    const kidNames = Array.from(bucket.kids.values()).filter((n) => isUsableName(n));
    const distinctKids = Array.from(
      new Map(kidNames.map((n) => [n.toLowerCase(), n])).values(),
    ).filter((n) => n.toLowerCase() !== parentFirst.toLowerCase());

    if (!isUsableName(parentFirst) || distinctKids.length === 0) {
      excluded.push({
        reason: "unusable_name",
        program,
        parentName: parentRaw || "(no name on file)",
        parentEmail: bucket.parentEmail,
        childNames: Array.from(bucket.kids.values()),
        detail: !isUsableName(parentFirst)
          ? "parent first name missing or unusable"
          : "no usable child first name distinct from the parent",
      });
      continue;
    }

    recipients.push({
      phone,
      segment,
      parentFirstName: parentFirst,
      childNames: distinctKids,
      parentEmail: bucket.parentEmail,
      message: renderMessage(segment, parentFirst),
    });
  }

  for (const bucket of byEmailNoPhone.values()) {
    excluded.push({
      reason: "no_phone",
      program: segmentOf(bucket.sources) === "PREVIOUS" ? "previous" : "inquiry",
      parentName: bucket.parentNames[0] || "(no name on file)",
      parentEmail: bucket.parentEmail,
      childNames: Array.from(bucket.kids.values()),
      detail: "no phone number on any row",
    });
  }

  recipients.sort(
    (a, b) => a.segment.localeCompare(b.segment) || a.parentFirstName.localeCompare(b.parentFirstName),
  );

  const counts = {
    PREVIOUS: recipients.filter((r) => r.segment === "PREVIOUS").length,
    INQUIRY: recipients.filter((r) => r.segment === "INQUIRY").length,
    total: recipients.length,
  };

  return {
    recipients,
    excluded,
    counts,
    excludedMemberPhones: memberPhones.size,
    excludedActiveEnrollmentPhones: activeEnrollmentPhones.size,
  };
}

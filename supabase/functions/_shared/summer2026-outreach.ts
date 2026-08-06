// Summer 2026 to fall Swimbership announcement.
// Builds the one-time outreach list. Pure data assembly, sends nothing.
// Used by build-summer2026-outreach (report) and send-summer2026-outreach (send).

export const SUMMER2026_LINK = "https://aquaticdreamsswim.com/join?src=summer2026";
export const SUMMER2026_KIND = "summer2026_outreach";
export const SESSION_START_DATES = ["2026-06-08", "2026-07-13"];

export type Segment = "GROUP" | "PRIVATE" | "BOTH";

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
  program: "group" | "private" | "both";
  parentName: string;
  parentEmail: string | null;
  childNames: string[];
  detail: string;
}

export interface OutreachList {
  recipients: Recipient[];
  excluded: ExcludedFamily[];
  counts: { GROUP: number; PRIVATE: number; BOTH: number; total: number };
  excludedMemberPhones: number;
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

/** "Adrian" / "Adrian and Julian" / "Adrian, Julian, and Kehar" */
export const renderChildList = (names: string[]): string => {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
};

export const renderMessage = (
  segment: Segment,
  parentFirstName: string,
  childNames: string[],
): string => {
  const kids = renderChildList(childNames);
  const intro = `Hi ${parentFirstName}, thank you for swimming with us this summer with ${kids}.`;
  if (segment === "GROUP") {
    return `${intro} We're continuing into fall with monthly Swimberships. Group lessons are now Mondays, $140 a month. Join here: ${SUMMER2026_LINK}`;
  }
  if (segment === "PRIVATE") {
    return `${intro} We're continuing into fall with monthly Swimberships. Private lessons are $200 a month. Join here: ${SUMMER2026_LINK}`;
  }
  return `${intro} We're continuing into fall with monthly Swimberships, private lessons at $200 a month or weekly group lessons, now on Mondays, at $140 a month. Join here: ${SUMMER2026_LINK}`;
};

interface SourceRow {
  src: "group" | "private";
  phone: string | null;
  parentName: string;
  parentEmail: string | null;
  childFirst: string;
  childKey: string;
}

interface Bucket {
  sources: Set<"group" | "private">;
  parentNames: string[];
  parentEmail: string | null;
  kids: Map<string, string>;
}

// deno-lint-ignore no-explicit-any
export async function buildSummer2026List(admin: any): Promise<OutreachList> {
  const { data: sessions } = await admin
    .from("swim_sessions")
    .select("id")
    .in("session_start_date", SESSION_START_DATES);
  const sessionIds: string[] = (sessions ?? []).map((s: { id: string }) => s.id);

  const rows: SourceRow[] = [];

  if (sessionIds.length) {
    const { data: enrollments } = await admin
      .from("swim_enrollments")
      .select(
        "parent_phone, parent_name, parent_first_name, parent_email, child_name, child_first_name, child_last_name, status, session_id",
      )
      .in("session_id", sessionIds)
      .neq("status", "cancelled");
    for (const e of enrollments ?? []) {
      const childFirst = firstToken(e.child_first_name || e.child_name);
      rows.push({
        src: "group",
        phone: e.parent_phone,
        parentName: clean(e.parent_first_name || e.parent_name),
        parentEmail: e.parent_email ?? null,
        childFirst,
        childKey: `${childFirst} ${clean(e.child_last_name)}`.trim().toLowerCase(),
      });
    }
  }

  const { data: bookings } = await admin
    .from("lesson_bookings")
    .select("parent_phone, parent_name, parent_email, child_name, lesson_type, status")
    .in("lesson_type", ["private", "semi-private"])
    .not("status", "in", "(cancelled,abandoned)");
  for (const b of bookings ?? []) {
    const childFirst = firstToken(b.child_name);
    rows.push({
      src: "private",
      phone: b.parent_phone,
      parentName: clean(b.parent_name),
      parentEmail: b.parent_email ?? null,
      childFirst,
      childKey: clean(b.child_name).toLowerCase() || childFirst.toLowerCase(),
    });
  }

  const { data: members } = await admin
    .from("memberships")
    .select("parent_phone")
    .in("status", ["active", "pending_cancel", "paused"]);
  const memberPhones = new Set<string>();
  for (const m of members ?? []) {
    const k = phoneKey(m.parent_phone);
    if (k) memberPhones.add(k);
  }

  const byPhone = new Map<string, Bucket>();
  const byEmailNoPhone = new Map<string, Bucket>();
  const phonesSeen = new Set<string>();
  const emailsWithPhone = new Set<string>();

  for (const r of rows) {
    const key = phoneKey(r.phone);
    if (key) {
      phonesSeen.add(key);
      if (r.parentEmail) emailsWithPhone.add(r.parentEmail.toLowerCase());
    }
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

  const programOf = (sources: Set<"group" | "private">): "group" | "private" | "both" =>
    sources.has("group") && sources.has("private") ? "both" : sources.has("group") ? "group" : "private";

  for (const [phone, bucket] of byPhone) {
    if (memberPhones.has(phone)) continue;

    const program = programOf(bucket.sources);
    const segment: Segment = program === "both" ? "BOTH" : program === "group" ? "GROUP" : "PRIVATE";
    const parentRaw = bucket.parentNames.find((n) => isUsableName(firstToken(n))) ?? bucket.parentNames[0] ?? "";
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
      message: renderMessage(segment, parentFirst, distinctKids),
    });
  }

  for (const bucket of byEmailNoPhone.values()) {
    const program = programOf(bucket.sources);
    excluded.push({
      reason: "no_phone",
      program,
      parentName: bucket.parentNames[0] || "(no name on file)",
      parentEmail: bucket.parentEmail,
      childNames: Array.from(bucket.kids.values()),
      detail: "no phone number on any row",
    });
  }

  recipients.sort((a, b) => a.segment.localeCompare(b.segment) || a.parentFirstName.localeCompare(b.parentFirstName));

  const counts = {
    GROUP: recipients.filter((r) => r.segment === "GROUP").length,
    PRIVATE: recipients.filter((r) => r.segment === "PRIVATE").length,
    BOTH: recipients.filter((r) => r.segment === "BOTH").length,
    total: recipients.length,
  };

  return { recipients, excluded, counts, excludedMemberPhones: memberPhones.size };
}

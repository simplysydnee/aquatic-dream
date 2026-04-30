/**
 * Name display helpers used across the app.
 *
 * The DB has split first_name + last_name columns plus a legacy combined
 * *_name column. New code should prefer the split columns and fall back to
 * the legacy column for old rows where last_name is still NULL.
 */

export const fullName = (
  first?: string | null,
  last?: string | null,
  fallback = "",
): string => {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  const joined = [f, l].filter(Boolean).join(" ");
  return joined || fallback;
};

export const lastFirst = (
  first?: string | null,
  last?: string | null,
  fallback = "",
): string => {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  if (l && f) return `${l}, ${f}`;
  if (l) return l;
  if (f) return f;
  return fallback;
};

/**
 * Pick the best available display name from a record that may have either the
 * new split columns, the legacy combined column, or both.
 */
export const displayName = (record: {
  first?: string | null;
  last?: string | null;
  combined?: string | null;
}): string => {
  const built = fullName(record.first, record.last);
  if (built) return built;
  return (record.combined ?? "").trim();
};

export const displayLastFirst = (record: {
  first?: string | null;
  last?: string | null;
  combined?: string | null;
}): string => {
  const built = lastFirst(record.first, record.last);
  if (built) return built;
  return (record.combined ?? "").trim();
};

/** For sorting by last name, falling back to first name, then combined. */
export const sortKey = (record: {
  first?: string | null;
  last?: string | null;
  combined?: string | null;
}): string => {
  const l = (record.last ?? "").trim().toLowerCase();
  if (l) return `${l} ${(record.first ?? "").trim().toLowerCase()}`;
  const c = (record.combined ?? "").trim().toLowerCase();
  if (c) {
    // Best-effort: sort legacy combined names by their last token.
    const parts = c.split(/\s+/);
    const last = parts.length > 1 ? parts[parts.length - 1] : parts[0];
    return `${last} ${parts.slice(0, -1).join(" ")}`;
  }
  return (record.first ?? "").trim().toLowerCase();
};

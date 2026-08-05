import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type FamilySource = "membership" | "booking" | "enrollment" | "request";

export interface FamilyMatch {
  parent_name: string;
  parent_email: string | null;
  parent_phone: string | null;
  swimmer_name: string;
  child_dob: string | null;
  source: FamilySource;
}

export interface FamilySwimmer {
  swimmer_name: string;
  child_dob: string | null;
  parent_email: string | null;
  source: FamilySource;
}

export interface FamilyGroup {
  parent_name: string;
  parent_phone: string | null;
  parent_email: string | null;
  /** Every distinct lowercased email seen for this family, in first-seen order. */
  parent_emails: string[];
  source: FamilySource;
  swimmers: FamilySwimmer[];
}

export interface UseFamilySearchOptions {
  /** Collapse results to one entry per normalized parent phone. */
  groupByFamily?: boolean;
}

const SOURCE_PRIORITY: Record<FamilySource, number> = {
  membership: 0,
  booking: 1,
  enrollment: 2,
  request: 3,
};

/** Digits only, dropping a leading US country code. */
const normalizePhone = (input?: string | null): string => {
  if (!input) return "";
  const digits = input.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
};

export const groupFamilyMatches = (matches: FamilyMatch[]): FamilyGroup[] => {
  const groups = new Map<string, FamilyGroup>();

  for (const m of matches) {
    const phone = normalizePhone(m.parent_phone);
    const email = (m.parent_email || "").toLowerCase().trim();
    const key = phone || email || m.parent_name.toLowerCase();
    if (!key) continue;

    let group = groups.get(key);
    if (!group) {
      group = {
        parent_name: m.parent_name,
        parent_phone: m.parent_phone,
        parent_email: m.parent_email,
        parent_emails: [],
        source: m.source,
        swimmers: [],
      };
      groups.set(key, group);
    }

    if (email && !group.parent_emails.includes(email)) group.parent_emails.push(email);
    if (!group.parent_phone && m.parent_phone) group.parent_phone = m.parent_phone;
    if (!group.parent_email && m.parent_email) group.parent_email = m.parent_email;
    if (SOURCE_PRIORITY[m.source] < SOURCE_PRIORITY[group.source]) group.source = m.source;

    const swimmerKey = m.swimmer_name.toLowerCase();
    const existingIndex = group.swimmers.findIndex(
      (s) => s.swimmer_name.toLowerCase() === swimmerKey,
    );
    const candidate: FamilySwimmer = {
      swimmer_name: m.swimmer_name,
      child_dob: m.child_dob,
      parent_email: m.parent_email,
      source: m.source,
    };

    if (existingIndex === -1) {
      group.swimmers.push(candidate);
      continue;
    }

    // Keep the entry carrying a DOB; the roster's waiver lookup depends on it.
    // Ties fall back to the source merge order.
    const existing = group.swimmers[existingIndex];
    const existingHasDob = !!existing.child_dob;
    const candidateHasDob = !!candidate.child_dob;
    const replace = candidateHasDob !== existingHasDob
      ? candidateHasDob
      : SOURCE_PRIORITY[candidate.source] < SOURCE_PRIORITY[existing.source];
    if (replace) group.swimmers[existingIndex] = candidate;
  }

  return Array.from(groups.values());
};

/**
 * Searches memberships, private lesson bookings, session enrollments, and
 * lesson requests for a family by phone, name, or email. Phone matches rank
 * first so a caller ID lookup lands at the top.
 */
export function useFamilySearch(query: string, options: UseFamilySearchOptions = {}) {
  const { groupByFamily = false } = options;
  const [results, setResults] = useState<FamilyMatch[]>([]);
  const [families, setFamilies] = useState<FamilyGroup[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setFamilies([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const digits = q.replace(/\D/g, "");
    const like = `%${q}%`;
    const phoneLike = digits.length >= 3 ? `%${digits}%` : null;

    (async () => {
      const [mem, bk, en, rq] = await Promise.all([
        supabase
          .from("memberships")
          .select("parent_first_name,parent_last_name,parent_email,parent_phone,child_first_name,child_last_name,child_dob,created_at")
          .or(
            [
              `parent_email.ilike.${like}`,
              `parent_first_name.ilike.${like}`,
              `parent_last_name.ilike.${like}`,
              `child_first_name.ilike.${like}`,
              `child_last_name.ilike.${like}`,
              `parent_phone.ilike.${like}`,
              ...(phoneLike ? [`parent_phone.ilike.${phoneLike}`] : []),
            ].join(","),
          )
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("lesson_bookings")
          .select("parent_first_name,parent_last_name,parent_name,parent_email,parent_phone,child_first_name,child_last_name,child_name,child_dob,updated_at")
          .or(
            [
              `parent_email.ilike.${like}`,
              `parent_first_name.ilike.${like}`,
              `parent_last_name.ilike.${like}`,
              `parent_name.ilike.${like}`,
              `child_first_name.ilike.${like}`,
              `child_last_name.ilike.${like}`,
              `child_name.ilike.${like}`,
              `parent_phone.ilike.${like}`,
              ...(phoneLike ? [`parent_phone.ilike.${phoneLike}`] : []),
            ].join(","),
          )
          .order("updated_at", { ascending: false })
          .limit(20),
        supabase
          .from("swim_enrollments")
          .select("parent_first_name,parent_last_name,parent_name,parent_email,parent_phone,child_first_name,child_last_name,child_name,child_dob,updated_at")
          .or(
            [
              `parent_email.ilike.${like}`,
              `parent_first_name.ilike.${like}`,
              `parent_last_name.ilike.${like}`,
              `parent_name.ilike.${like}`,
              `child_first_name.ilike.${like}`,
              `child_last_name.ilike.${like}`,
              `child_name.ilike.${like}`,
              `parent_phone.ilike.${like}`,
              ...(phoneLike ? [`parent_phone.ilike.${phoneLike}`] : []),
            ].join(","),
          )
          .order("updated_at", { ascending: false })
          .limit(20),
        supabase
          .from("lesson_requests")
          .select("parent_name,parent_email,parent_phone,child_name,created_at")
          .or(
            [
              `parent_email.ilike.${like}`,
              `parent_name.ilike.${like}`,
              `child_name.ilike.${like}`,
              `parent_phone.ilike.${like}`,
              ...(phoneLike ? [`parent_phone.ilike.${phoneLike}`] : []),
            ].join(","),
          )
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      if (cancelled) return;

      const map = new Map<string, FamilyMatch>();
      const add = (row: Record<string, unknown>, source: FamilySource) => {
        let parentName = "";
        let swimmerName = "";
        if (source === "request") {
          parentName = String(row.parent_name || "").trim();
          swimmerName = String(row.child_name || "").trim();
        } else {
          parentName = `${row.parent_first_name || ""} ${row.parent_last_name || ""}`.trim();
          swimmerName = `${row.child_first_name || ""} ${row.child_last_name || ""}`.trim();
        }
        if (!swimmerName) return;
        const email = String(row.parent_email || "").toLowerCase().trim() || null;
        const phone = (row.parent_phone as string | null) || null;
        const key = `${email || phone || parentName}|${swimmerName.toLowerCase()}`;
        if (map.has(key)) return;
        map.set(key, {
          parent_name: parentName,
          parent_email: email,
          parent_phone: phone,
          swimmer_name: swimmerName,
          child_dob: (row.child_dob as string | null) || null,
          source,
        });
      };
      (mem.data || []).forEach((row) => add(row, "membership"));
      (bk.data || []).forEach((row) => add(row, "booking"));
      (en.data || []).forEach((row) => add(row, "enrollment"));
      (rq.data || []).forEach((row) => add(row, "request"));

      // Phone matches rank first so a caller ID lookup lands at the top.
      const list = Array.from(map.values()).sort((a, b) => {
        const aPhone = phoneLike && (a.parent_phone || "").replace(/\D/g, "").includes(digits) ? 0 : 1;
        const bPhone = phoneLike && (b.parent_phone || "").replace(/\D/g, "").includes(digits) ? 0 : 1;
        return aPhone - bPhone;
      });

      if (groupByFamily) {
        setResults([]);
        setFamilies(groupFamilyMatches(list).slice(0, 12));
      } else {
        setResults(list.slice(0, 12));
        setFamilies([]);
      }
      setSearching(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [query, groupByFamily]);

  return { results, families, searching };
}

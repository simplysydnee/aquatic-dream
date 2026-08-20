import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchClosureDateSet } from "../_shared/closure-schedule.ts";
import { buildMembershipOccurrenceRows } from "../_shared/membership-occurrences.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const HORIZON_WEEKS = 12;
const DAY_MS = 86400000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Today's calendar date in Pacific, as YYYY-MM-DD. No toISOString round trip. */
function todayPT(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isoToUTC(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function addDaysISO(iso: string, days: number): string {
  return new Date(isoToUTC(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

interface SlotRow {
  id: string;
  day_of_week: number | null;
  start_time: string | null;
  end_time: string | null;
  instructor_id: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Service-role (pg_cron) or configured CRON_SECRET only.
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const providedSecret = req.headers.get("x-cron-secret") || "";
  const secrets = [Deno.env.get("CRON_INVOKE_SECRET"), Deno.env.get("CRON_SECRET")].filter(
    (v): v is string => !!v,
  );
  const isServiceRole = !!bearer && bearer === SERVICE_ROLE;
  const isCronSecret = !!providedSecret && secrets.includes(providedSecret);
  if (!isServiceRole && !isCronSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_ROLE);

  try {
    const today = todayPT();
    const horizon = addDaysISO(today, HORIZON_WEEKS * 7);

    const { data: memberships, error: mErr } = await supabase
      .from("memberships")
      .select("id, status, standing_slot_id, cancel_effective_date")
      .in("status", ["active", "pending_cancel"]);
    if (mErr) return json({ error: mErr.message }, 500);

    const list = memberships ?? [];
    const slotIds = Array.from(
      new Set(list.map((m) => m.standing_slot_id).filter((v): v is string => !!v)),
    );

    const slotMap = new Map<string, SlotRow>();
    if (slotIds.length > 0) {
      const { data: slots, error: sErr } = await supabase
        .from("standing_slots")
        .select("id, day_of_week, start_time, end_time, instructor_id")
        .in("id", slotIds);
      if (sErr) return json({ error: sErr.message }, 500);
      for (const s of (slots ?? []) as SlotRow[]) slotMap.set(s.id, s);
    }

    const closureDates = await fetchClosureDateSet();

    let processed = 0;
    let created = 0;
    let skippedNoSlot = 0;
    let skippedCancelDate = 0;
    const errors: { membership_id: string; error: string }[] = [];
    const noSlotMemberships: string[] = [];

    for (const m of list) {
      try {
        if (!m.standing_slot_id) {
          skippedNoSlot += 1;
          noSlotMemberships.push(m.id);
          continue;
        }
        const slot = slotMap.get(m.standing_slot_id);
        if (!slot) {
          errors.push({ membership_id: m.id, error: "standing slot not found" });
          continue;
        }

        processed += 1;

        const { data: lastRow, error: lErr } = await supabase
          .from("membership_occurrences")
          .select("occurrence_date")
          .eq("membership_id", m.id)
          .order("occurrence_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lErr) throw new Error(lErr.message);

        // Never backdate: start no earlier than today, even if the roster
        // already ran dry weeks ago.
        const afterLast = lastRow?.occurrence_date
          ? addDaysISO(lastRow.occurrence_date as string, 1)
          : today;
        const startISO = isoToUTC(afterLast) > isoToUTC(today) ? afterLast : today;

        // pending_cancel never generates past the effective cancel date.
        let endISO = horizon;
        const cancelDate = m.cancel_effective_date as string | null;
        if (m.status === "pending_cancel" && cancelDate) {
          if (isoToUTC(cancelDate) < isoToUTC(startISO)) {
            skippedCancelDate += 1;
            continue;
          }
          if (isoToUTC(cancelDate) < isoToUTC(endISO)) endISO = cancelDate;
        }

        // The shared generator takes a lesson COUNT and skips closures, so the
        // count is derived from calendar weeks in the window. A long closure can
        // push the final date slightly past the horizon; that is intentional.
        const spanDays = Math.floor((isoToUTC(endISO) - isoToUTC(startISO)) / DAY_MS);
        if (spanDays < 0) continue;
        const count = Math.floor(spanDays / 7) + 1;
        if (count <= 0) continue;

        let rows = buildMembershipOccurrenceRows({
          membershipId: m.id,
          slot: {
            day_of_week: Number(slot.day_of_week ?? 0),
            start_time: slot.start_time,
            end_time: slot.end_time,
            instructor_id: slot.instructor_id,
          },
          startISO,
          closureDates,
          count,
        });

        // Hard guards: nothing before today, nothing past a cancel date.
        const beforeCancel = rows.length;
        rows = rows.filter((r) => isoToUTC(r.occurrence_date) >= isoToUTC(today));
        if (m.status === "pending_cancel" && cancelDate) {
          rows = rows.filter((r) => isoToUTC(r.occurrence_date) <= isoToUTC(cancelDate));
          if (rows.length < beforeCancel) skippedCancelDate += 1;
        }
        if (rows.length === 0) continue;

        // Idempotent: the unique index on (membership_id, occurrence_date) is
        // the guard. Existing rows are never updated.
        const { data: inserted, error: iErr } = await supabase
          .from("membership_occurrences")
          .upsert(rows, { onConflict: "membership_id,occurrence_date", ignoreDuplicates: true })
          .select("id");
        if (iErr) throw new Error(iErr.message);
        created += inserted?.length ?? 0;
      } catch (e) {
        errors.push({
          membership_id: m.id,
          error: e instanceof Error ? e.message : "unknown error",
        });
      }
    }

    const summary = {
      ok: true,
      today,
      horizon,
      memberships_processed: processed,
      occurrences_created: created,
      skipped_no_slot: skippedNoSlot,
      skipped_no_slot_ids: noSlotMemberships,
      skipped_cancel_date: skippedCancelDate,
      errors,
    };
    console.log("[extend-membership-occurrences]", JSON.stringify(summary));
    return json(summary);
  } catch (e) {
    console.error("[extend-membership-occurrences] fatal", e);
    return json({ error: e instanceof Error ? e.message : "Something went wrong" }, 500);
  }
});

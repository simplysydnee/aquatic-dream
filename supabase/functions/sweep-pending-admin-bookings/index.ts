// Hourly sweep for admin (phone / in-person) private bookings that never got a
// card on file.
//
// This is deliberately SEPARATE from sweep-abandoned-bookings, which retires
// self-serve carts at 15 minutes and intentionally skips admin bookings.
//
// Rules:
//   - "Confirmed"  = lesson_bookings.stripe_payment_method_id IS NOT NULL.
//   - Pending      = booking_source in ('admin','admin_manual'),
//                    status='pending_card', no payment method, and NO
//                    occurrence with payment_status='paid'.
//   - 44h  -> one warning SMS with a card-on-file link (once per booking).
//   - 48h  -> release the spot exactly like sweep-abandoned-bookings does,
//             then text the parent.
//
// Texts are only SENT between 8am and 8pm Pacific. Outside that window the
// warning waits for the next 8am run. A release still happens on time; only
// its text waits.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { isCronAuthorized, unauthorizedResponse } from "../_shared/cron-guard.ts";

import { sendAndLogBookingConfirmation } from "../_shared/textmagic.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = "https://aquaticdreamsswim.com";
const WARN_HOURS = 44;
const RELEASE_HOURS = 48;
const WARN_KIND = "admin_card_warning_44h";
const RELEASE_KIND = "admin_card_release_48h";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

const ADMIN_SOURCES = ["admin", "admin_manual"];

interface PendingBooking {
  id: string;
  parent_name: string | null;
  parent_phone: string | null;
  child_name: string | null;
  child_first_name: string | null;
  created_at: string;
  status: string;
  card_warning_sent_at: string | null;
}

/** Current hour (0-23) in America/Los_Angeles. */
function ptHour(now: Date): number {
  const s = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    hour12: false,
  }).format(now);
  return parseInt(s, 10);
}

function withinSendWindow(now: Date): boolean {
  const h = ptHour(now);
  return h >= 8 && h < 20;
}

function firstName(full: string | null | undefined, fallback = "there"): string {
  const n = (full || "").trim().split(/\s+/)[0];
  return n || fallback;
}

async function cardLinkFor(bookingId: string): Promise<string | null> {
  const environment = Deno.env.get("STRIPE_ENVIRONMENT") === "sandbox" ? "sandbox" : "live";
  try {
    const { data, error } = await supabase.functions.invoke("admin-card-on-file-link", {
      body: { bookingId, environment, siteUrl: SITE_URL },
    });
    if (error) {
      console.error("card link invoke failed", bookingId, error.message);
      return null;
    }
    return (data as { paymentLink?: string })?.paymentLink ?? null;
  } catch (e) {
    console.error("card link threw", bookingId, e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** Booking ids that already took money anywhere — never touched. */
async function paidBookingIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase
    .from("lesson_booking_occurrences")
    .select("booking_id")
    .in("booking_id", ids)
    .eq("payment_status", "paid");
  if (error) throw error;
  return new Set((data ?? []).map((o: { booking_id: string }) => o.booking_id));
}

async function releaseBooking(id: string): Promise<void> {
  const nowIso = new Date().toISOString();
  const { error: occError } = await supabase
    .from("lesson_booking_occurrences")
    .update({
      status: "abandoned",
      payment_status: "unpaid",
      charge_status: "skipped",
      updated_at: nowIso,
    })
    .eq("booking_id", id)
    .neq("status", "cancelled")
    .neq("payment_status", "paid");
  if (occError) throw occError;

  const { error: bookingError } = await supabase
    .from("lesson_bookings")
    .update({ status: "abandoned", updated_at: nowIso })
    .eq("id", id);
  if (bookingError) throw bookingError;
}

/** Bookings that already received a given text, so we never double-send. */
async function alreadyTexted(kind: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data } = await supabase
    .from("reminder_logs")
    .select("booking_id")
    .eq("reminder_kind", kind)
    .eq("status", "sent")
    .in("booking_id", ids);
  return new Set((data ?? []).map((r: { booking_id: string }) => r.booking_id));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const now = new Date();
    const canText = withinSendWindow(now);
    const warnCutoff = new Date(now.getTime() - WARN_HOURS * 3600 * 1000).toISOString();
    const releaseCutoff = new Date(now.getTime() - RELEASE_HOURS * 3600 * 1000).toISOString();
    // Do not reach back forever when catching up on release texts.
    const lookbackCutoff = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();

    const cols =
      "id, parent_name, parent_phone, child_name, child_first_name, created_at, status, card_warning_sent_at";

    const [{ data: pendingRows, error: pErr }, { data: releasedRows, error: rErr }] =
      await Promise.all([
        supabase
          .from("lesson_bookings")
          .select(cols)
          .in("booking_source", ADMIN_SOURCES)
          .eq("status", "pending_card")
          .is("stripe_payment_method_id", null)
          .lte("created_at", warnCutoff)
          .gte("created_at", lookbackCutoff),
        // Previously released by this job but the text was owed until the
        // send window reopened.
        supabase
          .from("lesson_bookings")
          .select(cols)
          .in("booking_source", ADMIN_SOURCES)
          .eq("status", "abandoned")
          .is("stripe_payment_method_id", null)
          .lte("created_at", releaseCutoff)
          .gte("created_at", lookbackCutoff),
      ]);
    if (pErr) throw pErr;
    if (rErr) throw rErr;

    const pending = (pendingRows ?? []) as PendingBooking[];
    const releasedEarlier = (releasedRows ?? []) as PendingBooking[];
    const allIds = [...pending, ...releasedEarlier].map((b) => b.id);
    const paid = await paidBookingIds(allIds);

    const toWarn: PendingBooking[] = [];
    const toRelease: PendingBooking[] = [];
    for (const b of pending) {
      if (paid.has(b.id)) continue;
      const hours = (now.getTime() - new Date(b.created_at).getTime()) / 3600000;
      if (hours >= RELEASE_HOURS) toRelease.push(b);
      else if (hours >= WARN_HOURS && !b.card_warning_sent_at) toWarn.push(b);
    }

    let warned = 0;
    let released = 0;
    let releaseTexts = 0;

    // --- 44h warnings (send window only) ---
    if (canText) {
      for (const b of toWarn) {
        const link = await cardLinkFor(b.id);
        if (!link) continue; // retry on the next hourly run
        const child = firstName(b.child_first_name || b.child_name, "your swimmer");
        const message =
          `Hi ${firstName(b.parent_name)} — we're holding ${child}'s lesson spot, but we need ` +
          `a card on file to keep it. Add it here: ${link}. Otherwise the spot will be released ` +
          `in a few hours.`;
        const res = await sendAndLogBookingConfirmation(supabase, {
          phoneRaw: b.parent_phone,
          message,
          swimmer_name: b.child_name,
          booking_id: b.id,
          reminder_kind: WARN_KIND,
        });
        await supabase
          .from("lesson_bookings")
          .update({ card_warning_sent_at: new Date().toISOString() })
          .eq("id", b.id);
        if (res.ok) warned++;
      }
    }

    // --- 48h releases (always) ---
    for (const b of toRelease) {
      await releaseBooking(b.id);
      released++;
    }

    // --- release texts (send window only, once per booking) ---
    if (canText) {
      const candidates = [...toRelease, ...releasedEarlier.filter((b) => !paid.has(b.id))];
      const uniq = new Map(candidates.map((b) => [b.id, b]));
      const sentAlready = await alreadyTexted(RELEASE_KIND, [...uniq.keys()]);
      for (const b of uniq.values()) {
        if (sentAlready.has(b.id)) continue;
        const child = firstName(b.child_first_name || b.child_name, "your swimmer");
        const message =
          `Hi ${firstName(b.parent_name)} — we released ${child}'s lesson spot since we didn't ` +
          `get a card on file. Rebook anytime — just call or come by.`;
        const res = await sendAndLogBookingConfirmation(supabase, {
          phoneRaw: b.parent_phone,
          message,
          swimmer_name: b.child_name,
          booking_id: b.id,
          reminder_kind: RELEASE_KIND,
        });
        if (res.ok) releaseTexts++;
      }
    }

    return new Response(
      JSON.stringify({ warned, released, releaseTexts, canText, pending: pending.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("sweep-pending-admin-bookings failed:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

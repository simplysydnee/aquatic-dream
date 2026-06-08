// FALLBACK PATH while embedded Stripe checkout is unavailable.
//
// Creates swim_enrollments rows in status='pending_payment' and immediately
// fires the appropriate hosted Stripe payment link email:
//   - first-time child (row 0)  -> send-registration-fee-payment-link ($45)
//   - returning child           -> send-session-payment-link ($240/row)
//
// payments-webhook is still the ONLY writer for payment_status='paid' /
// session_fee_status='paid', so the "no Stripe = no paid row" rule holds.
// When checkout is fixed, the public flow flips back to create-checkout
// by toggling VITE_CHECKOUT_FALLBACK off on the client. No data migration.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { payload, environment } = await req.json();

    if (!payload || !Array.isArray(payload.children) || payload.children.length === 0) {
      return json({ error: "Invalid payload: children required" }, 400);
    }

    // Validate session ids + capacity
    const allSessionIds: string[] = [];
    for (const child of payload.children) {
      if (!Array.isArray(child.sessionIds) || child.sessionIds.length === 0) {
        return json({ error: "Each child must have at least one session" }, 400);
      }
      for (const sid of child.sessionIds) {
        if (typeof sid !== "string" || !uuidRe.test(sid)) {
          return json({ error: `Invalid session id: ${sid}` }, 400);
        }
        allSessionIds.push(sid);
      }
    }
    const uniqueSessionIds = [...new Set(allSessionIds)];

    const { data: sessions, error: sErr } = await supabase
      .from("swim_sessions")
      .select("id, max_students, session_price, session_start_date")
      .in("id", uniqueSessionIds);
    if (sErr || !sessions || sessions.length !== uniqueSessionIds.length) {
      return json({ error: "One or more sessions not found" }, 404);
    }
    const sessionMap = Object.fromEntries(sessions.map((s) => [s.id, s]));

    const { data: existing } = await supabase
      .from("swim_enrollments")
      .select("session_id")
      .in("session_id", uniqueSessionIds)
      .in("status", ["confirmed", "enrolled"]);
    const countMap: Record<string, number> = {};
    existing?.forEach((e) => { if (e.session_id) countMap[e.session_id] = (countMap[e.session_id] || 0) + 1; });
    const requestedMap: Record<string, number> = {};
    for (const child of payload.children) {
      for (const sid of child.sessionIds) requestedMap[sid] = (requestedMap[sid] || 0) + 1;
    }
    for (const sid of uniqueSessionIds) {
      const used = countMap[sid] || 0;
      const wanted = requestedMap[sid] || 0;
      const max = sessionMap[sid].max_students ?? 3;
      if (used + wanted > max) {
        return json({ error: `Session ${sid} is full` }, 409);
      }
    }

    // Build rows. Mirror payments-webhook shape EXCEPT status/payment_status:
    // these are reservations, not paid rows.
    // Capture client IP from standard proxy headers — used as proof of SMS consent.
    const clientIp = (req.headers.get("x-forwarded-for") || "")
      .split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || null;
    const SMS_CONSENT_VERSION = "2026-06-08";
    const SMS_CONSENT_TEXT =
      "I agree to receive SMS text messages from Aquatic Dreams Swim Modesto " +
      "about my swimmer's lessons, schedule changes, reminders, and account " +
      "updates at the phone number I provided. Message frequency varies. " +
      "Message and data rates may apply. Reply STOP to unsubscribe or HELP for help. " +
      "See our SMS Terms (/sms-terms) and Privacy Policy (/waivers). " +
      "Consent is not a condition of enrollment.";

    const rows = payload.children.flatMap((child: any) =>
      child.sessionIds.map((sid: string, i: number) => {
        const isReturning = !child.isFirstTime;
        const chargeRegFee = child.isFirstTime && i === 0;
        const smsConsent = child.smsConsent === true;
        return {
          swim_level: child.level,
          session_id: sid,
          parent_name: child.parentName,
          parent_first_name: child.parentFirstName ?? null,
          parent_last_name: child.parentLastName ?? null,
          parent_email: child.parentEmail,
          parent_phone: child.parentPhone,
          child_name: child.childName,
          child_first_name: child.childFirstName ?? null,
          child_last_name: child.childLastName ?? null,
          child_age: child.childAge,
          child_dob: child.childDob,
          medical_notes: child.medicalNotes,
          notes: child.notes,
          lesson_type: "group",
          registration_fee: chargeRegFee ? 45 : 0,
          status: "pending_payment",
          // Reg fee state: unpaid for the row that will be charged $45,
          // not_required for siblings/returning rows.
          payment_status: chargeRegFee ? "unpaid" : "not_required",
          payment_amount: null,
          is_first_time: child.isFirstTime,
          payment_due_date: sessionMap[sid].session_start_date || null,
          payment_method: "stripe_link",
          payment_reference: "pending — emailed payment link",
          // Session fee will be collected via hosted link (returning) or day 1 (first-time default).
          session_fee_status: "due_day_1",
          // SMS opt-in audit trail (TextMagic / 10DLC compliance)
          sms_consent: smsConsent,
          sms_consent_at: smsConsent ? new Date().toISOString() : null,
          sms_consent_ip: smsConsent ? clientIp : null,
          sms_consent_version: smsConsent ? SMS_CONSENT_VERSION : null,
          sms_consent_text: smsConsent ? SMS_CONSENT_TEXT : null,
        };
      })
    );

    const { data: inserted, error: insErr } = await supabase
      .from("swim_enrollments")
      .insert(rows)
      .select("id, is_first_time, child_name");
    if (insErr || !inserted) {
      console.error("pending insert failed", insErr);
      return json({ error: insErr?.message || "Insert failed" }, 500);
    }

    // Group inserted rows by child (parent_email + child_name). For each
    // child, fire ONE link: reg fee for first-timer (row 0), or session fee
    // for each returning row.
    const firstByChild = new Map<string, string>(); // key -> enrollment id
    for (const r of inserted) {
      const key = String(r.child_name);
      if (!firstByChild.has(key)) firstByChild.set(key, r.id);
    }

    // Fire-and-forget link sends. Errors are logged but don't fail the response —
    // admin can resend from PaymentsTab.
    const env = environment || "sandbox";
    const sendResults: Array<{ enrollmentId: string; ok: boolean; error?: string }> = [];
    for (const child of payload.children) {
      const key = String(child.childName);
      const firstId = firstByChild.get(key);
      if (!firstId) continue;

      if (child.isFirstTime) {
        try {
          const { error } = await supabase.functions.invoke("send-registration-fee-payment-link", {
            body: { enrollmentId: firstId, environment: env },
          });
          sendResults.push({ enrollmentId: firstId, ok: !error, error: error?.message });
        } catch (e) {
          sendResults.push({ enrollmentId: firstId, ok: false, error: (e as Error).message });
        }
      } else {
        // returning: fire one session-fee link per session row for this child
        const rowIds = inserted.filter((r) => r.child_name === child.childName).map((r) => r.id);
        for (const id of rowIds) {
          try {
            const { error } = await supabase.functions.invoke("send-session-payment-link", {
              body: { enrollmentId: id, environment: env },
            });
            sendResults.push({ enrollmentId: id, ok: !error, error: error?.message });
          } catch (e) {
            sendResults.push({ enrollmentId: id, ok: false, error: (e as Error).message });
          }
        }
      }
    }

    return json({
      success: true,
      enrollmentIds: inserted.map((r) => r.id),
      emailsSent: sendResults,
    }, 200);
  } catch (e) {
    console.error("create-pending-enrollment error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

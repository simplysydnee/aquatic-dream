// Batch-text Stripe Payment Link SMS to all unpaid enrollees in a session period.
// Reuses text-session-payment-link per enrollment (idempotent link, TextMagic + logging).
// Admin JWT required.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { normalizePhone } from "../_shared/textmagic.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const BodySchema = z.object({
  sessionPeriodId: z.string().uuid(),
  environment: z.enum(["live", "sandbox"]).default("live"),
  dryRun: z.boolean().default(false),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });
    const token = authHeader.replace("Bearer ", "");

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    const userId = claims?.claims?.sub as string | undefined;
    if (claimsErr || !userId) return json(401, { error: "Unauthorized" });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) return json(403, { error: "Forbidden" });

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json(400, { error: parsed.error.flatten() });
    const { sessionPeriodId, environment, dryRun } = parsed.data;

    // Pull all enrollments in the given session period.
    const { data: rows, error } = await admin
      .from("swim_enrollments")
      .select(
        "id, child_name, parent_name, parent_phone, parent_email, status, session_fee_status, swim_sessions!inner(session_period_id, session_name)"
      )
      .eq("swim_sessions.session_period_id", sessionPeriodId);

    if (error) return json(500, { error: error.message });

    const eligible: Array<{
      enrollmentId: string;
      childName: string;
      phone: string;
    }> = [];
    const skippedNoPhone: Array<{ enrollmentId: string; childName: string; parentEmail: string | null }> = [];
    const skippedPaid: Array<{ enrollmentId: string; childName: string; reason: string }> = [];

    for (const r of rows ?? []) {
      if (r.status === "cancelled") continue;
      const feeStatus = r.session_fee_status || "unpaid";
      if (feeStatus === "paid" || feeStatus === "comp") {
        skippedPaid.push({ enrollmentId: r.id, childName: r.child_name, reason: feeStatus });
        continue;
      }
      const phone = normalizePhone(r.parent_phone);
      if (!phone) {
        skippedNoPhone.push({
          enrollmentId: r.id,
          childName: r.child_name,
          parentEmail: r.parent_email,
        });
        continue;
      }
      eligible.push({ enrollmentId: r.id, childName: r.child_name, phone });
    }

    // Dedupe by phone (one text per parent even if multiple swimmers) — send for the first enrollment only
    const seenPhone = new Set<string>();
    const toSend = eligible.filter((e) => {
      if (seenPhone.has(e.phone)) return false;
      seenPhone.add(e.phone);
      return true;
    });

    if (dryRun) {
      return json(200, {
        dryRun: true,
        eligibleCount: toSend.length,
        duplicatePhoneSkipped: eligible.length - toSend.length,
        skippedNoPhoneCount: skippedNoPhone.length,
        skippedPaidCount: skippedPaid.length,
        eligible: toSend,
        skippedNoPhone,
      });
    }

    const results: Array<{
      enrollmentId: string;
      childName: string;
      phone: string;
      status: "sent" | "failed";
      error?: string;
    }> = [];

    for (const e of toSend) {
      try {
        const { data, error: invErr } = await admin.functions.invoke(
          "text-session-payment-link",
          { body: { enrollmentId: e.enrollmentId, environment } },
        );
        if (invErr || (data as any)?.error) {
          results.push({
            ...e,
            status: "failed",
            error: (invErr as any)?.message || (data as any)?.error || "invoke failed",
          });
        } else {
          results.push({ ...e, status: "sent" });
        }
      } catch (err) {
        results.push({
          ...e,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        });
      }
      // Small pacing delay to be friendly to TextMagic
      await new Promise((r) => setTimeout(r, 150));
    }

    const sent = results.filter((r) => r.status === "sent").length;
    const failed = results.filter((r) => r.status === "failed").length;

    return json(200, {
      dryRun: false,
      sent,
      failed,
      results,
      skippedNoPhoneCount: skippedNoPhone.length,
      skippedNoPhone,
      skippedPaidCount: skippedPaid.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("send-session-payment-link-sms-batch error:", message);
    return json(500, { error: message });
  }
});

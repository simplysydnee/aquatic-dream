// Bulk SMS blast for session gap outreach. Admin-only.
// Recipients pre-deduped by phone from the client; we log every send.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { normalizePhone, sendSms, logSms } from "../_shared/textmagic.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const RecipientSchema = z.object({
  phone: z.string().min(5),
  childNames: z.array(z.string()).default([]),
});
const BodySchema = z.object({
  template: z.string().min(5).max(1000),
  startDateLabel: z.string().min(1),
  recipients: z.array(RecipientSchema).min(1).max(500),
  reminderKind: z.string().default("session_outreach_sms"),
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
      _user_id: userId, _role: "admin",
    });
    if (!isAdmin) return json(403, { error: "Forbidden" });

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json(400, { error: parsed.error.flatten() });
    const { template, startDateLabel, recipients, reminderKind } = parsed.data;

    // Dedupe recipients by normalized phone (merge child names)
    const groups = new Map<string, Set<string>>();
    for (const r of recipients) {
      const phone = normalizePhone(r.phone);
      if (!phone) continue;
      if (!groups.has(phone)) groups.set(phone, new Set());
      for (const n of r.childNames) if (n && n.trim()) groups.get(phone)!.add(n.trim());
    }

    let sent = 0, failed = 0;
    for (const [phone, namesSet] of groups) {
      const names = Array.from(namesSet);
      const firstNames = names.length ? names.join(" & ") : "your swimmer";
      const message = template
        .replaceAll("{FirstNames}", firstNames)
        .replaceAll("{ChildFirst}", names[0] || "your swimmer")
        .replaceAll("{StartDate}", startDateLabel);

      const result = await sendSms(phone, message);
      await logSms(admin, {
        swimmer_name: names.join(", ") || null,
        phone,
        message,
        status: result.ok ? "sent" : "failed",
        error: result.ok ? null : result.error ?? null,
        reminder_kind: reminderKind,
      });
      if (result.ok) sent++; else failed++;
    }

    return json(200, { ok: true, sent, failed, total: groups.size });
  } catch (e) {
    console.error("send-bulk-outreach-sms error:", e);
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
});

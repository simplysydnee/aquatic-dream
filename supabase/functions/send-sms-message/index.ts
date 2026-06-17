// Admin/instructor-gated outbound SMS sender for the staff inbox.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { normalizePhone, sendSms } from "../_shared/textmagic.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const BodySchema = z
  .object({
    conversation_id: z.string().uuid().optional(),
    phone: z.string().min(5).optional(),
    body: z.string().min(1).max(1000),
  })
  .refine((d) => !!d.conversation_id !== !!d.phone, {
    message: "Provide exactly one of conversation_id or phone",
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });
    const token = authHeader.replace("Bearer ", "");

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    const userId = claimsData?.claims?.sub as string | undefined;
    if (claimsErr || !userId) return json(401, { error: "Unauthorized" });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const [{ data: isAdmin }, { data: isInstructor }] = await Promise.all([
      admin.rpc("has_role", { _user_id: userId, _role: "admin" }),
      admin.rpc("has_role", { _user_id: userId, _role: "instructor" }),
    ]);
    if (!isAdmin && !isInstructor) return json(403, { error: "Forbidden" });

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json(400, { error: parsed.error.flatten() });
    const { conversation_id, phone: phoneInput, body } = parsed.data;

    let conversationId = conversation_id ?? "";
    let parentPhone = "";

    if (conversation_id) {
      const { data: conv, error: convErr } = await admin
        .from("sms_conversations")
        .select("id, parent_phone")
        .eq("id", conversation_id)
        .single();
      if (convErr || !conv) return json(404, { error: "Conversation not found" });
      parentPhone = conv.parent_phone;
    } else {
      const normalized = normalizePhone(phoneInput!);
      if (!normalized) return json(400, { error: "Invalid phone" });
      parentPhone = normalized;

      const { data: existing } = await admin
        .from("sms_conversations")
        .select("id")
        .eq("parent_phone", parentPhone)
        .maybeSingle();

      if (existing) {
        conversationId = existing.id;
      } else {
        let parentName: string | null = null;
        const last10 = parentPhone.replace(/\D/g, "").slice(-10);
        const variants = Array.from(new Set([parentPhone, last10, `+1${last10}`]));
        const { data: lb } = await admin
          .from("lesson_bookings")
          .select("parent_name")
          .in("parent_phone", variants)
          .limit(1);
        if (lb && lb.length) parentName = lb[0].parent_name ?? null;
        if (!parentName) {
          const { data: se } = await admin
            .from("swim_enrollments")
            .select("parent_name")
            .in("parent_phone", variants)
            .limit(1);
          if (se && se.length) parentName = se[0].parent_name ?? null;
        }

        const { data: created, error: createErr } = await admin
          .from("sms_conversations")
          .insert({ parent_phone: parentPhone, parent_name: parentName })
          .select("id")
          .single();
        if (createErr || !created) return json(500, { error: "Failed to create conversation" });
        conversationId = created.id;
      }
    }

    const result = await sendSms(parentPhone, body);

    await admin.from("sms_messages").insert({
      conversation_id: conversationId,
      direction: "outbound",
      body,
      sent_by: userId,
      status: result.ok ? "sent" : "failed",
      error: result.ok ? null : result.error ?? null,
    });

    if (result.ok) {
      await admin
        .from("sms_conversations")
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: body.slice(0, 160),
          last_direction: "outbound",
        })
        .eq("id", conversationId);
    }

    return json(result.ok ? 200 : 502, {
      ok: result.ok,
      conversation_id: conversationId,
      error: result.error ?? null,
    });
  } catch (e) {
    console.error("send-sms-message error:", e);
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
});

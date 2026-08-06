// Public TextMagic inbound SMS webhook.
// Protected by ?token=<TEXTMAGIC_INBOUND_SECRET> query param.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { normalizePhone } from "../_shared/textmagic.ts";
import { isOptOutMessage, recordOptOut } from "../_shared/sms-opt-out.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INBOUND_SECRET = Deno.env.get("TEXTMAGIC_INBOUND_SECRET");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!INBOUND_SECRET || token !== INBOUND_SECRET) {
      console.error("receive-inbound-sms: invalid or missing token");
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    const ct = req.headers.get("content-type") || "";
    let sender = "";
    let text = "";
    let messageId = "";

    if (ct.includes("application/json")) {
      const j = await req.json().catch(() => ({} as any));
      sender = j.sender ?? j.from ?? j.phone ?? "";
      text = j.text ?? j.message ?? j.body ?? "";
      messageId = String(j.message_id ?? j.messageId ?? j.id ?? "");
    } else {
      const form = await req.formData().catch(() => null);
      if (form) {
        sender = String(form.get("sender") ?? form.get("from") ?? form.get("phone") ?? "");
        text = String(form.get("text") ?? form.get("message") ?? form.get("body") ?? "");
        messageId = String(form.get("message_id") ?? form.get("messageId") ?? form.get("id") ?? "");
      }
    }

    const phone = normalizePhone(sender);
    if (!phone || !text) {
      console.error("receive-inbound-sms: missing phone or text", { sender, hasText: !!text });
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: existing } = await admin
      .from("sms_conversations")
      .select("id, parent_name")
      .eq("parent_phone", phone)
      .maybeSingle();

    let conversationId = existing?.id as string | undefined;

    if (!conversationId) {
      let parentName: string | null = null;
      const last10 = phone.replace(/\D/g, "").slice(-10);
      const variants = Array.from(new Set([phone, last10, `+1${last10}`]));

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
        .insert({
          parent_phone: phone,
          parent_name: parentName,
          last_message_at: new Date().toISOString(),
          last_message_preview: text.slice(0, 160),
          last_direction: "inbound",
        })
        .select("id")
        .single();
      if (createErr || !created) {
        console.error("receive-inbound-sms: failed to create conversation", createErr);
        return new Response("ok", { status: 200, headers: corsHeaders });
      }
      conversationId = created.id;
    } else {
      await admin
        .from("sms_conversations")
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: text.slice(0, 160),
          last_direction: "inbound",
        })
        .eq("id", conversationId);
    }

    const { error: insErr } = await admin.from("sms_messages").insert({
      conversation_id: conversationId,
      direction: "inbound",
      body: text,
      status: "received",
      textmagic_message_id: messageId || null,
    });
    if (insErr) console.error("receive-inbound-sms: insert message failed", insErr);

    return new Response("ok", { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error("receive-inbound-sms: unexpected error", e);
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
});

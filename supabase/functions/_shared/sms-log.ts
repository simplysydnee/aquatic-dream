// Records every text our own backend sends or receives into the staff inbox
// tables (sms_conversations + sms_messages) so a family's full text history is
// visible on their client record.
//
// Logging is best-effort: a text must never fail because the log write failed.

import { normalizePhone } from "./textmagic.ts";

export type SmsKind =
  | "reminder"
  | "payment_link"
  | "hold_invite"
  | "outreach"
  | "staff_reply"
  | "card_update"
  | "welcome"
  | "booking"
  | "inbound"
  | "other";

export interface SmsLogContext {
  /** Service-role Supabase client from the calling function. */
  admin: unknown;
  kind: SmsKind;
  /** Human readable sender, e.g. "System - 24h reminder" or an admin's name. */
  sentByLabel: string;
  /** Auth user id when a real staff member sent it. */
  sentBy?: string | null;
  /** Optional name to seed a brand new conversation with. */
  parentName?: string | null;
}

type AnyClient = {
  from: (t: string) => any;
};

async function lookupParentName(admin: AnyClient, phone: string): Promise<string | null> {
  const last10 = phone.replace(/\D/g, "").slice(-10);
  const variants = Array.from(new Set([phone, last10, `+1${last10}`]));
  try {
    const { data: lb } = await admin
      .from("lesson_bookings")
      .select("parent_name")
      .in("parent_phone", variants)
      .limit(1);
    if (lb && lb.length && lb[0].parent_name) return lb[0].parent_name as string;

    const { data: se } = await admin
      .from("swim_enrollments")
      .select("parent_name")
      .in("parent_phone", variants)
      .limit(1);
    if (se && se.length && se[0].parent_name) return se[0].parent_name as string;
  } catch (_e) {
    // ignore
  }
  return null;
}

/** Find or create the conversation row for a phone number. Returns its id. */
export async function getOrCreateConversation(
  admin: AnyClient,
  phoneRaw: string,
  parentName?: string | null,
): Promise<string | null> {
  const phone = normalizePhone(phoneRaw);
  if (!phone) return null;

  const { data: existing } = await admin
    .from("sms_conversations")
    .select("id")
    .eq("parent_phone", phone)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const name = parentName ?? (await lookupParentName(admin, phone));
  const { data: created, error } = await admin
    .from("sms_conversations")
    .insert({ parent_phone: phone, parent_name: name })
    .select("id")
    .single();
  if (error || !created) {
    console.error("sms-log: failed to create conversation", error);
    return null;
  }
  return created.id as string;
}

/** Log an outbound text into the staff inbox. Never throws. */
export async function logOutboundSms(
  ctx: SmsLogContext,
  args: {
    phone: string;
    body: string;
    status: "sent" | "failed";
    error?: string | null;
  },
): Promise<void> {
  try {
    const admin = ctx.admin as AnyClient;
    if (!admin?.from) return;
    const phone = normalizePhone(args.phone);
    if (!phone) return;

    const conversationId = await getOrCreateConversation(admin, phone, ctx.parentName ?? null);
    if (!conversationId) return;

    await admin.from("sms_messages").insert({
      conversation_id: conversationId,
      direction: "outbound",
      body: args.body,
      status: args.status,
      error: args.error ?? null,
      kind: ctx.kind,
      sent_by: ctx.sentBy ?? null,
      sent_by_label: ctx.sentByLabel,
    });

    if (args.status === "sent") {
      await admin
        .from("sms_conversations")
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: args.body.slice(0, 160),
          last_direction: "outbound",
        })
        .eq("id", conversationId);
    }
  } catch (e) {
    console.error("sms-log: logOutboundSms failed", e instanceof Error ? e.message : String(e));
  }
}

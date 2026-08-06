// Shared SMS opt-out (STOP) helpers.
// Any inbound message whose trimmed text is STOP / UNSUBSCRIBE / CANCEL
// (case-insensitive, punctuation tolerated) opts that phone out of all
// outbound campaign SMS.

const OPT_OUT_WORDS = new Set([
  "stop",
  "stopall",
  "unsubscribe",
  "cancel",
  "end",
  "quit",
]);

/** Last 10 digits, the key used everywhere for phone comparison. */
export const optOutPhoneKey = (raw: string | null | undefined): string | null => {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
};

export const isOptOutMessage = (body: string | null | undefined): boolean => {
  const normalized = (body ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
  if (!normalized) return false;
  return OPT_OUT_WORDS.has(normalized);
};

// deno-lint-ignore no-explicit-any
export async function recordOptOut(
  admin: any,
  phoneRaw: string | null | undefined,
  source: string,
): Promise<boolean> {
  const key = optOutPhoneKey(phoneRaw);
  if (!key) return false;
  const { error } = await admin
    .from("sms_opt_outs")
    .upsert({ phone: key, source }, { onConflict: "phone", ignoreDuplicates: true });
  if (error) {
    console.error("recordOptOut failed:", error.message);
    return false;
  }
  return true;
}

/** Set of last-10-digit keys that must never be texted. */
// deno-lint-ignore no-explicit-any
export async function loadOptOutPhones(admin: any): Promise<Set<string>> {
  const { data } = await admin.from("sms_opt_outs").select("phone");
  return new Set((data ?? []).map((r: { phone: string }) => optOutPhoneKey(r.phone) ?? r.phone));
}

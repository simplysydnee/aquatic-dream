// Helpers for syncing Resend Audiences to swim sessions, session periods, and levels.
// All calls go through the Lovable connector gateway, matching send-marketing-campaign.

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

export interface ResendAudienceCtx {
  lovableApiKey: string;
  resendApiKey: string;
}

function authHeaders(ctx: ResendAudienceCtx) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${ctx.lovableApiKey}`,
    "X-Connection-Api-Key": ctx.resendApiKey,
  };
}

export function ctxFromEnv(): ResendAudienceCtx {
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!lovableApiKey) throw new Error("LOVABLE_API_KEY is not configured");
  if (!resendApiKey) throw new Error("RESEND_API_KEY is not configured");
  return { lovableApiKey, resendApiKey };
}

export async function createAudience(ctx: ResendAudienceCtx, name: string): Promise<string> {
  const res = await fetch(`${GATEWAY_URL}/audiences`, {
    method: "POST",
    headers: authHeaders(ctx),
    body: JSON.stringify({ name: name.slice(0, 191) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.id) {
    throw new Error(`Resend createAudience failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data.id as string;
}

export async function addContact(
  ctx: ResendAudienceCtx,
  audienceId: string,
  email: string,
  opts: { first_name?: string | null; last_name?: string | null; unsubscribed?: boolean } = {},
): Promise<{ ok: boolean; status: number; body?: any }> {
  const res = await fetch(`${GATEWAY_URL}/audiences/${audienceId}/contacts`, {
    method: "POST",
    headers: authHeaders(ctx),
    body: JSON.stringify({
      email: email.toLowerCase().trim(),
      first_name: opts.first_name ?? undefined,
      last_name: opts.last_name ?? undefined,
      unsubscribed: opts.unsubscribed ?? false,
    }),
  });
  // Resend returns 200 even when contact already exists; surface body for logging
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

export async function removeContact(
  ctx: ResendAudienceCtx,
  audienceId: string,
  email: string,
): Promise<{ ok: boolean; status: number }> {
  const res = await fetch(
    `${GATEWAY_URL}/audiences/${audienceId}/contacts/${encodeURIComponent(email.toLowerCase().trim())}`,
    { method: "DELETE", headers: authHeaders(ctx) },
  );
  return { ok: res.ok, status: res.status };
}

export function sessionAudienceName(s: {
  session_name?: string | null;
  swim_level: string;
  day_of_week: string;
  start_time: string;
  period_name?: string | null;
}): string {
  const period = s.period_name ? `${s.period_name} — ` : "";
  const label = s.session_name
    ? s.session_name
    : `${cap(s.swim_level)} • ${cap(s.day_of_week)} ${s.start_time.slice(0, 5)}`;
  return `Class: ${period}${label}`;
}

export function periodAudienceName(name: string): string {
  return `Session Period: ${name}`;
}

export function levelAudienceName(level: string): string {
  return `Level: ${cap(level)}`;
}

function cap(s: string): string {
  return s.replace(/(^|[\s_-])(\w)/g, (_, b, c) => `${b}${c.toUpperCase()}`);
}

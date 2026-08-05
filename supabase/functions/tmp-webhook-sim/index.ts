// TEMPORARY verification harness. Signs a synthetic Stripe event with the
// project's own webhook secret and posts it to payments-webhook so the real
// handler path is exercised end to end. Deleted after verification.
import { encode } from "https://deno.land/std@0.168.0/encoding/hex.ts";

Deno.serve(async (req) => {
  const { event, env = "sandbox" } = await req.json();
  const secret =
    env === "sandbox"
      ? Deno.env.get("PAYMENTS_SANDBOX_WEBHOOK_SECRET")
      : Deno.env.get("PAYMENTS_LIVE_WEBHOOK_SECRET");
  if (!secret) return new Response("no secret", { status: 500 });

  const body = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`));
  const v1 = new TextDecoder().decode(encode(new Uint8Array(sig)));

  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/payments-webhook?env=${env}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "stripe-signature": `t=${t},v1=${v1}` },
    body,
  });
  return new Response(JSON.stringify({ status: res.status, body: await res.text() }), {
    headers: { "Content-Type": "application/json" },
  });
});

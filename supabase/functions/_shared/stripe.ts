import { encode } from "https://deno.land/std@0.168.0/encoding/hex.ts";

export type StripeEnv = 'sandbox' | 'live';

export function getConnectionApiKey(env: StripeEnv): string {
  // Membership checkout is intentionally pinned to test mode while /join is
  // being verified. Prefer this dedicated sk_test_ key for sandbox requests so
  // the embedded iframe's pk_test_ token and the server-created session always
  // belong to the same Stripe test account.
  const membershipTestKey = Deno.env.get('STRIPE_MEMBERSHIP_TEST_SECRET_KEY');
  if (env === 'sandbox' && membershipTestKey) {
    if (!/^sk_test_/.test(membershipTestKey)) {
      throw new Error('STRIPE_MEMBERSHIP_TEST_SECRET_KEY must start with sk_test_');
    }
    return membershipTestKey;
  }

  // Prefer a manually-configured real Stripe secret key (sk_/rk_) when set.
  // The Lovable connector gateway has been returning "Credential not found"
  // for STRIPE_LIVE_API_KEY in this project, so a real key from the same
  // Stripe account as the publishable key is the reliable path for live.
  //
  // CRITICAL: only use the manual key when its mode (test/live) matches the
  // requested env. Otherwise, embedded checkout would create a session in
  // one Stripe account while the iframe mounts a publishable key from the
  // other account, and Stripe rejects the session with
  // "Something went wrong, please contact the merchant" the moment the
  // iframe boots. When mismatched, fall through to the env-specific
  // gateway key.
  const manual = Deno.env.get('STRIPE_API_KEY');
  const wantsLive = env === 'live';
  if (manual && /^(sk|rk)_(test|live)_/.test(manual)) {
    const manualIsLive = /^(sk|rk)_live_/.test(manual);
    if (manualIsLive === wantsLive) return manual;
    // Fall through to gateway when the manual key targets the wrong mode.
  }

  // Fallback: Lovable connector gateway keys (used when no manual key set
  // or when the manual key's mode doesn't match the requested env).
  const gateway = env === 'sandbox'
    ? Deno.env.get('STRIPE_SANDBOX_API_KEY')
    : Deno.env.get('STRIPE_LIVE_API_KEY');
  if (!gateway) {
    throw new Error(
      `No Stripe key configured for env=${env}. ` +
      `Set STRIPE_API_KEY (${wantsLive ? 'sk_live_' : 'sk_test_'}) or ` +
      `${env === 'sandbox' ? 'STRIPE_SANDBOX_API_KEY' : 'STRIPE_LIVE_API_KEY'}.`
    );
  }
  return gateway;
}


import Stripe from "https://esm.sh/stripe@18.5.0";

const GATEWAY_STRIPE_BASE = 'https://connector-gateway.lovable.dev/stripe';

// Cache Stripe clients per env across warm invocations to skip the
// repeated client construction (TLS + http client setup) on every request.
const stripeClientCache: Partial<Record<StripeEnv, Stripe>> = {};

export function createStripeClient(env: StripeEnv): Stripe {
  const cached = stripeClientCache[env];
  if (cached) return cached;

  const connectionApiKey = getConnectionApiKey(env);

  // If the configured value is a real Stripe secret key (sk_ / rk_), call
  // api.stripe.com directly. Otherwise treat it as a Lovable connector
  // gateway connection key and route through the gateway with LOVABLE_API_KEY.
  const isDirectStripeKey = /^(sk|rk)_(test|live)_/.test(connectionApiKey);

  const baseOptions = {
    // Pin wire API version so response shapes don't drift silently as the
    // account default rolls forward.
    apiVersion: '2026-03-25.dahlia' as any,
  };

  let client: Stripe;
  if (isDirectStripeKey) {
    client = new Stripe(connectionApiKey, baseOptions);
  } else {
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) throw new Error('LOVABLE_API_KEY is not configured');
    client = new Stripe(connectionApiKey, {
      ...baseOptions,
      httpClient: Stripe.createFetchHttpClient((url: string | URL, init?: RequestInit) => {
        const gatewayUrl = url.toString().replace('https://api.stripe.com', GATEWAY_STRIPE_BASE);
        return fetch(gatewayUrl, {
          ...init,
          headers: {
            ...Object.fromEntries(new Headers(init?.headers).entries()),
            'X-Connection-Api-Key': connectionApiKey,
            'Lovable-API-Key': lovableApiKey,
          },
        });
      }),
    });
  }
  stripeClientCache[env] = client;
  return client;
}

export async function verifyWebhook(req: Request, env: StripeEnv): Promise<{ type: string; data: { object: any } }> {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();
  const primary = env === 'sandbox'
    ? Deno.env.get('PAYMENTS_SANDBOX_WEBHOOK_SECRET')
    : Deno.env.get('PAYMENTS_LIVE_WEBHOOK_SECRET');
  const fallback = env === 'sandbox'
    ? Deno.env.get('PAYMENTS_LIVE_WEBHOOK_SECRET')
    : Deno.env.get('PAYMENTS_SANDBOX_WEBHOOK_SECRET');
  const secret = primary || fallback;

  if (!secret) {
    throw new Error('Webhook secret environment variable is not configured');
  }

  if (!signature || !body) {
    throw new Error("Missing signature or body");
  }

  let timestamp: string | undefined;
  const v1Signatures: string[] = [];
  for (const part of signature.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t") timestamp = value;
    if (key === "v1") v1Signatures.push(value);
  }

  if (!timestamp || v1Signatures.length === 0) {
    throw new Error("Invalid signature format");
  }

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) {
    throw new Error("Webhook timestamp too old");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${body}`)
  );
  const expected = new TextDecoder().decode(encode(new Uint8Array(signed)));

  if (!v1Signatures.includes(expected)) {
    throw new Error("Invalid webhook signature");
  }

  return JSON.parse(body);
}

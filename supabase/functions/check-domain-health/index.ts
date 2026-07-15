// Checks HTTPS reachability + TLS handshake for the project's domains.
// Returns per-domain status, HTTP code (if reachable), and error message.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_DOMAINS = [
  "aquaticdreamsswim.com",
  "www.aquaticdreamsswim.com",
  "aquatic-dream.lovable.app",
];

interface DomainResult {
  domain: string;
  url: string;
  ok: boolean;
  status: number | null;
  tls_ok: boolean;
  error: string | null;
  error_kind: "tls" | "dns" | "timeout" | "http" | "network" | "none";
  redirected_to: string | null;
  server: string | null;
  checked_at: string;
  duration_ms: number;
}

async function checkDomain(domain: string): Promise<DomainResult> {
  const url = `https://${domain}/`;
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": "AquaticDreams-DomainHealth/1.0" },
    });
    clearTimeout(timeout);
    return {
      domain,
      url,
      ok: res.status < 500,
      status: res.status,
      tls_ok: true,
      error: null,
      error_kind: "none",
      redirected_to: res.headers.get("location"),
      server: res.headers.get("server"),
      checked_at: new Date().toISOString(),
      duration_ms: Date.now() - started,
    };
  } catch (err) {
    clearTimeout(timeout);
    const raw = err instanceof Error ? err.message : String(err);
    const msg = raw.toLowerCase();
    let kind: DomainResult["error_kind"] = "network";
    let tls_ok = true;
    if (msg.includes("abort") || msg.includes("timeout") || msg.includes("timed out")) {
      kind = "timeout";
    } else if (
      msg.includes("tls") ||
      msg.includes("ssl") ||
      msg.includes("certificate") ||
      msg.includes("handshake") ||
      msg.includes("cipher") ||
      msg.includes("cert")
    ) {
      kind = "tls";
      tls_ok = false;
    } else if (msg.includes("dns") || msg.includes("resolve") || msg.includes("name resolution")) {
      kind = "dns";
    }
    return {
      domain,
      url,
      ok: false,
      status: null,
      tls_ok,
      error: raw,
      error_kind: kind,
      redirected_to: null,
      server: null,
      checked_at: new Date().toISOString(),
      duration_ms: Date.now() - started,
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  let domains = DEFAULT_DOMAINS;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (Array.isArray(body?.domains) && body.domains.length > 0) {
        domains = body.domains
          .filter((d: unknown) => typeof d === "string" && d.length > 0 && d.length < 253)
          .slice(0, 10);
      }
    }
  } catch { /* ignore */ }

  const results = await Promise.all(domains.map(checkDomain));
  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

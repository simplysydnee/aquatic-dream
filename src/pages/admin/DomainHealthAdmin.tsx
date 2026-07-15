import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, ShieldCheck, ShieldAlert, Globe, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

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

const DEFAULT_DOMAINS = [
  "aquaticdreamsswim.com",
  "www.aquaticdreamsswim.com",
  "aquatic-dream.lovable.app",
];

const errorKindLabel: Record<DomainResult["error_kind"], string> = {
  tls: "SSL / TLS certificate error",
  dns: "DNS resolution failed",
  timeout: "Request timed out",
  http: "HTTP error",
  network: "Network / connection error",
  none: "OK",
};

const errorKindHelp: Record<DomainResult["error_kind"], string> = {
  tls: "The certificate for this domain isn't being served correctly. Try disconnect + reconnect in Project Settings → Domains, then wait a few minutes for SSL to re-provision. If it stays broken, contact Lovable support.",
  dns: "The domain name isn't resolving. Check DNS records at your registrar (A → 185.158.133.1 for root/www).",
  timeout: "The server didn't respond in time — likely a hosting issue or firewall.",
  http: "The server responded with an error code. If 5xx, this is a hosting issue.",
  network: "Could not connect. Usually a DNS or hosting outage.",
  none: "",
};

function StatusBadge({ r }: { r: DomainResult }) {
  if (r.ok && r.tls_ok) {
    return (
      <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white gap-1">
        <CheckCircle2 className="w-3 h-3" /> Healthy
      </Badge>
    );
  }
  if (!r.tls_ok) {
    return (
      <Badge variant="destructive" className="gap-1">
        <ShieldAlert className="w-3 h-3" /> SSL broken
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="gap-1">
      <AlertTriangle className="w-3 h-3" /> Down
    </Badge>
  );
}

export default function DomainHealthAdmin() {
  const [domains, setDomains] = useState<string[]>(DEFAULT_DOMAINS);
  const [customDomain, setCustomDomain] = useState("");
  const [results, setResults] = useState<DomainResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = useCallback(async (list: string[]) => {
    setLoading(true);
    setErr(null);
    try {
      const { data, error } = await supabase.functions.invoke("check-domain-health", {
        body: { domains: list },
      });
      if (error) throw error;
      setResults((data?.results ?? []) as DomainResult[]);
      setLastRun(new Date().toISOString());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    run(domains);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addCustom = () => {
    const d = customDomain.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!d || domains.includes(d)) return;
    const next = [...domains, d];
    setDomains(next);
    setCustomDomain("");
    run(next);
  };

  const removeDomain = (d: string) => {
    const next = domains.filter((x) => x !== d);
    setDomains(next);
    setResults((prev) => prev.filter((r) => r.domain !== d));
  };

  const overall = results.length === 0
    ? null
    : results.every((r) => r.ok && r.tls_ok)
    ? "healthy"
    : results.some((r) => !r.tls_ok)
    ? "ssl"
    : "down";

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Globe className="w-6 h-6" /> Domain Health
          </h1>
          <p className="text-sm text-muted-foreground">
            Live HTTPS + TLS checks for your public domains.
          </p>
        </div>
        <Button onClick={() => run(domains)} disabled={loading} size="sm">
          {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
          Re-check now
        </Button>
      </div>

      {overall && (
        <Card className={`p-4 border-l-4 ${
          overall === "healthy" ? "border-l-emerald-500 bg-emerald-50/40" :
          overall === "ssl" ? "border-l-red-500 bg-red-50/40" :
          "border-l-amber-500 bg-amber-50/40"
        }`}>
          <div className="flex items-center gap-2 font-medium">
            {overall === "healthy" ? (
              <><ShieldCheck className="w-5 h-5 text-emerald-600" /> All domains healthy</>
            ) : overall === "ssl" ? (
              <><ShieldAlert className="w-5 h-5 text-red-600" /> SSL certificate problem detected</>
            ) : (
              <><AlertTriangle className="w-5 h-5 text-amber-600" /> One or more domains are unreachable</>
            )}
          </div>
          {lastRun && (
            <p className="text-xs text-muted-foreground mt-1">
              Last checked {formatDistanceToNow(new Date(lastRun), { addSuffix: true })}
            </p>
          )}
        </Card>
      )}

      {err && (
        <Card className="p-4 border-l-4 border-l-red-500 bg-red-50/40 text-sm text-red-800">
          Failed to run health check: {err}
        </Card>
      )}

      <div className="space-y-3">
        {results.map((r) => (
          <Card key={r.domain} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-sm font-semibold hover:underline break-all"
                  >
                    {r.domain}
                  </a>
                  <StatusBadge r={r} />
                  {!DEFAULT_DOMAINS.includes(r.domain) && (
                    <Button variant="ghost" size="sm" onClick={() => removeDomain(r.domain)}>
                      Remove
                    </Button>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  <span>HTTP: {r.status ?? "—"}</span>
                  <span>TLS: {r.tls_ok ? "valid" : "broken"}</span>
                  <span>Latency: {r.duration_ms}ms</span>
                  {r.server && <span>Server: {r.server}</span>}
                  {r.redirected_to && <span>→ {r.redirected_to}</span>}
                </div>
                {r.error_kind !== "none" && (
                  <div className="mt-2 p-2 rounded bg-muted/50 text-xs space-y-1">
                    <div className="font-medium text-foreground">
                      {errorKindLabel[r.error_kind]}
                    </div>
                    {r.error && (
                      <div className="font-mono text-muted-foreground break-all">
                        {r.error}
                      </div>
                    )}
                    <div className="text-muted-foreground">
                      {errorKindHelp[r.error_kind]}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}

        {loading && results.length === 0 && (
          <div className="flex justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <Card className="p-4">
        <h3 className="text-sm font-medium mb-2">Check another domain</h3>
        <div className="flex gap-2">
          <Input
            placeholder="example.com"
            value={customDomain}
            onChange={(e) => setCustomDomain(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCustom()}
          />
          <Button onClick={addCustom} disabled={!customDomain.trim() || loading}>
            Add & check
          </Button>
        </div>
      </Card>
    </div>
  );
}

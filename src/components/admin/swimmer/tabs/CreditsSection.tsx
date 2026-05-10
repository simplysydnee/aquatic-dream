import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Wallet } from "lucide-react";

interface CreditRow {
  id: string;
  amount_cents: number;
  source: string;
  note: string | null;
  used_at: string | null;
  used_against: string | null;
  created_at: string;
}

const fmtMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");

export default function CreditsSection({ parentEmail }: { parentEmail: string }) {
  const [credits, setCredits] = useState<CreditRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!parentEmail) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("client_credits")
        .select("*")
        .ilike("parent_email", parentEmail)
        .order("created_at", { ascending: false });
      if (!cancelled) {
        setCredits((data as CreditRow[]) ?? []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [parentEmail]);

  if (loading || credits.length === 0) return null;

  const unusedTotal = credits
    .filter((c) => !c.used_at)
    .reduce((sum, c) => sum + c.amount_cents, 0);

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Account Credit</span>
        </div>
        <span className="text-lg font-bold text-primary">{fmtMoney(unusedTotal)}</span>
      </div>
      <div className="space-y-1">
        {credits.map((c) => (
          <div key={c.id} className="flex items-center justify-between text-xs">
            <div className="min-w-0">
              <span className="font-medium">{fmtMoney(c.amount_cents)}</span>
              <span className="text-muted-foreground ml-2">
                {c.source.replace(/_/g, " ")} · {fmt(c.created_at)}
              </span>
              {c.note && <div className="text-muted-foreground truncate">{c.note}</div>}
            </div>
            <Badge variant="outline" className={c.used_at ? "text-muted-foreground" : "border-primary/40 text-primary"}>
              {c.used_at ? `Used ${fmt(c.used_at)}` : "Available"}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Wallet, X } from "lucide-react";
import IssueCreditDialog from "./IssueCreditDialog";
import VoidCreditDialog from "./VoidCreditDialog";

interface CreditRow {
  id: string;
  amount_cents: number;
  source: string;
  note: string | null;
  used_at: string | null;
  used_against: string | null;
  voided_at: string | null;
  voided_reason: string | null;
  created_at: string;
}

const fmtMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");

export default function CreditsSection({ parentEmail }: { parentEmail: string }) {
  const [credits, setCredits] = useState<CreditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [issueOpen, setIssueOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<CreditRow | null>(null);

  const load = useCallback(async () => {
    if (!parentEmail) return;
    setLoading(true);
    const { data } = await supabase
      .from("client_credits")
      .select("*")
      .ilike("parent_email", parentEmail)
      .order("created_at", { ascending: false });
    setCredits((data as CreditRow[]) ?? []);
    setLoading(false);
  }, [parentEmail]);

  useEffect(() => { load(); }, [load]);

  if (loading) return null;

  const available = credits.filter((c) => !c.used_at && !c.voided_at);
  const history = credits.filter((c) => c.used_at || c.voided_at);
  const unusedTotal = available.reduce((s, c) => s + c.amount_cents, 0);

  const renderRow = (c: CreditRow, kind: "available" | "history") => (
    <div key={c.id} className="flex items-center justify-between gap-2 text-xs py-1">
      <div className="min-w-0 flex-1">
        <span className="font-medium">{fmtMoney(c.amount_cents)}</span>
        <span className="text-muted-foreground ml-2">
          {c.source.replace(/_/g, " ")} · {fmt(c.created_at)}
        </span>
        {c.note && <div className="text-muted-foreground truncate">{c.note}</div>}
        {c.voided_reason && <div className="text-destructive/80 truncate">Voided: {c.voided_reason}</div>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Badge variant="outline" className={
          c.voided_at ? "border-destructive/40 text-destructive" :
          c.used_at ? "text-muted-foreground" :
          "border-primary/40 text-primary"
        }>
          {c.voided_at ? `Voided ${fmt(c.voided_at)}` :
           c.used_at ? `Used ${fmt(c.used_at)}` :
           "Available"}
        </Badge>
        {kind === "available" && (
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={() => setVoidTarget(c)}
            title="Void this credit"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Account Credit</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-primary">{fmtMoney(unusedTotal)}</span>
            <Button size="sm" variant="outline" className="h-7 px-2 gap-1" onClick={() => setIssueOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Issue
            </Button>
          </div>
        </div>

        {available.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mt-1">Available</p>
            <div className="divide-y divide-border/40">
              {available.map((c) => renderRow(c, "available"))}
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mt-1">History</p>
            <div className="divide-y divide-border/40">
              {history.map((c) => renderRow(c, "history"))}
            </div>
          </div>
        )}

        {credits.length === 0 && (
          <p className="text-xs text-muted-foreground">No credits on file.</p>
        )}
      </div>

      <IssueCreditDialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        parentEmail={parentEmail}
        onIssued={load}
      />
      <VoidCreditDialog
        open={!!voidTarget}
        onOpenChange={(o) => !o && setVoidTarget(null)}
        creditId={voidTarget?.id ?? null}
        amountCents={voidTarget?.amount_cents ?? 0}
        onVoided={load}
      />
    </>
  );
}

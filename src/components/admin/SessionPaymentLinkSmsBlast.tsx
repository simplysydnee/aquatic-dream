import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { getStripeEnvironment } from "@/lib/stripe";

interface Period { id: string; name: string; start_date: string; end_date: string; }

interface PreviewRow {
  enrollmentId: string;
  childName: string;
  phone: string;
}
interface NoPhoneRow {
  enrollmentId: string;
  childName: string;
  parentEmail: string | null;
}

interface PreviewResp {
  dryRun: true;
  eligibleCount: number;
  duplicatePhoneSkipped: number;
  skippedNoPhoneCount: number;
  skippedPaidCount: number;
  eligible: PreviewRow[];
  skippedNoPhone: NoPhoneRow[];
}

interface SendResp {
  dryRun: false;
  sent: number;
  failed: number;
  results: Array<{ enrollmentId: string; childName: string; phone: string; status: "sent" | "failed"; error?: string }>;
  skippedNoPhoneCount: number;
}

export default function SessionPaymentLinkSmsBlast() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState<string>("");
  const [preview, setPreview] = useState<PreviewResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResp | null>(null);

  useEffect(() => {
    supabase.from("session_periods")
      .select("id, name, start_date, end_date")
      .eq("is_active", true)
      .order("start_date")
      .then(({ data }) => {
        const list = (data || []) as Period[];
        setPeriods(list);
        if (list.length && !periodId) setPeriodId(list[list.length - 1].id);
      });
  }, []);

  const runPreview = async () => {
    if (!periodId) return;
    setLoading(true);
    setResult(null);
    const { data, error } = await supabase.functions.invoke("send-session-payment-link-sms-batch", {
      body: { sessionPeriodId: periodId, environment: getStripeEnvironment(), dryRun: true },
    });
    setLoading(false);
    if (error) {
      toast({ title: "Preview failed", description: error.message, variant: "destructive" });
      return;
    }
    setPreview(data as PreviewResp);
    setDialogOpen(true);
  };

  const runSend = async () => {
    if (!periodId) return;
    setSending(true);
    const { data, error } = await supabase.functions.invoke("send-session-payment-link-sms-batch", {
      body: { sessionPeriodId: periodId, environment: getStripeEnvironment(), dryRun: false },
    });
    setSending(false);
    if (error) {
      toast({ title: "Send failed", description: error.message, variant: "destructive" });
      return;
    }
    const r = data as SendResp;
    setResult(r);
    setPreview(null);
    toast({
      title: `Sent ${r.sent} texts`,
      description: r.failed ? `${r.failed} failed — see details` : "All delivered to TextMagic",
    });
  };

  const selectedPeriod = periods.find((p) => p.id === periodId);

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="font-medium flex items-center gap-2">
          <MessageSquare className="w-4 h-4" /> Text payment link to unpaid families
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Sends the Stripe payment link via SMS to every enrolled family in the selected session with an unpaid session fee and a phone on file. Reuses the existing per-enrollment payment link.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Session</label>
          <Select value={periodId} onValueChange={setPeriodId}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Select session" /></SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={runPreview} disabled={!periodId || loading}>
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MessageSquare className="w-4 h-4 mr-2" />}
          Preview recipients
        </Button>
      </div>

      {result && (
        <div className="border-t pt-3 space-y-2">
          <div className="flex items-center gap-3 text-sm">
            <Badge className="bg-emerald-600">{result.sent} sent</Badge>
            {result.failed > 0 && <Badge variant="destructive">{result.failed} failed</Badge>}
            {result.skippedNoPhoneCount > 0 && (
              <span className="text-muted-foreground">{result.skippedNoPhoneCount} had no phone</span>
            )}
          </div>
          {result.failed > 0 && (
            <div className="text-xs">
              <div className="font-medium mb-1">Failures:</div>
              <ul className="list-disc ml-5 space-y-0.5">
                {result.results.filter((r) => r.status === "failed").map((r) => (
                  <li key={r.enrollmentId}>{r.childName} ({r.phone}): {r.error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Send payment link SMS</DialogTitle>
            <DialogDescription>
              {selectedPeriod?.name}: {preview?.eligibleCount ?? 0} unique parent phone{preview?.eligibleCount === 1 ? "" : "s"} will receive the payment link.
            </DialogDescription>
          </DialogHeader>

          {preview && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded bg-muted">
                  <div className="text-xs text-muted-foreground">Will text</div>
                  <div className="text-lg font-semibold">{preview.eligibleCount}</div>
                </div>
                <div className="p-2 rounded bg-muted">
                  <div className="text-xs text-muted-foreground">Already paid / comp</div>
                  <div className="text-lg font-semibold">{preview.skippedPaidCount}</div>
                </div>
                <div className="p-2 rounded bg-muted">
                  <div className="text-xs text-muted-foreground">No phone (skipped)</div>
                  <div className="text-lg font-semibold">{preview.skippedNoPhoneCount}</div>
                </div>
                <div className="p-2 rounded bg-muted">
                  <div className="text-xs text-muted-foreground">Duplicate phone merged</div>
                  <div className="text-lg font-semibold">{preview.duplicatePhoneSkipped}</div>
                </div>
              </div>

              <div className="max-h-56 overflow-y-auto border rounded">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr><th className="text-left px-2 py-1">Child</th><th className="text-left px-2 py-1">Phone</th></tr>
                  </thead>
                  <tbody>
                    {preview.eligible.map((r) => (
                      <tr key={r.enrollmentId} className="border-t">
                        <td className="px-2 py-1">{r.childName}</td>
                        <td className="px-2 py-1 font-mono">{r.phone}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {preview.skippedNoPhone.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  <div className="font-medium mb-1">No phone on file (won't be texted):</div>
                  <div>{preview.skippedNoPhone.map((r) => r.childName).join(", ")}</div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={sending}>Cancel</Button>
            <Button onClick={async () => { await runSend(); setDialogOpen(false); }} disabled={sending || !preview?.eligibleCount}>
              {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Send {preview?.eligibleCount ?? 0} text{preview?.eligibleCount === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type PlanRow = {
  source: "legacy" | "membership";
  phone: string;
  message: string;
  occurrence_id: string;
  swimmer: string;
  time?: string;
};

type PreviewResponse = {
  ok: boolean;
  date: string;
  dry_run: boolean;
  legacy_sent: number;
  membership_sent: number;
  sent: number;
  failed: number;
  suppressed_duplicate_phone: number;
  skipped_no_consent: number;
  skipped_opted_out: number;
  skipped_already_started?: number;
  errors: Array<{ occurrence_id: string; error: string }>;
  would_send?: PlanRow[];
};

const last4 = (phone: string) => {
  const digits = (phone || "").replace(/\D/g, "");
  return digits ? `••• ${digits.slice(-4)}` : "no phone";
};

interface SendRemindersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SendRemindersDialog = ({ open, onOpenChange }: SendRemindersDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPreview(null);
      setError(null);
      setSending(false);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      const { data, error: fnError } = await supabase.functions.invoke(
        "admin-send-todays-reminders",
        { body: { dryRun: true } },
      );
      if (cancelled) return;
      if (fnError) {
        setError(fnError.message);
      } else {
        setPreview(data as PreviewResponse);
      }
      setLoading(false);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const rows = preview?.would_send ?? [];

  const handleSend = async () => {
    setSending(true);
    const { data, error: fnError } = await supabase.functions.invoke(
      "admin-send-todays-reminders",
      { body: { dryRun: false } },
    );
    setSending(false);
    if (fnError) {
      toast.error("Failed to send reminders", { description: fnError.message });
      return;
    }
    const result = data as PreviewResponse;
    if (result?.failed > 0) {
      toast.warning(`Sent ${result.sent}, failed ${result.failed}`, {
        description: (result.errors || []).slice(0, 3).map((e) => e.error).join(", "),
      });
    } else {
      toast.success(`Sent ${result?.sent ?? 0} reminder${result?.sent === 1 ? "" : "s"}`);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Today's reminders preview</DialogTitle>
          <DialogDescription>
            Nothing is sent until you confirm. This list comes straight from the reminder function
            running in preview mode.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Building preview...
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {preview && !loading && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">Date {preview.date}</Badge>
              <Badge variant="secondary">Membership {preview.membership_sent}</Badge>
              <Badge variant="secondary">Legacy {preview.legacy_sent}</Badge>
              <Badge variant="secondary">Duplicates suppressed {preview.suppressed_duplicate_phone}</Badge>
              <Badge variant="secondary">No consent {preview.skipped_no_consent}</Badge>
              <Badge variant="secondary">Opted out {preview.skipped_opted_out}</Badge>
              <Badge variant="secondary">Already started {preview.skipped_already_started ?? 0}</Badge>
              <Badge variant={preview.failed > 0 ? "destructive" : "secondary"}>
                Failed {preview.failed}
              </Badge>
            </div>

            {rows.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">
                No reminders to send for {preview.date}.
              </p>
            ) : (
              <div className="divide-y rounded-md border">
                {rows.map((r) => (
                  <div key={`${r.source}-${r.occurrence_id}`} className="p-3 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <span>{r.swimmer || "Unnamed swimmer"}</span>
                      <span className="text-muted-foreground font-normal">{last4(r.phone)}</span>
                      {r.time && <span className="text-muted-foreground font-normal">{r.time}</span>}
                      <Badge variant="outline" className="text-[10px]">{r.source}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{r.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={loading || sending || rows.length === 0}>
            {sending ? "Sending..." : `Send these ${rows.length} reminder${rows.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

import { useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, CreditCard } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { performCancellation, type CancelTarget } from "@/lib/lessonCancel";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  targets: CancelTarget[];
  onDone?: () => void;
}

const REASONS = [
  "Instructor out",
  "Pool closure",
  "Weather",
  "Low enrollment",
  "Other",
];

const CancelLessonDialog = ({ open, onOpenChange, targets, onDone }: Props) => {
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);

  const totalCredits = targets.reduce(
    (sum, t) => sum + t.swimmers.reduce((s, x) => s + (x.paidAmount || 0), 0),
    0
  );
  const swimmerCount = targets.reduce((n, t) => n + t.swimmers.length, 0);
  const paidCount = targets.reduce(
    (n, t) => n + t.swimmers.filter((s) => s.paidAmount > 0).length,
    0
  );

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await performCancellation({
        targets,
        reason,
        reasonNote: note,
        notifyCustomers: notify,
      });
      toast.success(
        `Cancelled ${targets.length} lesson${targets.length !== 1 ? "s" : ""}` +
          (paidCount > 0 ? ` · ${paidCount} credit${paidCount !== 1 ? "s" : ""} issued` : "")
      );
      onOpenChange(false);
      onDone?.();
    } catch (err: any) {
      toast.error(err?.message || "Failed to cancel");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Cancel {targets.length === 1 ? "this lesson" : `${targets.length} lessons`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Selected lessons preview */}
          <div className="rounded-lg border bg-muted/30 p-3 max-h-40 overflow-y-auto">
            {targets.map((t) => (
              <div key={`${t.kind}-${t.id}`} className="text-xs py-1 flex justify-between gap-2">
                <span className="truncate">
                  <span className="font-medium">{t.title}</span>
                  <span className="text-muted-foreground">
                    {" · "}
                    {(() => {
                      try {
                        return format(new Date(t.date + "T00:00:00"), "MMM d");
                      } catch {
                        return t.date;
                      }
                    })()}
                    {t.timeLabel ? ` · ${t.timeLabel}` : ""}
                  </span>
                </span>
                <span className="text-muted-foreground shrink-0">
                  {t.swimmers.length} {t.swimmers.length === 1 ? "swimmer" : "swimmers"}
                </span>
              </div>
            ))}
          </div>

          {/* Reason */}
          <div>
            <Label className="text-xs">Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="h-9 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Note (optional, included in email)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 text-sm"
              rows={2}
              placeholder="e.g. Coach Sarah out sick, makeup options coming soon."
            />
          </div>

          {/* Credit summary */}
          {swimmerCount > 0 && (
            <div className="rounded-lg border border-coral/30 bg-coral/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <CreditCard className="w-3.5 h-3.5" />
                Account credit
              </div>
              {paidCount === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No paid lessons in this selection — nothing to credit.
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Each paid swimmer will get an account credit they can apply to a future class.
                    No Stripe refund will be issued.
                  </p>
                  <ul className="text-xs space-y-0.5 max-h-32 overflow-y-auto">
                    {targets.flatMap((t) =>
                      t.swimmers
                        .filter((s) => s.paidAmount > 0)
                        .map((s, i) => (
                          <li
                            key={`${t.id}-${i}`}
                            className="flex justify-between"
                          >
                            <span className="truncate">{s.childName}</span>
                            <span className="font-medium text-coral-700">
                              ${s.paidAmount.toFixed(2)}
                            </span>
                          </li>
                        ))
                    )}
                  </ul>
                  <div className="flex justify-between text-xs font-semibold pt-1 border-t border-coral/20">
                    <span>Total credit</span>
                    <span>${totalCredits.toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>
          )}

          <label className="flex items-start gap-2 cursor-pointer">
            <Checkbox checked={notify} onCheckedChange={(v) => setNotify(!!v)} className="mt-0.5" />
            <span className="text-sm">
              Email affected parents now
              <span className="block text-xs text-muted-foreground">
                Sends one cancellation email per parent with the credit amount and reason.
              </span>
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Keep lesson
            </Button>
            <Button variant="destructive" onClick={handleConfirm} disabled={busy}>
              {busy ? "Cancelling…" : "Cancel lesson" + (targets.length > 1 ? "s" : "")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CancelLessonDialog;

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: number;
  parentName: string;
  lessonDate: string; // YYYY-MM-DD
  onConfirm: () => Promise<void> | void;
}

export default function ChargeConfirmDialog({
  open,
  onOpenChange,
  amount,
  parentName,
  lessonDate,
  onConfirm,
}: Props) {
  const [busy, setBusy] = useState(false);
  const dateLabel = lessonDate
    ? format(new Date(lessonDate + "T00:00:00"), "EEEE, MMMM d, yyyy")
    : "";

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Charge card on file?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 pt-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-semibold text-foreground">${amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Parent</span>
                <span className="font-medium text-foreground">{parentName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Lesson date</span>
                <span className="font-medium text-foreground">{dateLabel}</span>
              </div>
              <p className="text-xs text-muted-foreground pt-2">
                This immediately charges the saved card. No automatic charges run otherwise.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={busy}
          >
            {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            Charge ${amount.toFixed(2)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

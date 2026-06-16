import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import BookingWizard, { type BookingWizardProps } from "./BookingWizard";

interface Props extends Pick<BookingWizardProps, "initialSlot" | "initialType" | "lockedSlot"> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBooked: () => void;
}

export default function BookingQuickDialog({ open, onOpenChange, onBooked, initialSlot, initialType, lockedSlot }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <div>
              <DialogTitle>Book a lesson</DialogTitle>
              <DialogDescription>Pick the client, the type, and the slot(s).</DialogDescription>
            </div>
            <Link
              to="/admin/private-lessons/new"
              onClick={() => onOpenChange(false)}
              className="text-xs text-primary hover:underline inline-flex items-center gap-1 shrink-0"
            >
              Open full page <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </DialogHeader>
        <BookingWizard
          initialSlot={initialSlot}
          initialType={initialType}
          compact
          onCancel={() => onOpenChange(false)}
          onDone={() => { onBooked(); onOpenChange(false); }}
        />
      </DialogContent>
    </Dialog>
  );
}

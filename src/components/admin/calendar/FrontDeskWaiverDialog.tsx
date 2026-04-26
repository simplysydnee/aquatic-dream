import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import LegalAgreements, {
  type LegalAgreementData,
} from "@/components/swim-enrollment/LegalAgreements";
import { submitLessonWaiver } from "@/lib/lessonWaiver";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  booking: {
    id: string;
    waiver_token: string;
    parent_name: string;
    parent_email: string;
    child_name: string | null;
    lesson_type: string;
  } | null;
  onSigned: () => void;
}

const FrontDeskWaiverDialog = ({ open, onOpenChange, booking, onSigned }: Props) => {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!booking) return null;

  const handleSubmit = async (data: LegalAgreementData) => {
    setSubmitting(true);
    try {
      await submitLessonWaiver({
        token: booking.waiver_token,
        bookingId: booking.id,
        parentEmail: booking.parent_email,
        data,
      });
      setDone(true);
      onSigned();
      toast({ title: "Waiver signed at front desk" });
    } catch (e: any) {
      toast({
        title: "Could not save waiver",
        description: e?.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = (v: boolean) => {
    if (!v) setDone(false);
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Front-Desk Waiver — {booking.child_name || booking.parent_name}
          </DialogTitle>
        </DialogHeader>
        {done ? (
          <div className="py-8 text-center space-y-4">
            <CheckCircle2 className="w-16 h-16 text-primary mx-auto" />
            <p className="text-lg font-medium">Waiver signed</p>
            <Button onClick={() => handleClose(false)}>Close</Button>
          </div>
        ) : (
          <>
            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 text-sm mb-4">
              <strong>Front-desk mode:</strong> please hand the device to the
              parent or guardian — they must sign personally.
            </div>
            <LegalAgreements
              parentName={booking.parent_name}
              childName={booking.child_name || booking.parent_name}
              onSubmit={handleSubmit}
              onBack={() => handleClose(false)}
              submitting={submitting}
              hideBack
              submitLabel="Sign & Submit Waiver"
              submittingLabel="Submitting..."
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default FrontDeskWaiverDialog;

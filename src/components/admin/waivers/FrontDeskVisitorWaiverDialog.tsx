import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import VisitorWaiverForm from "@/components/waivers/VisitorWaiverForm";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSigned: () => void;
}

const FrontDeskVisitorWaiverDialog = ({ open, onOpenChange, onSigned }: Props) => {
  const [signed, setSigned] = useState(false);

  const handleDone = () => {
    setSigned(false);
    onSigned();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (signed && !v) {
          // Treat dialog dismiss while in success state as Done
          handleDone();
          return;
        }
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Front-Desk Pool Waiver</DialogTitle>
        </DialogHeader>

        {signed ? (
          <div className="py-12 text-center space-y-4 max-w-md mx-auto">
            <CheckCircle2 className="w-16 h-16 text-primary mx-auto" />
            <h2 className="font-display text-2xl font-bold">Waiver received</h2>
            <p className="text-muted-foreground">
              Thank you. A copy has been emailed to the signer. Please return the device to the front desk.
            </p>
            <Button onClick={handleDone}>Done</Button>
          </div>
        ) : (
          <>
            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 text-sm mb-4">
              <strong>Front-desk mode:</strong> hand the device to the signer — they must
              fill in their own information and sign personally.
            </div>
            <VisitorWaiverForm
              source="kiosk"
              submitLabel="Sign & Submit"
              hideSuccessScreen
              onSubmitted={() => setSigned(true)}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default FrontDeskVisitorWaiverDialog;

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import VisitorWaiverForm from "@/components/waivers/VisitorWaiverForm";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSigned: () => void;
}

const FrontDeskVisitorWaiverDialog = ({ open, onOpenChange, onSigned }: Props) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Front-Desk Pool Waiver</DialogTitle>
        </DialogHeader>
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 text-sm mb-4">
          <strong>Front-desk mode:</strong> hand the device to the signer — they must
          fill in their own information and sign personally.
        </div>
        <VisitorWaiverForm
          source="kiosk"
          submitLabel="Sign & Submit"
          onSubmitted={() => {
            onSigned();
          }}
        />
      </DialogContent>
    </Dialog>
  );
};

export default FrontDeskVisitorWaiverDialog;

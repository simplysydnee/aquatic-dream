import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import LegalAgreements, { type LegalAgreementData } from "@/components/swim-enrollment/LegalAgreements";
import { supabase } from "@/integrations/supabase/client";
import {
  WAIVER_VERSION,
  TOS_VERSION,
  PRIVACY_POLICY_VERSION,
} from "@/components/swim-enrollment/legal-content";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  enrollment: {
    id: string;
    parent_name: string;
    parent_email: string;
    child_name: string;
  } | null;
  onSigned: () => void;
}

const FrontDeskEnrollmentWaiverDialog = ({ open, onOpenChange, enrollment, onSigned }: Props) => {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!enrollment) return null;

  const handleSubmit = async (data: LegalAgreementData) => {
    setSubmitting(true);
    try {
      const { error } = await supabase.from("enrollment_agreements").insert({
        enrollment_id: enrollment.id,
        signer_name: data.signatureText,
        signer_email: enrollment.parent_email,
        signature_text: data.signatureText,
        waiver_accepted: data.waiverAccepted,
        privacy_policy_accepted: data.privacyPolicyAccepted,
        terms_accepted: data.termsAccepted,
        photo_release_accepted: data.photoReleaseAccepted === "yes",
        emergency_contact_name: data.emergencyContactName,
        emergency_contact_phone: data.emergencyContactPhone,
        emergency_contact_relationship: data.emergencyContactRelationship,
        emergency_contact_first_name: data.emergencyContactFirstName,
        emergency_contact_last_name: data.emergencyContactLastName,
        signer_first_name: data.signatureText.split(" ")[0] || data.signatureText,
        signer_last_name: data.signatureText.split(" ").slice(1).join(" ") || "",
        waiver_version: WAIVER_VERSION,
        tos_version: TOS_VERSION,
        privacy_policy_version: PRIVACY_POLICY_VERSION,
      } as any);
      if (error) throw error;
      setDone(true);
      onSigned();
      toast({ title: "Waiver signed at front desk" });
    } catch (e: any) {
      toast({ title: "Could not save waiver", description: e?.message, variant: "destructive" });
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
          <DialogTitle>Front-Desk Waiver — {enrollment.child_name}</DialogTitle>
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
              parentName={enrollment.parent_name}
              childName={enrollment.child_name}
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

export default FrontDeskEnrollmentWaiverDialog;

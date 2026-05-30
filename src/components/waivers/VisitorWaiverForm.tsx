import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LegalAgreements, {
  type LegalAgreementData,
} from "@/components/swim-enrollment/LegalAgreements";
import SwimmersCoveredFields from "./SwimmersCoveredFields";
import { submitVisitorWaiver, type SwimmerCovered } from "@/lib/visitorWaiver";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2 } from "lucide-react";

interface Props {
  source: "public" | "kiosk";
  onSubmitted?: (id: string) => void;
  hideSuccessScreen?: boolean;
  submitLabel?: string;
}

const VisitorWaiverForm = ({ source, onSubmitted, hideSuccessScreen, submitLabel }: Props) => {
  const { toast } = useToast();
  const [step, setStep] = useState<"contact" | "legal" | "done">("contact");
  const [submitting, setSubmitting] = useState(false);

  const [signerFirstName, setSignerFirstName] = useState("");
  const [signerLastName, setSignerLastName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [signerPhone, setSignerPhone] = useState("");
  const [swimmers, setSwimmers] = useState<SwimmerCovered[]>([
    { first_name: "", last_name: "", dob: "", relationship: "" },
  ]);
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({});
  const [swimmerErrors, setSwimmerErrors] = useState<
    Record<number, Partial<Record<keyof SwimmerCovered, string>>>
  >({});

  const signerFullName = useMemo(
    () => `${signerFirstName} ${signerLastName}`.trim(),
    [signerFirstName, signerLastName],
  );

  const validateContact = (): boolean => {
    const errs: Record<string, string> = {};
    if (!signerFirstName.trim()) errs.signerFirstName = "Required";
    if (!signerLastName.trim()) errs.signerLastName = "Required";
    if (!signerEmail.trim() || !/.+@.+\..+/.test(signerEmail)) errs.signerEmail = "Valid email required";

    const sErrs: typeof swimmerErrors = {};
    swimmers.forEach((s, i) => {
      const e: Partial<Record<keyof SwimmerCovered, string>> = {};
      if (!s.first_name.trim()) e.first_name = "Required";
      if (!s.last_name.trim()) e.last_name = "Required";
      if (Object.keys(e).length) sErrs[i] = e;
    });

    setContactErrors(errs);
    setSwimmerErrors(sErrs);
    return Object.keys(errs).length === 0 && Object.keys(sErrs).length === 0;
  };

  const handleLegalSubmit = async (legal: LegalAgreementData) => {
    setSubmitting(true);
    try {
      const { id } = await submitVisitorWaiver({
        legal,
        signerFirstName,
        signerLastName,
        signerEmail,
        signerPhone,
        swimmers,
        source,
      });
      toast({
        title: "Waiver signed",
        description: "A copy has been emailed to you.",
      });
      onSubmitted?.(id);
      if (!hideSuccessScreen) setStep("done");
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

  if (step === "done") {
    return (
      <div className="py-12 text-center space-y-4 max-w-md mx-auto">
        <CheckCircle2 className="w-16 h-16 text-primary mx-auto" />
        <h2 className="font-display text-2xl font-bold">Waiver received</h2>
        <p className="text-muted-foreground">
          Thank you, {signerFullName}. A copy of your signed waiver will be emailed to{" "}
          <strong>{signerEmail}</strong>.
        </p>
        <Button
          variant="outline"
          onClick={() => {
            setSignerFirstName("");
            setSignerLastName("");
            setSignerEmail("");
            setSignerPhone("");
            setSwimmers([{ first_name: "", last_name: "", dob: "", relationship: "" }]);
            setStep("contact");
          }}
        >
          Sign another waiver
        </Button>
      </div>
    );
  }

  if (step === "legal") {
    return (
      <LegalAgreements
        parentName={signerFullName}
        childName={swimmers[0]?.first_name || signerFullName}
        onSubmit={handleLegalSubmit}
        onBack={() => setStep("contact")}
        submitting={submitting}
        submitLabel={submitLabel ?? "Sign & Submit Waiver"}
        submittingLabel="Submitting..."
        headerTitle="Sign your waiver"
        headerSubtitle={
          <p>
            Review and accept the following documents. By signing you confirm the waiver
            covers everyone listed in the previous step.
          </p>
        }
      />
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="border border-border rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Your information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="signerFirstName" className="text-xs">First name *</Label>
            <Input
              id="signerFirstName"
              value={signerFirstName}
              onChange={(e) => setSignerFirstName(e.target.value)}
            />
            {contactErrors.signerFirstName && (
              <p className="text-xs text-destructive mt-1">{contactErrors.signerFirstName}</p>
            )}
          </div>
          <div>
            <Label htmlFor="signerLastName" className="text-xs">Last name *</Label>
            <Input
              id="signerLastName"
              value={signerLastName}
              onChange={(e) => setSignerLastName(e.target.value)}
            />
            {contactErrors.signerLastName && (
              <p className="text-xs text-destructive mt-1">{contactErrors.signerLastName}</p>
            )}
          </div>
          <div>
            <Label htmlFor="signerEmail" className="text-xs">Email *</Label>
            <Input
              id="signerEmail"
              type="email"
              value={signerEmail}
              onChange={(e) => setSignerEmail(e.target.value)}
            />
            {contactErrors.signerEmail && (
              <p className="text-xs text-destructive mt-1">{contactErrors.signerEmail}</p>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">
              We'll email you a copy of the signed waiver.
            </p>
          </div>
          <div>
            <Label htmlFor="signerPhone" className="text-xs">Phone</Label>
            <Input
              id="signerPhone"
              type="tel"
              value={signerPhone}
              onChange={(e) => setSignerPhone(e.target.value)}
            />
          </div>
        </div>
      </div>

      <SwimmersCoveredFields
        swimmers={swimmers}
        onChange={setSwimmers}
        errors={swimmerErrors}
      />

      <div className="flex justify-end">
        <Button
          className="bg-coral hover:bg-coral/90 text-coral-foreground"
          onClick={() => {
            if (validateContact()) setStep("legal");
          }}
        >
          Continue to legal agreements
        </Button>
      </div>
    </div>
  );
};

export default VisitorWaiverForm;

import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ChevronLeft, ChevronRight, ShieldCheck, FileText, Scale } from "lucide-react";
import { z } from "zod";
import {
  LIABILITY_WAIVER_TEXT,
  PRIVACY_POLICY_TEXT,
  TERMS_OF_SERVICE_TEXT,
} from "./legal-content";

const legalSchema = z.object({
  waiverAccepted: z.literal(true, { errorMap: () => ({ message: "You must accept the liability waiver" }) }),
  privacyPolicyAccepted: z.literal(true, { errorMap: () => ({ message: "You must accept the privacy policy" }) }),
  termsAccepted: z.literal(true, { errorMap: () => ({ message: "You must accept the terms of service" }) }),
  photoReleaseAccepted: z.enum(["yes", "no"], { errorMap: () => ({ message: "Please select Yes or No" }) }),
  signatureText: z.string().trim().min(2, "Please type your full legal name"),
  emergencyContactFirstName: z.string().trim().min(1, "Required"),
  emergencyContactLastName: z.string().trim().min(1, "Required"),
  emergencyContactPhone: z.string().trim().min(7, "Valid phone number required"),
  emergencyContactRelationship: z.string().trim().min(1, "Required"),
});

type ParsedLegal = z.infer<typeof legalSchema>;

// Public surface keeps the legacy combined `emergencyContactName` so downstream
// payload shape (signer agreement insert, emails) stays unchanged.
export type LegalAgreementData = ParsedLegal & {
  emergencyContactName: string;
};

const DocumentSection = ({
  title,
  icon: Icon,
  text,
  accepted,
  onAcceptChange,
  error,
  checkboxLabel,
  id,
}: {
  title: string;
  icon: React.ElementType;
  text: string;
  accepted: boolean;
  onAcceptChange: (v: boolean) => void;
  error?: string;
  checkboxLabel: string;
  id?: string;
}) => (
  <div id={id} className="border border-border rounded-lg overflow-hidden">
    <div className="bg-muted/50 px-4 py-3 flex items-center gap-2 border-b border-border">
      <Icon className="w-4 h-4 text-primary" />
      <h4 className="font-semibold text-sm text-foreground">{title}</h4>
    </div>
    <ScrollArea className="h-64 sm:h-48 max-h-[40vh] p-4">
      <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">
        {text}
      </pre>
    </ScrollArea>
    <div className="px-4 py-3 border-t border-border bg-muted/30">
      <div className="flex items-start gap-2">
        <Checkbox
          id={`accept-${title}`}
          checked={accepted}
          onCheckedChange={(v) => onAcceptChange(v === true)}
        />
        <Label
          htmlFor={`accept-${title}`}
          className="text-sm cursor-pointer leading-snug"
        >
          {checkboxLabel}
        </Label>
      </div>
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  </div>
);

interface Props {
  parentName: string;
  childName: string;
  onSubmit: (data: LegalAgreementData) => void;
  onBack: () => void;
  submitting: boolean;
  defaultEmergencyContactFirstName?: string;
  defaultEmergencyContactLastName?: string;
  defaultEmergencyContactPhone?: string;
  defaultEmergencyContactRelationship?: string;
  signerFirstName?: string;
  signerLastName?: string;
  signerPhone?: string;
  signerLabel?: string;
  signerRelationshipDefault?: string;
  lockFieldsOnSameAsSigner?: boolean;
  showAddAnother?: boolean;
  onAddAnother?: (data: LegalAgreementData) => void;
  submitLabel?: string;
  submittingLabel?: string;
  hideBack?: boolean;
  headerTitle?: string;
  headerSubtitle?: React.ReactNode;
}

const LegalAgreements = ({ parentName, childName, onSubmit, onBack, submitting, defaultEmergencyContactFirstName, defaultEmergencyContactLastName, defaultEmergencyContactPhone, defaultEmergencyContactRelationship, signerFirstName, signerLastName, signerPhone, signerLabel, signerRelationshipDefault = "Self", lockFieldsOnSameAsSigner = true, showAddAnother, onAddAnother, submitLabel, submittingLabel, hideBack, headerTitle, headerSubtitle }: Props) => {
  const [form, setForm] = useState({
    waiverAccepted: false,
    privacyPolicyAccepted: false,
    termsAccepted: false,
    photoReleaseAccepted: "" as any,
    signatureText: parentName || "",
    emergencyContactFirstName: defaultEmergencyContactFirstName || "",
    emergencyContactLastName: defaultEmergencyContactLastName || "",
    emergencyContactPhone: defaultEmergencyContactPhone || "",
    emergencyContactRelationship: defaultEmergencyContactRelationship || "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sameAsSigner, setSameAsSigner] = useState(false);

  const fillEmergencyFromSigner = (checked: boolean) => {
    setSameAsSigner(checked);
    if (checked) {
      setForm((prev) => ({
        ...prev,
        emergencyContactFirstName: signerFirstName || prev.emergencyContactFirstName,
        emergencyContactLastName: signerLastName || prev.emergencyContactLastName,
        emergencyContactPhone: signerPhone || prev.emergencyContactPhone,
        emergencyContactRelationship: signerRelationshipDefault,
      }));
      setErrors((prev) => ({
        ...prev,
        emergencyContactFirstName: "",
        emergencyContactLastName: "",
        emergencyContactPhone: "",
        emergencyContactRelationship: "",
      }));
    } else {
      // Clear auto-filled values so the parent can type their own contact.
      setForm((prev) => ({
        ...prev,
        emergencyContactFirstName: "",
        emergencyContactLastName: "",
        emergencyContactPhone: "",
        emergencyContactRelationship: "",
      }));
    }
  };

  const validate = (): LegalAgreementData | null => {
    const result = legalSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        fieldErrors[issue.path[0] as string] = issue.message;
      });
      setErrors(fieldErrors);
      return null;
    }
    setErrors({});
    return {
      ...result.data,
      emergencyContactName: `${result.data.emergencyContactFirstName} ${result.data.emergencyContactLastName}`.trim(),
    };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = validate();
    if (data) onSubmit(data);
  };

  const handleAddAnother = () => {
    const data = validate();
    if (data && onAddAnother) onAddAnother(data);
  };

  const update = (key: string, value: string | boolean) => {
    setForm({ ...form, [key]: value });
    if (errors[key]) setErrors({ ...errors, [key]: "" });
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      className="max-w-2xl mx-auto"
    >
      <h3 className="font-display text-2xl font-bold text-foreground mb-1">
        {headerTitle ?? "Legal Agreements"}
      </h3>
      <div className="text-muted-foreground text-sm mb-6">
        {headerSubtitle ?? (
          <p>
            Please review and accept the following documents for{" "}
            <span className="font-medium text-foreground">{childName}</span>'s enrollment.
          </p>
        )}
      </div>

      {/* UETA Disclosure */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">
              Electronic Signature Disclosure
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              In accordance with the California Uniform Electronic Transactions Act (UETA)
              and the federal ESIGN Act, by typing your name and clicking "Complete Enrollment"
              below, you agree that your electronic signature has the same legal effect,
              validity, and enforceability as a handwritten signature. You consent to
              conduct this transaction electronically. A copy of the signed documents
              will be emailed to you.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Liability Waiver */}
        <DocumentSection
          title="Waiver and Release of Liability"
          icon={Scale}
          text={LIABILITY_WAIVER_TEXT}
          accepted={form.waiverAccepted}
          onAcceptChange={(v) => update("waiverAccepted", v)}
          error={errors.waiverAccepted}
          checkboxLabel="I have read and agree to the Waiver and Release of Liability *"
        />

        {/* Privacy Policy */}
        <DocumentSection
          title="Privacy Policy"
          icon={ShieldCheck}
          text={PRIVACY_POLICY_TEXT}
          accepted={form.privacyPolicyAccepted}
          onAcceptChange={(v) => update("privacyPolicyAccepted", v)}
          error={errors.privacyPolicyAccepted}
          checkboxLabel="I have read and agree to the Privacy Policy *"
        />

        {/* Terms of Service */}
        <DocumentSection
          title="Terms of Service"
          icon={FileText}
          text={TERMS_OF_SERVICE_TEXT}
          accepted={form.termsAccepted}
          onAcceptChange={(v) => update("termsAccepted", v)}
          error={errors.termsAccepted}
          checkboxLabel="I have read and agree to the Terms of Service *"
        />

        {/* Photo Release */}
        <div className="border border-border rounded-lg p-4">
          <h4 className="text-sm font-semibold text-foreground mb-1">
            Photo & Video Release *
          </h4>
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">
            I grant Aquatic Dreams Swim School permission to use photographs and/or
            video of my child taken during swim lessons for promotional purposes,
            including the website, social media, and printed materials. This consent
            is optional and will not affect enrollment.
          </p>
          <RadioGroup
            value={form.photoReleaseAccepted}
            onValueChange={(v) => update("photoReleaseAccepted", v)}
            className="flex gap-6"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="yes" id="photo-yes" />
              <Label htmlFor="photo-yes" className="text-sm cursor-pointer">Yes, I consent</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="no" id="photo-no" />
              <Label htmlFor="photo-no" className="text-sm cursor-pointer">No, I decline</Label>
            </div>
          </RadioGroup>
          {errors.photoReleaseAccepted && (
            <p className="text-xs text-destructive mt-1">{errors.photoReleaseAccepted}</p>
          )}
        </div>

        {/* Emergency Contact */}
        <div className="border border-border rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-semibold text-foreground">
            Emergency Contact Information *
          </h4>
          <p className="text-xs text-muted-foreground">
            Required per the liability waiver. This person will be contacted in case of emergency.
          </p>
          {signerFirstName && signerLastName && (
            <div className="flex items-start gap-2">
              <Checkbox
                id="same-as-signer"
                checked={sameAsSigner}
                onCheckedChange={(v) => fillEmergencyFromSigner(v === true)}
              />
              <Label htmlFor="same-as-signer" className="text-sm cursor-pointer leading-snug">
                {signerLabel ?? `Same as person completing this form (${signerFirstName} ${signerLastName})`}
              </Label>
            </div>
          )}
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            <div>
              <Label htmlFor="emergencyContactFirstName" className="text-xs">First Name</Label>
              <Input
                id="emergencyContactFirstName"
                value={form.emergencyContactFirstName}
                onChange={(e) => update("emergencyContactFirstName", e.target.value)}
                className="mt-1"
                placeholder="First name"
                readOnly={lockFieldsOnSameAsSigner && sameAsSigner}
              />
              {errors.emergencyContactFirstName && (
                <p className="text-xs text-destructive mt-1">{errors.emergencyContactFirstName}</p>
              )}
            </div>
            <div>
              <Label htmlFor="emergencyContactLastName" className="text-xs">Last Name</Label>
              <Input
                id="emergencyContactLastName"
                value={form.emergencyContactLastName}
                onChange={(e) => update("emergencyContactLastName", e.target.value)}
                className="mt-1"
                placeholder="Last name"
                readOnly={lockFieldsOnSameAsSigner && sameAsSigner}
              />
              {errors.emergencyContactLastName && (
                <p className="text-xs text-destructive mt-1">{errors.emergencyContactLastName}</p>
              )}
            </div>
            <div>
              <Label htmlFor="emergencyContactRelationship" className="text-xs">Relationship</Label>
              <Input
                id="emergencyContactRelationship"
                value={form.emergencyContactRelationship}
                onChange={(e) => update("emergencyContactRelationship", e.target.value)}
                className="mt-1"
                placeholder="e.g. Spouse, Grandparent"
                readOnly={lockFieldsOnSameAsSigner && sameAsSigner}
              />
              {errors.emergencyContactRelationship && (
                <p className="text-xs text-destructive mt-1">{errors.emergencyContactRelationship}</p>
              )}
            </div>
            <div>
              <Label htmlFor="emergencyContactPhone" className="text-xs">Phone</Label>
              <Input
                id="emergencyContactPhone"
                type="tel"
                value={form.emergencyContactPhone}
                onChange={(e) => update("emergencyContactPhone", e.target.value)}
                className="mt-1"
                placeholder="(209) 555-0000"
                readOnly={lockFieldsOnSameAsSigner && sameAsSigner}
              />
              {errors.emergencyContactPhone && (
                <p className="text-xs text-destructive mt-1">{errors.emergencyContactPhone}</p>
              )}
            </div>
          </div>
        </div>

        {/* Signature */}
        <div className="border-2 border-primary/30 rounded-lg p-4 bg-primary/5 space-y-3">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Scale className="w-4 h-4 text-primary" />
            Electronic Signature *
          </h4>
          <p className="text-xs text-muted-foreground">
            By typing your full legal name below, you confirm that you are the parent or
            legal guardian of <span className="font-medium text-foreground">{childName}</span>,
            that you are at least 18 years old, and that you have read and agree to all
            documents above.
          </p>
          <div>
            <Label htmlFor="signatureText" className="text-xs">
              Type your full legal name as your signature
            </Label>
            <Input
              id="signatureText"
              value={form.signatureText}
              onChange={(e) => update("signatureText", e.target.value)}
              className="mt-1 font-serif italic text-lg border-b-2 border-primary/40"
              placeholder={parentName || "Your full legal name"}
            />
            {errors.signatureText && (
              <p className="text-xs text-destructive mt-1">{errors.signatureText}</p>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Signing date: {new Date().toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row justify-between gap-3 pt-4">
          {hideBack ? (
            <span />
          ) : (
            <Button type="button" variant="ghost" onClick={onBack} className="w-full sm:w-auto">
              <ChevronLeft className="mr-1 w-4 h-4" /> Back
            </Button>
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            {showAddAnother && onAddAnother && (
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={handleAddAnother}
                className="w-full sm:w-auto"
              >
                Add Another Swimmer
              </Button>
            )}
            <Button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto bg-coral hover:bg-coral/90 text-coral-foreground"
            >
              {submitting ? (submittingLabel ?? "Enrolling...") : (submitLabel ?? "Complete Enrollment")}{" "}
              <ChevronRight className="ml-1 w-4 h-4" />
            </Button>
          </div>
        </div>
      </form>
    </motion.div>
  );
};

export default LegalAgreements;

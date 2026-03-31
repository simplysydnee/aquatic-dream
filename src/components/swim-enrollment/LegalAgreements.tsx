import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
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
  photoReleaseAccepted: z.boolean(),
  signatureText: z.string().trim().min(2, "Please type your full legal name"),
  emergencyContactName: z.string().trim().min(1, "Required"),
  emergencyContactPhone: z.string().trim().min(7, "Valid phone number required"),
  emergencyContactRelationship: z.string().trim().min(1, "Required"),
});

export type LegalAgreementData = z.infer<typeof legalSchema>;

interface Props {
  parentName: string;
  childName: string;
  onSubmit: (data: LegalAgreementData) => void;
  onBack: () => void;
  submitting: boolean;
}

const DocumentSection = ({
  title,
  icon: Icon,
  text,
  accepted,
  onAcceptChange,
  error,
  checkboxLabel,
}: {
  title: string;
  icon: React.ElementType;
  text: string;
  accepted: boolean;
  onAcceptChange: (v: boolean) => void;
  error?: string;
  checkboxLabel: string;
}) => (
  <div className="border border-border rounded-lg overflow-hidden">
    <div className="bg-muted/50 px-4 py-3 flex items-center gap-2 border-b border-border">
      <Icon className="w-4 h-4 text-primary" />
      <h4 className="font-semibold text-sm text-foreground">{title}</h4>
    </div>
    <ScrollArea className="h-48 p-4">
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

const LegalAgreements = ({ parentName, childName, onSubmit, onBack, submitting }: Props) => {
  const [form, setForm] = useState({
    waiverAccepted: false,
    privacyPolicyAccepted: false,
    termsAccepted: false,
    photoReleaseAccepted: false,
    signatureText: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    emergencyContactRelationship: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = legalSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        fieldErrors[issue.path[0] as string] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    onSubmit(result.data);
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
        Legal Agreements
      </h3>
      <p className="text-muted-foreground text-sm mb-6">
        Please review and accept the following documents for{" "}
        <span className="font-medium text-foreground">{childName}</span>'s enrollment.
      </p>

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
              conduct this transaction electronically and acknowledge that you may request
              a paper copy of these documents at any time by contacting us at
              info@aquaticdreams.com or (209) 577-3483.
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
          <div className="flex items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-1">
                Photo & Video Release (Optional)
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                I grant Aquatic Dreams Swim School permission to use photographs and/or
                video of my child taken during swim lessons for promotional purposes,
                including the website, social media, and printed materials. This consent
                is optional and will not affect enrollment.
              </p>
            </div>
            <Switch
              checked={form.photoReleaseAccepted}
              onCheckedChange={(v) => update("photoReleaseAccepted", v)}
            />
          </div>
          <p className="text-xs mt-2 font-medium text-muted-foreground">
            {form.photoReleaseAccepted ? "✓ Photo release granted" : "Photo release declined"}
          </p>
        </div>

        {/* Emergency Contact */}
        <div className="border border-border rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-semibold text-foreground">
            Emergency Contact Information *
          </h4>
          <p className="text-xs text-muted-foreground">
            Required per the liability waiver. This person will be contacted in case of emergency.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="emergencyContactName" className="text-xs">Name</Label>
              <Input
                id="emergencyContactName"
                value={form.emergencyContactName}
                onChange={(e) => update("emergencyContactName", e.target.value)}
                className="mt-1"
                placeholder="Full name"
              />
              {errors.emergencyContactName && (
                <p className="text-xs text-destructive mt-1">{errors.emergencyContactName}</p>
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
        <div className="flex justify-between pt-4">
          <Button type="button" variant="ghost" onClick={onBack}>
            <ChevronLeft className="mr-1 w-4 h-4" /> Back
          </Button>
          <Button
            type="submit"
            disabled={submitting}
            className="bg-coral hover:bg-coral/90 text-coral-foreground"
          >
            {submitting ? "Enrolling..." : "Complete Enrollment"}{" "}
            <ChevronRight className="ml-1 w-4 h-4" />
          </Button>
        </div>
      </form>
    </motion.div>
  );
};

export default LegalAgreements;

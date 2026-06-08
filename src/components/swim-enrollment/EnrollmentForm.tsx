import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { z } from "zod";

const enrollmentSchema = z.object({
  parentFirstName: z.string().trim().min(1, "Required").max(100),
  parentLastName: z.string().trim().min(1, "Required").max(100),
  parentEmail: z.string().trim().email("Invalid email").max(255),
  parentPhone: z.string().trim().max(20).optional(),
  childFirstName: z.string().trim().min(1, "Required").max(100),
  childLastName: z.string().trim().min(1, "Required").max(100),
  notes: z.string().trim().max(500).optional(),
  isFirstTime: z.enum(["yes", "no"], { required_error: "Please select one" }),
  hasMedical: z.enum(["yes", "no"], { required_error: "Please select one" }),
  medicalNotes: z.string().trim().max(1000).optional(),
  smsConsent: z.boolean().default(false),
}).refine(
  (data) => data.hasMedical !== "yes" || (data.medicalNotes && data.medicalNotes.length > 0),
  { message: "Please describe the medical conditions or allergies", path: ["medicalNotes"] }
).refine(
  // If they checked SMS consent they must have provided a phone number.
  (data) => !data.smsConsent || (data.parentPhone && data.parentPhone.trim().length >= 7),
  { message: "Phone number is required to receive text messages", path: ["parentPhone"] }
);

type ParsedEnrollment = z.infer<typeof enrollmentSchema>;

// Public surface kept backward-compatible: includes derived combined `parentName` and `childName`
// so the rest of the flow (checkout payload, Stripe metadata, emails) keeps working without changes.
export type EnrollmentFormData = ParsedEnrollment & {
  parentName: string;
  childName: string;
};

interface Props {
  onSubmit: (data: EnrollmentFormData) => void;
  onBack: () => void;
  submitting: boolean;
  defaultParentFirstName?: string;
  defaultParentLastName?: string;
  defaultParentEmail?: string;
  defaultParentPhone?: string;
}

const EnrollmentForm = ({ onSubmit, onBack, submitting, defaultParentFirstName, defaultParentLastName, defaultParentEmail, defaultParentPhone }: Props) => {
  const [form, setForm] = useState({
    parentFirstName: defaultParentFirstName || "",
    parentLastName: defaultParentLastName || "",
    parentEmail: defaultParentEmail || "",
    parentPhone: defaultParentPhone || "",
    childFirstName: "",
    childLastName: "",
    notes: "",
    isFirstTime: "" as "" | "yes" | "no",
    hasMedical: "" as "" | "yes" | "no",
    medicalNotes: "",
    smsConsent: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = enrollmentSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        fieldErrors[issue.path[0] as string] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    const d = result.data;
    onSubmit({
      ...d,
      parentName: `${d.parentFirstName} ${d.parentLastName}`.trim(),
      childName: `${d.childFirstName} ${d.childLastName}`.trim(),
    });
  };

  const update = (key: string, value: string | boolean) => {
    setForm({ ...form, [key]: value });
    if (errors[key]) setErrors({ ...errors, [key]: "" });
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      className="max-w-lg mx-auto"
    >
      <h3 className="font-display text-2xl font-bold text-foreground mb-1">
        Parent & Child Info
      </h3>
      <p className="text-muted-foreground text-sm mb-6">
        Almost there! We just need a few details. Please use your swimmer's full legal name.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Parent / Guardian */}
        <div>
          <Label className="text-sm font-semibold">Parent / Guardian Name *</Label>
          <div className="grid gap-3 sm:grid-cols-2 mt-1">
            <div>
              <Input
                id="parentFirstName"
                placeholder="First name"
                value={form.parentFirstName}
                onChange={(e) => update("parentFirstName", e.target.value)}
              />
              {errors.parentFirstName && <p className="text-xs text-destructive mt-1">{errors.parentFirstName}</p>}
            </div>
            <div>
              <Input
                id="parentLastName"
                placeholder="Last name"
                value={form.parentLastName}
                onChange={(e) => update("parentLastName", e.target.value)}
              />
              {errors.parentLastName && <p className="text-xs text-destructive mt-1">{errors.parentLastName}</p>}
            </div>
          </div>
        </div>

        {/* Child / Swimmer */}
        <div>
          <Label className="text-sm font-semibold">Swimmer's Full Name *</Label>
          <div className="grid gap-3 sm:grid-cols-2 mt-1">
            <div>
              <Input
                id="childFirstName"
                placeholder="First name"
                value={form.childFirstName}
                onChange={(e) => update("childFirstName", e.target.value)}
              />
              {errors.childFirstName && <p className="text-xs text-destructive mt-1">{errors.childFirstName}</p>}
            </div>
            <div>
              <Input
                id="childLastName"
                placeholder="Last name"
                value={form.childLastName}
                onChange={(e) => update("childLastName", e.target.value)}
              />
              {errors.childLastName && <p className="text-xs text-destructive mt-1">{errors.childLastName}</p>}
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="parentEmail">Email *</Label>
            <Input
              id="parentEmail"
              type="email"
              value={form.parentEmail}
              onChange={(e) => update("parentEmail", e.target.value)}
              className="mt-1"
            />
            {errors.parentEmail && <p className="text-xs text-destructive mt-1">{errors.parentEmail}</p>}
          </div>
          <div>
            <Label htmlFor="parentPhone">Phone (optional)</Label>
            <Input
              id="parentPhone"
              type="tel"
              value={form.parentPhone}
              onChange={(e) => update("parentPhone", e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        {/* First-time swimmer question */}
        <div className="p-4 rounded-lg border border-border bg-muted/30">
          <Label className="text-sm font-semibold">
            Is this your child's first time swimming with Aquatic Dreams? *
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5 mb-3">
            First-time swimmers receive a swim bag, cap & goggles with a one-time $45 registration fee.
          </p>
          <RadioGroup
            value={form.isFirstTime}
            onValueChange={(val) => update("isFirstTime", val)}
            className="flex gap-6"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="yes" id="firstTimeYes" />
              <Label htmlFor="firstTimeYes" className="font-normal cursor-pointer">Yes, first time</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="no" id="firstTimeNo" />
              <Label htmlFor="firstTimeNo" className="font-normal cursor-pointer">No, returning swimmer</Label>
            </div>
          </RadioGroup>
          {errors.isFirstTime && <p className="text-xs text-destructive mt-1">{errors.isFirstTime}</p>}
        </div>

        {/* Medical / Allergy question */}
        <div className="p-4 rounded-lg border border-border bg-muted/30">
          <Label className="text-sm font-semibold">
            Does your child have any medical conditions or allergies we should know about? *
          </Label>
          <RadioGroup
            value={form.hasMedical}
            onValueChange={(val) => update("hasMedical", val)}
            className="flex gap-6 mt-3"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="yes" id="hasMedicalYes" />
              <Label htmlFor="hasMedicalYes" className="font-normal cursor-pointer">Yes</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="no" id="hasMedicalNo" />
              <Label htmlFor="hasMedicalNo" className="font-normal cursor-pointer">No</Label>
            </div>
          </RadioGroup>
          {errors.hasMedical && <p className="text-xs text-destructive mt-1">{errors.hasMedical}</p>}

          {form.hasMedical === "yes" && (
            <div className="mt-3">
              <Label htmlFor="medicalNotes" className="text-sm">
                Please describe the conditions or allergies *
              </Label>
              <Textarea
                id="medicalNotes"
                value={form.medicalNotes}
                onChange={(e) => update("medicalNotes", e.target.value)}
                className="mt-1"
                rows={3}
                maxLength={1000}
                placeholder="e.g., asthma, bee sting allergy, seizure disorder..."
              />
              {errors.medicalNotes && <p className="text-xs text-destructive mt-1">{errors.medicalNotes}</p>}
            </div>
          )}
        </div>

        <div>
          <Label htmlFor="notes">Any notes for the instructor? (optional)</Label>
          <Textarea
            id="notes"
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            className="mt-1"
            rows={3}
            maxLength={500}
          />
        </div>

        <div className="flex flex-col-reverse sm:flex-row justify-between gap-3 pt-4">
          <Button type="button" variant="ghost" onClick={onBack} className="w-full sm:w-auto">
            <ChevronLeft className="mr-1 w-4 h-4" /> Back
          </Button>
          <Button
            type="submit"
            disabled={submitting}
            className="w-full sm:w-auto bg-coral hover:bg-coral/90 text-coral-foreground"
          >
            {submitting ? "Enrolling..." : "Complete Enrollment"}{" "}
            <ChevronRight className="ml-1 w-4 h-4" />
          </Button>
        </div>
      </form>
    </motion.div>
  );
};

export default EnrollmentForm;

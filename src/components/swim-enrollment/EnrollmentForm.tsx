import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { z } from "zod";

const enrollmentSchema = z.object({
  parentName: z.string().trim().min(1, "Required").max(100),
  parentEmail: z.string().trim().email("Invalid email").max(255),
  parentPhone: z.string().trim().max(20).optional(),
  childName: z.string().trim().min(1, "Required").max(100),
  notes: z.string().trim().max(500).optional(),
  isFirstTime: z.enum(["yes", "no"], { required_error: "Please select one" }),
  hasMedical: z.enum(["yes", "no"], { required_error: "Please select one" }),
  medicalNotes: z.string().trim().max(1000).optional(),
}).refine(
  (data) => data.hasMedical !== "yes" || (data.medicalNotes && data.medicalNotes.length > 0),
  { message: "Please describe the medical conditions or allergies", path: ["medicalNotes"] }
);

export type EnrollmentFormData = z.infer<typeof enrollmentSchema>;

interface Props {
  onSubmit: (data: EnrollmentFormData) => void;
  onBack: () => void;
  submitting: boolean;
  defaultParentName?: string;
  defaultParentEmail?: string;
  defaultParentPhone?: string;
}

const EnrollmentForm = ({ onSubmit, onBack, submitting, defaultParentName, defaultParentEmail, defaultParentPhone }: Props) => {
  const [form, setForm] = useState({
    parentName: defaultParentName || "",
    parentEmail: defaultParentEmail || "",
    parentPhone: defaultParentPhone || "",
    childName: "",
    notes: "",
    isFirstTime: "" as "" | "yes" | "no",
    hasMedical: "" as "" | "yes" | "no",
    medicalNotes: "",
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
    onSubmit(result.data);
  };

  const update = (key: string, value: string) => {
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
        Almost there! We just need a few details.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="parentName">Parent / Guardian Name *</Label>
            <Input
              id="parentName"
              value={form.parentName}
              onChange={(e) => update("parentName", e.target.value)}
              className="mt-1"
            />
            {errors.parentName && <p className="text-xs text-destructive mt-1">{errors.parentName}</p>}
          </div>
          <div>
            <Label htmlFor="childName">Child's Name *</Label>
            <Input
              id="childName"
              value={form.childName}
              onChange={(e) => update("childName", e.target.value)}
              className="mt-1"
            />
            {errors.childName && <p className="text-xs text-destructive mt-1">{errors.childName}</p>}
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

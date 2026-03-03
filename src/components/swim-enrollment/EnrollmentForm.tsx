import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { z } from "zod";

const enrollmentSchema = z.object({
  parentName: z.string().trim().min(1, "Required").max(100),
  parentEmail: z.string().trim().email("Invalid email").max(255),
  parentPhone: z.string().trim().max(20).optional(),
  childName: z.string().trim().min(1, "Required").max(100),
  notes: z.string().trim().max(500).optional(),
});

export type EnrollmentFormData = z.infer<typeof enrollmentSchema>;

interface Props {
  childAge: number;
  onSubmit: (data: EnrollmentFormData) => void;
  onBack: () => void;
  submitting: boolean;
}

const EnrollmentForm = ({ childAge, onSubmit, onBack, submitting }: Props) => {
  const [form, setForm] = useState({
    parentName: "",
    parentEmail: "",
    parentPhone: "",
    childName: "",
    notes: "",
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

        <div>
          <Label htmlFor="childAge">Child's Age</Label>
          <Input id="childAge" value={childAge} disabled className="mt-1 max-w-[100px]" />
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

export default EnrollmentForm;

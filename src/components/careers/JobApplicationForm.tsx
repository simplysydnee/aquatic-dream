import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Loader2 } from "lucide-react";

const AVAILABILITY_OPTIONS = [
  "Weekday mornings",
  "Weekday afternoons",
  "Weekends",
  "Evenings",
];

const CERTIFICATION_OPTIONS = [
  "Lifeguard Certification",
  "CPR / First Aid",
  "Water Safety Instructor (WSI)",
  "None yet (planning to obtain)",
];

const SWIMMING_LEVELS = ["Beginner", "Intermediate", "Advanced", "Competitive"];

interface Props {
  jobPostingId: string;
  jobTitle: string;
  onClose: () => void;
}

const JobApplicationForm = ({ jobPostingId, jobTitle, onClose }: Props) => {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    availability: [] as string[],
    certifications: [] as string[],
    swimming_ability: "",
    experience_with_children: "",
    experience_description: "",
    available_start_date: "",
  });

  const toggleArray = (field: "availability" | "certifications", value: string) => {
    setForm((prev) => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter((v) => v !== value)
        : [...prev[field], value],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resumeFile) {
      toast({ title: "Resume required", description: "Please upload your resume.", variant: "destructive" });
      return;
    }
    if (!form.first_name || !form.last_name || !form.email || !form.phone) {
      toast({ title: "Missing fields", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      // Upload resume
      const fileExt = resumeFile.name.split(".").pop();
      const filePath = `${Date.now()}-${form.last_name.toLowerCase()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(filePath, resumeFile);
      if (uploadError) throw uploadError;

      const experienceText =
        form.experience_with_children === "yes"
          ? `Yes — ${form.experience_description}`
          : "No";

      const { error } = await supabase.from("job_applications").insert({
        job_posting_id: jobPostingId,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        availability: form.availability,
        certifications: form.certifications,
        swimming_ability: form.swimming_ability,
        experience_with_children: experienceText,
        available_start_date: form.available_start_date,
        resume_url: filePath,
      });
      if (error) throw error;

      setSubmitted(true);
      toast({ title: "Application submitted!", description: "We'll be in touch soon." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Application Submitted! 🎉</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Thank you for applying for <strong>{jobTitle}</strong>. We'll review your application and get back to you soon.
          </p>
          <Button onClick={onClose} className="mt-4">Close</Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Apply: {jobTitle}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-2">
          {/* Personal Info */}
          <div>
            <h3 className="font-semibold text-sm mb-3 text-foreground">Personal Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="first_name">First Name *</Label>
                <Input id="first_name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required maxLength={100} />
              </div>
              <div>
                <Label htmlFor="last_name">Last Name *</Label>
                <Input id="last_name" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} required maxLength={100} />
              </div>
              <div>
                <Label htmlFor="email">Email *</Label>
                <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required maxLength={255} />
              </div>
              <div>
                <Label htmlFor="phone">Phone *</Label>
                <Input id="phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required maxLength={20} />
              </div>
            </div>
          </div>

          {/* Availability */}
          <div>
            <h3 className="font-semibold text-sm mb-3 text-foreground">Availability</h3>
            <p className="text-xs text-muted-foreground mb-2">Select all that apply</p>
            <div className="grid grid-cols-2 gap-2">
              {AVAILABILITY_OPTIONS.map((opt) => (
                <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={form.availability.includes(opt)}
                    onCheckedChange={() => toggleArray("availability", opt)}
                  />
                  {opt}
                </label>
              ))}
            </div>
          </div>

          {/* Certifications */}
          <div>
            <h3 className="font-semibold text-sm mb-3 text-foreground">Certifications</h3>
            <p className="text-xs text-muted-foreground mb-2">Which certifications do you currently hold?</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CERTIFICATION_OPTIONS.map((opt) => (
                <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={form.certifications.includes(opt)}
                    onCheckedChange={() => toggleArray("certifications", opt)}
                  />
                  {opt}
                </label>
              ))}
            </div>
          </div>

          {/* Swimming Ability */}
          <div>
            <h3 className="font-semibold text-sm mb-3 text-foreground">Swimming Ability</h3>
            <RadioGroup value={form.swimming_ability} onValueChange={(v) => setForm({ ...form, swimming_ability: v })}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {SWIMMING_LEVELS.map((level) => (
                  <label key={level} className="flex items-center gap-2 text-sm cursor-pointer">
                    <RadioGroupItem value={level} />
                    {level}
                  </label>
                ))}
              </div>
            </RadioGroup>
          </div>

          {/* Experience with Children */}
          <div>
            <h3 className="font-semibold text-sm mb-3 text-foreground">Experience with Children</h3>
            <RadioGroup value={form.experience_with_children} onValueChange={(v) => setForm({ ...form, experience_with_children: v })}>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value="yes" /> Yes
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value="no" /> No
                </label>
              </div>
            </RadioGroup>
            {form.experience_with_children === "yes" && (
              <Textarea
                className="mt-2"
                placeholder="Briefly describe your experience..."
                value={form.experience_description}
                onChange={(e) => setForm({ ...form, experience_description: e.target.value })}
                maxLength={500}
              />
            )}
          </div>

          {/* Start Date */}
          <div>
            <Label htmlFor="start_date">When are you available to start?</Label>
            <Input
              id="start_date"
              type="date"
              value={form.available_start_date}
              onChange={(e) => setForm({ ...form, available_start_date: e.target.value })}
            />
          </div>

          {/* Resume Upload */}
          <div>
            <h3 className="font-semibold text-sm mb-3 text-foreground">Resume *</h3>
            <label className="flex items-center gap-3 p-4 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary transition-colors">
              <Upload className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {resumeFile ? resumeFile.name : "Upload PDF, DOC, or DOCX (max 5MB)"}
              </span>
              <input
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && file.size > 5 * 1024 * 1024) {
                    toast({ title: "File too large", description: "Max file size is 5MB.", variant: "destructive" });
                    return;
                  }
                  setResumeFile(file || null);
                }}
              />
            </label>
          </div>

          <Button type="submit" disabled={submitting} className="w-full bg-coral hover:bg-coral/90 text-coral-foreground">
            {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</> : "Submit Application"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default JobApplicationForm;

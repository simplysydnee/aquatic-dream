import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CheckCircle, ArrowRight, DollarSign, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { PRICING } from "./types";

const calcAge = (dob: Date): number => {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
};

const requestSchema = z.object({
  parentFirstName: z.string().trim().min(1, "Required").max(100),
  parentLastName: z.string().trim().min(1, "Required").max(100),
  parentEmail: z.string().trim().email("Invalid email").max(255),
  parentPhone: z.string().trim().max(20).optional(),
  childFirstName: z.string().trim().min(1, "Required").max(100),
  childLastName: z.string().trim().min(1, "Required").max(100),
  childDob: z.date({ required_error: "Date of birth is required" })
    .refine((d) => d <= new Date(), { message: "Date of birth must be in the past" })
    .refine((d) => d >= new Date("1920-01-01"), { message: "Please enter a valid date" }),
  lessonType: z.enum(["private", "semi-private"]),
  preferredTimes: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(500).optional(),
});

const LessonRequestForm = () => {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const [form, setForm] = useState({
    parentFirstName: "",
    parentLastName: "",
    parentEmail: "",
    parentPhone: "",
    childFirstName: "",
    childLastName: "",
    childDob: undefined as Date | undefined,
    lessonType: "private" as "private" | "semi-private",
    preferredTimes: "",
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const computedAge = useMemo(() => (form.childDob ? calcAge(form.childDob) : null), [form.childDob]);

  const update = (key: string, value: unknown) => {
    setForm({ ...form, [key]: value } as typeof form);
    if (errors[key]) setErrors({ ...errors, [key]: "" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = requestSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        fieldErrors[issue.path[0] as string] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }
    setSubmitting(true);
    const id = crypto.randomUUID();
    const childAge = calcAge(parsed.data.childDob);
    const dobIso = format(parsed.data.childDob, "yyyy-MM-dd");
    const parentName = `${parsed.data.parentFirstName} ${parsed.data.parentLastName}`.trim();
    const childName = `${parsed.data.childFirstName} ${parsed.data.childLastName}`.trim();
    const { error } = await supabase.from("lesson_requests").insert({
      id,
      parent_name: parentName,
      parent_first_name: parsed.data.parentFirstName,
      parent_last_name: parsed.data.parentLastName,
      parent_email: parsed.data.parentEmail,
      parent_phone: parsed.data.parentPhone || null,
      child_name: childName,
      child_first_name: parsed.data.childFirstName,
      child_last_name: parsed.data.childLastName,
      child_age: childAge,
      child_dob: dobIso,
      lesson_type: parsed.data.lessonType,
      preferred_times: parsed.data.preferredTimes || null,
      notes: parsed.data.notes || null,
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "Something went wrong", description: "Please try again or contact us directly.", variant: "destructive" });
      return;
    }
    // Fire-and-forget acknowledgment email — don't block UI on it
    supabase.functions
      .invoke("send-transactional-email", {
        body: {
          templateName: "lesson-request-acknowledgment",
          recipientEmail: parsed.data.parentEmail,
          idempotencyKey: `lesson-req-ack-${id}`,
          templateData: {
            parentName,
            childName,
            lessonType: parsed.data.lessonType,
          },
        },
      })
      .catch((e) => console.error("Failed to send acknowledgment email", e));

    // Internal staff alerts — one invoke per recipient, fire-and-forget
    const STAFF_ALERTS: Array<{ email: string; tag: string }> = [
      { email: "generalmail@aquaticdreams.com", tag: "general" },
      { email: "sutton@aquaticdreams.com", tag: "sutton" },
    ];
    const alertData = {
      parentName,
      parentEmail: parsed.data.parentEmail,
      parentPhone: parsed.data.parentPhone || "",
      childName,
      childAge,
      lessonType: parsed.data.lessonType,
      preferredTimes: parsed.data.preferredTimes || "",
      notes: parsed.data.notes || "",
      submittedAt: new Date().toLocaleString(),
    };
    STAFF_ALERTS.forEach(({ email, tag }) => {
      supabase.functions
        .invoke("send-transactional-email", {
          body: {
            templateName: "internal-lesson-request-alert",
            recipientEmail: email,
            idempotencyKey: `lesson-req-internal-${tag}-${id}`,
            templateData: alertData,
          },
        })
        .catch((e) => console.error(`Failed to send staff alert to ${email}`, e));
    });
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center max-w-md mx-auto">
        <Card className="border-primary/20 bg-gradient-to-br from-accent to-card">
          <CardContent className="pt-8 pb-6 px-6">
            <CheckCircle className="w-12 h-12 text-primary mx-auto mb-4" />
            <h3 className="font-display text-2xl font-bold text-foreground mb-2">Request Submitted!</h3>
            <p className="text-muted-foreground mb-4">We'll reach out soon to schedule your {form.lessonType} lesson.</p>
            <Button asChild className="bg-primary text-primary-foreground">
              <a href="/swim-lessons">Back to Swim Lessons <ArrowRight className="ml-1 w-4 h-4" /></a>
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} className="max-w-lg mx-auto">
      <h3 className="font-display text-2xl font-bold text-foreground mb-1">Request a Private or Semi-Private Lesson</h3>
      <p className="text-muted-foreground text-sm mb-6">Fill out the form and we'll get back to you to schedule. Open to all ages.</p>

      <div className="flex items-center gap-4 text-sm bg-accent/50 border border-accent rounded-lg p-3 mb-6">
        <DollarSign className="w-4 h-4 text-primary shrink-0" />
        <span>Private: ${PRICING.private}/lesson · Semi-Private: ${PRICING.semiPrivate}/lesson</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label className="text-sm font-medium">Lesson Type</Label>
          <RadioGroup value={form.lessonType} onValueChange={(v) => update("lessonType", v)} className="flex gap-4 mt-2">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="private" id="private" />
              <Label htmlFor="private" className="cursor-pointer">Private ($65)</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="semi-private" id="semi-private" />
              <Label htmlFor="semi-private" className="cursor-pointer">Semi-Private ($45)</Label>
            </div>
          </RadioGroup>
        </div>

        <div>
          <Label className="text-sm font-semibold">Parent / Guardian Name *</Label>
          <div className="grid gap-3 sm:grid-cols-2 mt-1">
            <div>
              <Input placeholder="First name" value={form.parentFirstName} onChange={(e) => update("parentFirstName", e.target.value)} />
              {errors.parentFirstName && <p className="text-xs text-destructive mt-1">{errors.parentFirstName}</p>}
            </div>
            <div>
              <Input placeholder="Last name" value={form.parentLastName} onChange={(e) => update("parentLastName", e.target.value)} />
              {errors.parentLastName && <p className="text-xs text-destructive mt-1">{errors.parentLastName}</p>}
            </div>
          </div>
        </div>

        <div>
          <Label className="text-sm font-semibold">Swimmer's Full Name *</Label>
          <div className="grid gap-3 sm:grid-cols-2 mt-1">
            <div>
              <Input placeholder="First name" value={form.childFirstName} onChange={(e) => update("childFirstName", e.target.value)} />
              {errors.childFirstName && <p className="text-xs text-destructive mt-1">{errors.childFirstName}</p>}
            </div>
            <div>
              <Input placeholder="Last name" value={form.childLastName} onChange={(e) => update("childLastName", e.target.value)} />
              {errors.childLastName && <p className="text-xs text-destructive mt-1">{errors.childLastName}</p>}
            </div>
          </div>
        </div>

        <div>
          <Label htmlFor="childDob">Swimmer's Date of Birth *</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "mt-1 w-full justify-start text-left font-normal",
                  !form.childDob && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {form.childDob ? format(form.childDob, "PPP") : <span>Pick a date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={form.childDob}
                onSelect={(d) => update("childDob", d)}
                disabled={(date) => date > new Date() || date < new Date("1920-01-01")}
                captionLayout="dropdown-buttons"
                fromYear={1920}
                toYear={new Date().getFullYear()}
                defaultMonth={form.childDob ?? new Date(new Date().getFullYear() - 8, 0)}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          {computedAge !== null && (
            <p className="text-xs text-muted-foreground mt-1">Age: {computedAge}</p>
          )}
          {errors.childDob && <p className="text-xs text-destructive mt-1">{errors.childDob}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="parentEmail">Email *</Label>
            <Input id="parentEmail" type="email" value={form.parentEmail} onChange={(e) => update("parentEmail", e.target.value)} className="mt-1" />
            {errors.parentEmail && <p className="text-xs text-destructive mt-1">{errors.parentEmail}</p>}
          </div>
          <div>
            <Label htmlFor="parentPhone">Phone (optional)</Label>
            <Input id="parentPhone" type="tel" value={form.parentPhone} onChange={(e) => update("parentPhone", e.target.value)} className="mt-1" />
          </div>
        </div>

        <div>
          <Label htmlFor="preferredTimes">Preferred Days & Times (optional)</Label>
          <Input id="preferredTimes" placeholder="e.g. Mon/Wed afternoons" value={form.preferredTimes} onChange={(e) => update("preferredTimes", e.target.value)} className="mt-1" />
        </div>

        <div>
          <Label htmlFor="notes">Any notes? (optional)</Label>
          <Textarea id="notes" value={form.notes} onChange={(e) => update("notes", e.target.value)} className="mt-1" rows={3} maxLength={500} />
        </div>

        <Button type="submit" disabled={submitting} className="w-full bg-coral hover:bg-coral/90 text-coral-foreground">
          {submitting ? "Submitting..." : "Submit Request"}
        </Button>
      </form>
    </motion.div>
  );
};

export default LessonRequestForm;

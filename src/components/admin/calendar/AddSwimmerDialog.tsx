import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, CalendarCheck } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  sessionName: string;
  swimLevel: string;
  dateStr: string;
  onSaved: () => void;
}

const AddSwimmerDialog = ({
  open,
  onOpenChange,
  sessionId,
  sessionName,
  swimLevel,
  dateStr,
  onSaved,
}: Props) => {
  const { toast } = useToast();
  const [tab, setTab] = useState<"enroll" | "walkin">("enroll");
  const [saving, setSaving] = useState(false);

  // Shared fields
  const [childName, setChildName] = useState("");
  const [childAge, setChildAge] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [parentEmail, setParentEmail] = useState("");

  const reset = () => {
    setChildName("");
    setChildAge("");
    setParentName("");
    setParentPhone("");
    setParentEmail("");
    setTab("enroll");
  };

  const handleEnroll = async () => {
    if (!childName || !childAge || !parentName || !parentEmail) {
      toast({ title: "Missing fields", description: "Fill in child name, age, parent name, and email.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("swim_enrollments").insert({
      child_name: childName.trim(),
      child_age: parseInt(childAge),
      parent_name: parentName.trim(),
      parent_phone: parentPhone.trim() || null,
      parent_email: parentEmail.trim(),
      swim_level: swimLevel,
      session_id: sessionId,
      status: "confirmed",
    });
    setSaving(false);

    if (error) {
      toast({ title: "Failed to enroll", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Swimmer enrolled", description: `${childName} added to ${sessionName}` });
      reset();
      onOpenChange(false);
      onSaved();
    }
  };

  const handleWalkIn = async () => {
    if (!childName || !childAge) {
      toast({ title: "Missing fields", description: "Fill in child name and age.", variant: "destructive" });
      return;
    }
    setSaving(true);

    // Create a temporary enrollment for walk-in tracking
    const { data: enrollment, error: enrollError } = await supabase
      .from("swim_enrollments")
      .insert({
        child_name: childName.trim(),
        child_age: parseInt(childAge),
        parent_name: parentName.trim() || "Walk-in",
        parent_email: parentEmail.trim() || "walkin@temp.local",
        parent_phone: parentPhone.trim() || null,
        swim_level: swimLevel,
        session_id: sessionId,
        status: "confirmed",
        notes: `Walk-in on ${dateStr}`,
      })
      .select("id")
      .single();

    if (enrollError || !enrollment) {
      setSaving(false);
      toast({ title: "Failed", description: enrollError?.message || "Could not create walk-in record", variant: "destructive" });
      return;
    }

    // Also mark attendance for today
    await supabase.from("attendance").insert({
      enrollment_id: enrollment.id,
      session_id: sessionId,
      lesson_date: dateStr,
      checked_in: true,
      checked_in_at: new Date().toISOString(),
      checked_in_by: "admin",
    });

    setSaving(false);
    toast({ title: "Walk-in added", description: `${childName} checked in for today` });
    reset();
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Add Swimmer</DialogTitle>
          <DialogDescription>{sessionName} — {swimLevel}</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "enroll" | "walkin")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="enroll" className="gap-1.5">
              <UserPlus className="w-3.5 h-3.5" /> Enroll in Session
            </TabsTrigger>
            <TabsTrigger value="walkin" className="gap-1.5">
              <CalendarCheck className="w-3.5 h-3.5" /> Walk-in Today
            </TabsTrigger>
          </TabsList>

          <div className="space-y-3 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="child-name">Child Name *</Label>
                <Input id="child-name" value={childName} onChange={(e) => setChildName(e.target.value)} placeholder="First Last" />
              </div>
              <div>
                <Label htmlFor="child-age">Age *</Label>
                <Input id="child-age" type="number" min={1} max={18} value={childAge} onChange={(e) => setChildAge(e.target.value)} placeholder="Age" />
              </div>
            </div>

            <TabsContent value="enroll" className="mt-0 space-y-3">
              <div>
                <Label htmlFor="parent-name">Parent Name *</Label>
                <Input id="parent-name" value={parentName} onChange={(e) => setParentName(e.target.value)} placeholder="Parent / Guardian" />
              </div>
              <div>
                <Label htmlFor="parent-email">Email *</Label>
                <Input id="parent-email" type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} placeholder="parent@email.com" />
              </div>
              <div>
                <Label htmlFor="parent-phone">Phone</Label>
                <Input id="parent-phone" type="tel" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} placeholder="(555) 123-4567" />
              </div>
              <Button onClick={handleEnroll} disabled={saving} className="w-full">
                {saving ? "Enrolling..." : "Enroll in Full Session"}
              </Button>
            </TabsContent>

            <TabsContent value="walkin" className="mt-0 space-y-3">
              <div>
                <Label htmlFor="walkin-parent">Parent Name</Label>
                <Input id="walkin-parent" value={parentName} onChange={(e) => setParentName(e.target.value)} placeholder="Optional" />
              </div>
              <div>
                <Label htmlFor="walkin-phone">Phone</Label>
                <Input id="walkin-phone" type="tel" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} placeholder="Optional" />
              </div>
              <p className="text-xs text-muted-foreground">
                Walk-in swimmers are checked in for today only. They will appear on the roster for this date.
              </p>
              <Button onClick={handleWalkIn} disabled={saving} className="w-full" variant="secondary">
                {saving ? "Adding..." : "Check In as Walk-in"}
              </Button>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default AddSwimmerDialog;

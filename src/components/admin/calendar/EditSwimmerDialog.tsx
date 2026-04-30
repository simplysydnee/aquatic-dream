import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2 } from "lucide-react";

export type EditTarget =
  | {
      kind: "lesson_booking";
      id: string;
      child_name: string | null;
      parent_name: string;
      parent_email: string;
      parent_phone: string | null;
    }
  | {
      kind: "swim_enrollment";
      id: string;
      child_name: string;
      child_age: number | null;
      parent_name: string;
      parent_email: string;
      parent_phone: string | null;
    };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  target: EditTarget | null;
  onSaved: () => void;
}

const emailValid = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

const EditSwimmerDialog = ({ open, onOpenChange, target, onSaved }: Props) => {
  const { toast } = useToast();
  const [childName, setChildName] = useState("");
  const [childAge, setChildAge] = useState<string>("");
  const [parentName, setParentName] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!target) return;
    setChildName(target.child_name || "");
    setParentName(target.parent_name || "");
    setParentEmail(target.parent_email || "");
    setParentPhone(target.parent_phone || "");
    setChildAge(target.kind === "swim_enrollment" && target.child_age != null ? String(target.child_age) : "");
    setSaved(false);
  }, [target, open]);

  if (!target) return null;

  const handleSave = async () => {
    if (!parentName.trim()) {
      toast({ title: "Parent name required", variant: "destructive" });
      return;
    }
    if (!emailValid(parentEmail)) {
      toast({ title: "Valid parent email required", variant: "destructive" });
      return;
    }
    if (target.kind === "swim_enrollment" && !childName.trim()) {
      toast({ title: "Swimmer name required", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      if (target.kind === "lesson_booking") {
        const { error } = await supabase
          .from("lesson_bookings")
          .update({
            child_name: childName.trim() || null,
            parent_name: parentName.trim(),
            parent_email: parentEmail.trim(),
            parent_phone: parentPhone.trim() || null,
          })
          .eq("id", target.id);
        if (error) throw error;
      } else {
        const ageNum = childAge.trim() ? parseInt(childAge, 10) : null;
        if (childAge.trim() && (Number.isNaN(ageNum!) || ageNum! < 0 || ageNum! > 99)) {
          toast({ title: "Invalid age", variant: "destructive" });
          setSaving(false);
          return;
        }
        const update: Record<string, unknown> = {
          child_name: childName.trim(),
          parent_name: parentName.trim(),
          parent_email: parentEmail.trim(),
          parent_phone: parentPhone.trim() || null,
        };
        if (ageNum != null) update.child_age = ageNum;
        const { error } = await supabase
          .from("swim_enrollments")
          .update(update)
          .eq("id", target.id);
        if (error) throw error;
      }
      setSaved(true);
      toast({ title: "Swimmer info updated", description: "Changes saved successfully." });
      onSaved();
      // auto-close after a moment
      setTimeout(() => onOpenChange(false), 900);
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit swimmer info</DialogTitle>
        </DialogHeader>

        {saved ? (
          <div className="py-6 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-primary mx-auto" />
            <p className="text-sm font-medium">Swimmer info updated</p>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="es-child">Swimmer name{target.kind === "swim_enrollment" ? " *" : ""}</Label>
              <Input id="es-child" value={childName} onChange={(e) => setChildName(e.target.value)} />
            </div>
            {target.kind === "swim_enrollment" && (
              <div>
                <Label htmlFor="es-age">Age</Label>
                <Input id="es-age" inputMode="numeric" value={childAge} onChange={(e) => setChildAge(e.target.value)} />
              </div>
            )}
            <div>
              <Label htmlFor="es-pname">Parent name *</Label>
              <Input id="es-pname" value={parentName} onChange={(e) => setParentName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="es-pemail">Parent email *</Label>
              <Input id="es-pemail" type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="es-pphone">Parent phone</Label>
              <Input id="es-pphone" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} />
            </div>
          </div>
        )}

        {!saved && (
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default EditSwimmerDialog;

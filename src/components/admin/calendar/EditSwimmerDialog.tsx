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
  /**
   * Called after a successful save. Receives the swimmer-grouping key
   * (`normalized(child_name)|normalized(parent_email)`) of the saved swimmer
   * so callers can re-select the swimmer after refetch even if the key changed.
   */
  onSaved: (newKey?: string) => void;
}

const emailValid = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

// Match swimmerKey() in useSwimmers.ts so the parent page can re-select.
const normalizeName = (name: string | null | undefined) =>
  (name || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
const normalizeEmail = (email: string | null | undefined) =>
  (email || "").trim().toLowerCase();
const buildSwimmerKey = (childName: string, parentEmail: string) =>
  `${normalizeName(childName)}|${normalizeEmail(parentEmail)}`;

// Escape PostgREST ilike wildcards so the filter is an exact case-insensitive match.
const escapeIlike = (v: string) => v.replace(/[\\%_]/g, (m) => `\\${m}`);

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
    if (!childName.trim()) {
      toast({ title: "Swimmer name required", variant: "destructive" });
      return;
    }

    const ageNum = childAge.trim() ? parseInt(childAge, 10) : null;
    if (childAge.trim() && (Number.isNaN(ageNum!) || ageNum! < 0 || ageNum! > 99)) {
      toast({ title: "Invalid age", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      // Original identity used to find every row belonging to this swimmer.
      const origChild = (target.child_name || "").trim();
      const origEmail = (target.parent_email || "").trim();

      const newChild = childName.trim();
      const newParentName = parentName.trim();
      const newParentEmail = parentEmail.trim();
      const newParentPhone = parentPhone.trim() || null;

      const enrollmentUpdate: Record<string, unknown> = {
        child_name: newChild,
        parent_name: newParentName,
        parent_email: newParentEmail,
        parent_phone: newParentPhone,
      };
      if (ageNum != null) enrollmentUpdate.child_age = ageNum;

      const bookingUpdate: Record<string, unknown> = {
        child_name: newChild,
        parent_name: newParentName,
        parent_email: newParentEmail,
        parent_phone: newParentPhone,
      };

      // Update every row for this swimmer in both tables. Scope by the
      // pre-edit child_name + parent_email (case-insensitive exact match) so
      // siblings under the same parent are not touched.
      const childFilter = escapeIlike(origChild);
      const emailFilter = escapeIlike(origEmail);

      const queries: PromiseLike<{ error: unknown }>[] = [];

      if (origChild && origEmail) {
        queries.push(
          supabase
            .from("swim_enrollments")
            .update(enrollmentUpdate)
            .ilike("child_name", childFilter)
            .ilike("parent_email", emailFilter)
            .then(({ error }) => ({ error })),
        );
        queries.push(
          supabase
            .from("lesson_bookings")
            .update(bookingUpdate)
            .ilike("child_name", childFilter)
            .ilike("parent_email", emailFilter)
            .then(({ error }) => ({ error })),
        );
      }

      // Always also update the targeted row by id as a safety net (covers
      // bookings whose child_name is null/parent-name and wouldn't match the
      // ilike scope above).
      if (target.kind === "lesson_booking") {
        queries.push(
          supabase
            .from("lesson_bookings")
            .update(bookingUpdate)
            .eq("id", target.id)
            .then(({ error }) => ({ error })),
        );
      } else {
        queries.push(
          supabase
            .from("swim_enrollments")
            .update(enrollmentUpdate)
            .eq("id", target.id)
            .then(({ error }) => ({ error })),
        );
      }

      const results = await Promise.all(queries);
      const firstError = results.find((r) => r.error)?.error as
        | { message?: string }
        | undefined;
      if (firstError) throw firstError;

      setSaved(true);
      toast({ title: "Swimmer info updated", description: "Changes saved successfully." });
      onSaved(buildSwimmerKey(newChild, newParentEmail));
      // auto-close after a moment
      setTimeout(() => onOpenChange(false), 900);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : (e as { message?: string })?.message;
      toast({ title: "Save failed", description: msg, variant: "destructive" });
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
              <Label htmlFor="es-child">Swimmer name *</Label>
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

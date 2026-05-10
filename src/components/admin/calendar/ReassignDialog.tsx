import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import InstructorPicker from "./InstructorPicker";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { performReassign, type ReassignInput } from "@/lib/lessonCancel";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Items to reassign — at least one of session_date or pool_event ids */
  sessionDateIds?: string[];
  poolEventIds?: string[];
  notifyMeta?: ReassignInput["notifyMeta"];
  onDone?: () => void;
}

const ReassignDialog = ({
  open,
  onOpenChange,
  sessionDateIds = [],
  poolEventIds = [],
  notifyMeta,
  onDone,
}: Props) => {
  const [name, setName] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);

  const total = sessionDateIds.length + poolEventIds.length;

  const handleConfirm = async () => {
    if (!name.trim()) {
      toast.error("Pick an instructor");
      return;
    }
    setBusy(true);
    try {
      const { data: row } = await supabase
        .from("instructors")
        .select("id")
        .eq("name", name)
        .eq("is_active", true)
        .maybeSingle();
      await performReassign({
        sessionDateIds,
        poolEventIds,
        newInstructorId: row?.id ?? null,
        newInstructorName: name.trim(),
        notifyCustomers: notify,
        notifyMeta,
      });
      toast.success(`Reassigned ${total} lesson${total !== 1 ? "s" : ""} to ${name}`);
      onOpenChange(false);
      onDone?.();
    } catch (err: any) {
      toast.error(err?.message || "Failed to reassign");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reassign {total} lesson{total !== 1 ? "s" : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">New instructor</Label>
            <div className="mt-1">
              <InstructorPicker value={name} onChange={setName} placeholder="Select instructor…" />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Applies to just these occurrences. The original instructor keeps the rest of the series.
            </p>
          </div>
          <label className="flex items-start gap-2 cursor-pointer">
            <Checkbox checked={notify} onCheckedChange={(v) => setNotify(!!v)} className="mt-0.5" />
            <span className="text-sm">
              Email affected parents
              <span className="block text-xs text-muted-foreground">
                Lets them know who's teaching the lesson.
              </span>
            </span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={busy || !name.trim()}>
              {busy ? "Saving…" : "Reassign"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReassignDialog;

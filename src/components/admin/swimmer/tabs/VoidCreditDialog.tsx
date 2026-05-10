import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  creditId: string | null;
  amountCents: number;
  onVoided: () => void;
}

export default function VoidCreditDialog({ open, onOpenChange, creditId, amountCents, onVoided }: Props) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const handleVoid = async () => {
    if (!creditId) return;
    if (!reason.trim()) {
      toast({ title: "Reason required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { data: claimed, error } = await supabase
      .from("client_credits")
      .update({
        voided_at: new Date().toISOString(),
        voided_by: u?.user?.id ?? null,
        voided_reason: reason.trim(),
      })
      .eq("id", creditId)
      .is("used_at", null)
      .is("voided_at", null)
      .select("id")
      .maybeSingle();
    setSaving(false);
    if (error || !claimed) {
      toast({ title: "Couldn't void", description: error?.message || "Credit may already be used or voided.", variant: "destructive" });
      return;
    }
    toast({ title: "Credit voided", description: `$${(amountCents / 100).toFixed(2)} removed` });
    setReason("");
    onOpenChange(false);
    onVoided();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setReason(""); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Void Credit</DialogTitle>
          <DialogDescription>This will permanently remove ${(amountCents / 100).toFixed(2)} from the account.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="void-reason">Reason *</Label>
          <Textarea id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Why is this credit being voided?" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button variant="destructive" onClick={handleVoid} disabled={saving}>{saving ? "Voiding..." : "Void Credit"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

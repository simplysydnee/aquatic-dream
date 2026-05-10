import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  parentEmail: string;
  onIssued: () => void;
}

const REASONS = [
  { value: "goodwill", label: "Goodwill" },
  { value: "manual_adjustment", label: "Manual adjustment" },
  { value: "transfer_in", label: "Transfer in" },
  { value: "other", label: "Other" },
];

export default function IssueCreditDialog({ open, onOpenChange, parentEmail, onIssued }: Props) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("goodwill");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => { setAmount(""); setReason("goodwill"); setNote(""); };

  const handleIssue = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      toast({ title: "Enter an amount", variant: "destructive" });
      return;
    }
    if (!note.trim()) {
      toast({ title: "Note required", description: "Please describe why this credit is being issued.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("client_credits").insert({
      parent_email: parentEmail.toLowerCase(),
      amount_cents: Math.round(amt * 100),
      source: "manual_issue",
      note: `[${reason}] ${note.trim()}`,
      created_by: u?.user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Failed to issue credit", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Credit issued", description: `$${amt.toFixed(2)} added to ${parentEmail}` });
    reset();
    onOpenChange(false);
    onIssued();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Issue Account Credit</DialogTitle>
          <DialogDescription>{parentEmail}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="cr-amount">Amount ($) *</Label>
            <Input id="cr-amount" type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="30.00" />
          </div>
          <div>
            <Label htmlFor="cr-reason">Reason *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="cr-reason"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="cr-note">Note *</Label>
            <Textarea id="cr-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Why is this credit being issued?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleIssue} disabled={saving}>{saving ? "Issuing..." : "Issue Credit"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

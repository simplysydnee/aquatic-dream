import { useEffect, useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, CalendarCheck, Wallet } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  sessionName: string;
  swimLevel: string;
  dateStr: string;
  onSaved: () => void;
}

type PaymentMethod = "cash" | "check" | "comp" | "stripe" | "stripe_link";

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
  const [isFirstTime, setIsFirstTime] = useState(false);

  // Payment audit fields (REQUIRED — no row gets created without them)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "unpaid">("paid");

  // Account credit lookup
  const [availableCredits, setAvailableCredits] = useState<{ id: string; amount_cents: number }[]>([]);
  const [applyCredit, setApplyCredit] = useState(false);

  useEffect(() => {
    const email = parentEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setAvailableCredits([]);
      setApplyCredit(false);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("client_credits")
        .select("id, amount_cents")
        .ilike("parent_email", email)
        .is("used_at", null)
        .is("voided_at", null)
        .order("created_at", { ascending: true });
      setAvailableCredits((data as any) ?? []);
    }, 350);
    return () => clearTimeout(t);
  }, [parentEmail]);

  const creditTotalCents = availableCredits.reduce((s, c) => s + c.amount_cents, 0);
  const amountNum = paymentAmount ? parseFloat(paymentAmount) : 0;
  const creditAppliedCents = applyCredit
    ? Math.min(creditTotalCents, Math.round(amountNum * 100))
    : 0;
  const netDueCents = Math.max(0, Math.round(amountNum * 100) - creditAppliedCents);

  const reset = () => {
    setChildName("");
    setChildAge("");
    setParentName("");
    setParentPhone("");
    setParentEmail("");
    setIsFirstTime(false);
    setPaymentMethod("cash");
    setPaymentReference("");
    setPaymentAmount("");
    setPaymentStatus("paid");
    setTab("enroll");
  };

  const consumeCredits = async (enrollmentId: string) => {
    if (creditAppliedCents <= 0) return;
    let remaining = creditAppliedCents;
    for (const c of availableCredits) {
      if (remaining <= 0) break;
      // Guarded update prevents double-spend if another flow consumed it first.
      const { data: claimed, error } = await supabase
        .from("client_credits")
        .update({ used_at: new Date().toISOString(), used_against: enrollmentId })
        .eq("id", c.id)
        .is("used_at", null)
        .is("voided_at", null)
        .select("id")
        .maybeSingle();
      if (error || !claimed) continue;
      if (c.amount_cents <= remaining) {
        remaining -= c.amount_cents;
      } else {
        // Partial: keep original row at full amount (audit trail), insert leftover row.
        const leftover = c.amount_cents - remaining;
        await supabase.from("client_credits").insert({
          parent_email: parentEmail.trim().toLowerCase(),
          amount_cents: leftover,
          source: "credit_split",
          source_ref: c.id,
          note: `Leftover after partial application against enrollment ${enrollmentId}`,
        });
        remaining = 0;
      }
    }
  };

  const callAdminCreate = async (isWalkIn: boolean) => {
    const netAmount = applyCredit ? netDueCents / 100 : (paymentAmount ? parseFloat(paymentAmount) : null);
    const noteParts: string[] = [];
    if (isWalkIn) noteParts.push(`Walk-in on ${dateStr}`);
    if (creditAppliedCents > 0) noteParts.push(`Applied $${(creditAppliedCents / 100).toFixed(2)} account credit`);
    const { data, error } = await supabase.functions.invoke("admin-create-enrollment", {
      body: {
        childName,
        childAge: parseInt(childAge),
        swimLevel,
        sessionId,
        parentName: parentName || (isWalkIn ? "Walk-in" : ""),
        parentEmail: parentEmail || (isWalkIn ? "walkin@temp.local" : ""),
        parentPhone: parentPhone || null,
        isFirstTime,
        paymentMethod,
        paymentReference:
          paymentMethod === "stripe_link"
            ? (paymentReference.trim() || "pending_stripe_link")
            : (paymentReference.trim() || `${paymentMethod} ${dateStr}`),
        paymentStatus:
          paymentMethod === "stripe_link"
            ? "unpaid"
            : (applyCredit && netDueCents === 0 ? "paid" : paymentStatus),
        paymentAmount: netAmount,
        notes: noteParts.join(" · ") || null,
        isWalkIn,
        walkInDate: isWalkIn ? dateStr : undefined,
      },
    });
    if (error || !data?.success) {
      throw new Error(error?.message || data?.error || "Failed to create enrollment");
    }
    if (data?.enrollmentId) {
      await consumeCredits(data.enrollmentId);
    }
  };

  const handleEnroll = async () => {
    if (!childName || !childAge || !parentName || !parentEmail) {
      toast({ title: "Missing fields", description: "Fill in child name, age, parent name, and email.", variant: "destructive" });
      return;
    }
    if (
      paymentMethod !== "stripe_link" &&
      paymentStatus === "paid" &&
      !paymentReference.trim() &&
      paymentMethod !== "comp"
    ) {
      toast({ title: "Payment reference required", description: "Enter a receipt #, check #, or note for the audit log.", variant: "destructive" });
      return;
    }
    if (paymentMethod === "stripe_link" && !isFirstTime) {
      toast({ title: "Stripe link only sends the registration fee", description: "Mark this as a first-time swimmer, or use a different payment method.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await callAdminCreate(false);
      toast({ title: "Swimmer enrolled", description: `${childName} added to ${sessionName}` });
      reset();
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast({ title: "Failed to enroll", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleWalkIn = async () => {
    if (!childName || !childAge) {
      toast({ title: "Missing fields", description: "Fill in child name and age.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await callAdminCreate(true);
      toast({ title: "Walk-in added", description: `${childName} checked in for today` });
      reset();
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast({ title: "Failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
                <Input id="child-age" type="number" min={1} max={99} value={childAge} onChange={(e) => setChildAge(e.target.value)} placeholder="Age" />
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

              <div className="flex items-center gap-2 p-2 rounded border border-border bg-muted/30">
                <input
                  id="first-time"
                  type="checkbox"
                  checked={isFirstTime}
                  onChange={(e) => setIsFirstTime(e.target.checked)}
                  className="h-4 w-4"
                />
                <Label htmlFor="first-time" className="text-sm font-normal cursor-pointer">
                  First-time swimmer (adds $45 reg fee)
                </Label>
              </div>

              {creditTotalCents > 0 && (
                <div className="rounded border border-primary/30 bg-primary/5 p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-primary" />
                      <span className="font-medium">Account credit available</span>
                    </div>
                    <span className="font-bold text-primary">${(creditTotalCents / 100).toFixed(2)}</span>
                  </div>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={applyCredit}
                      onChange={(e) => setApplyCredit(e.target.checked)}
                      className="h-3.5 w-3.5"
                    />
                    Apply ${(Math.min(creditTotalCents, Math.round(amountNum * 100)) / 100).toFixed(2)} credit toward this enrollment
                  </label>
                  {applyCredit && (
                    <p className="text-xs text-muted-foreground">
                      Net due: <span className="font-medium text-foreground">${(netDueCents / 100).toFixed(2)}</span>
                    </p>
                  )}
                </div>
              )}

              {/* Payment audit block — required for traceability */}
              <div className="space-y-3 p-3 rounded border border-border bg-muted/20">
                <p className="text-xs font-semibold text-foreground">Payment Record (required)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="pay-method" className="text-xs">Method *</Label>
                    <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                      <SelectTrigger id="pay-method"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="check">Check</SelectItem>
                        <SelectItem value="stripe">Stripe (manual)</SelectItem>
                        <SelectItem value="stripe_link">Stripe — send link to parent</SelectItem>
                        <SelectItem value="comp">Comp / Free</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="pay-status" className="text-xs">Status *</Label>
                    <Select value={paymentStatus} onValueChange={(v) => setPaymentStatus(v as "paid" | "unpaid")}>
                      <SelectTrigger id="pay-status"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="paid">Paid</SelectItem>
                        <SelectItem value="unpaid">Unpaid (due day 1)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="pay-amount" className="text-xs">Amount ($)</Label>
                    <Input
                      id="pay-amount"
                      type="number"
                      step="0.01"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder="240"
                    />
                  </div>
                  <div>
                    <Label htmlFor="pay-ref" className="text-xs">
                      Reference {paymentStatus === "paid" && paymentMethod !== "comp" ? "*" : ""}
                    </Label>
                    <Input
                      id="pay-ref"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder={
                        paymentMethod === "stripe" ? "ch_xxx" :
                        paymentMethod === "check" ? "Check #1234" :
                        paymentMethod === "comp" ? "Reason" :
                        "Receipt #"
                      }
                    />
                  </div>
                </div>
              </div>

              <Button onClick={handleEnroll} disabled={saving} className="w-full">
                {saving ? "Enrolling..." : "Enroll Swimmer"}
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

              <div className="space-y-3 p-3 rounded border border-border bg-muted/20">
                <p className="text-xs font-semibold text-foreground">Payment Record (required)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Method *</Label>
                    <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="check">Check</SelectItem>
                        <SelectItem value="comp">Comp / Free</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Amount ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder="30"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Reference / Receipt #</Label>
                  <Input
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder={`Walk-in ${dateStr}`}
                  />
                </div>
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

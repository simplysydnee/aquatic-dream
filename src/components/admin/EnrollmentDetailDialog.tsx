import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LEVEL_DISPLAY, type SwimLevel, getGroupName, getAgeGroup } from "@/components/swim-enrollment/types";
import { toast } from "@/hooks/use-toast";
import { Save, FileCheck, ShieldCheck, Camera, AlertTriangle, User, Phone, Send, ArrowRightLeft, CalendarClock } from "lucide-react";
import SendPaymentLinkDialog, { type SendPaymentLinkTarget } from "@/components/admin/SendPaymentLinkDialog";

interface SessionOption {
  id: string;
  swim_level: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  max_students: number;
  age_group: string | null;
  session_period_id: string | null;
  period_name: string | null;
  enrolled_count: number;
}

const formatTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  return `${hr}:${m.toString().padStart(2, "0")} ${period}`;
};

const describeSession = (s: SessionOption) => {
  const lvl = LEVEL_DISPLAY[s.swim_level as SwimLevel];
  const ageLabel = s.age_group === "preschool-3-5" ? "Preschool" : s.age_group === "school-age-6-12" ? "School-Age" : "";
  const period = s.period_name ? `${s.period_name} · ` : "";
  return `${period}${s.day_of_week} · ${formatTime(s.start_time)} · ${lvl?.name || s.swim_level}${ageLabel ? ` (${ageLabel})` : ""}`;
};

interface Enrollment {
  id: string;
  child_name: string;
  child_age: number;
  parent_name: string;
  parent_email: string;
  parent_phone: string | null;
  swim_level: string;
  status: string;
  notes: string | null;
  created_at: string;
  session_id: string | null;
  payment_status: string;
  payment_amount: number | null;
  stripe_payment_id: string | null;
  is_first_time: boolean;
  payment_due_date: string | null;
  payment_method?: string | null;
  payment_reference?: string | null;
  payment_reminder_sent_at?: string | null;
  session_fee_status: string;
  session_fee_stripe_id?: string | null;
  session_fee_paid_at?: string | null;
}

interface Agreement {
  id: string;
  enrollment_id: string;
  waiver_accepted: boolean;
  photo_release_accepted: boolean;
  privacy_policy_accepted: boolean;
  terms_accepted: boolean;
  signature_text: string;
  signer_name: string;
  signer_email: string;
  signer_ip: string | null;
  signed_at: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
  waiver_version: string;
  tos_version: string;
  privacy_policy_version: string;
}

interface Props {
  enrollment: Enrollment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (updated: Enrollment) => void;
}

const EnrollmentDetailDialog = ({ enrollment, open, onOpenChange, onUpdated }: Props) => {
  const [form, setForm] = useState<Enrollment | null>(null);
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [loadingAgreement, setLoadingAgreement] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);
  const [sendingRegLink, setSendingRegLink] = useState(false);
  const [payLinkOpen, setPayLinkOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [originalSessionId, setOriginalSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (enrollment) {
      setForm({ ...enrollment });
      setOriginalSessionId(enrollment.session_id);
      fetchAgreement(enrollment.id);
      fetchSessions();
    }
  }, [enrollment]);

  const fetchAgreement = async (enrollmentId: string) => {
    setLoadingAgreement(true);
    const { data } = await supabase
      .from("enrollment_agreements")
      .select("*")
      .eq("enrollment_id", enrollmentId)
      .maybeSingle();
    setAgreement(data as Agreement | null);
    setLoadingAgreement(false);
  };

  const fetchSessions = async () => {
    const [sessionsRes, periodsRes, enrollRes] = await Promise.all([
      supabase.from("swim_sessions").select("id, swim_level, day_of_week, start_time, end_time, max_students, age_group, session_period_id").eq("is_active", true),
      supabase.from("session_periods").select("id, name").eq("is_active", true),
      supabase.from("swim_enrollments").select("session_id").eq("status", "confirmed"),
    ]);
    const periodMap = new Map((periodsRes.data || []).map((p: any) => [p.id, p.name]));
    const counts = new Map<string, number>();
    (enrollRes.data || []).forEach((e: any) => {
      if (e.session_id) counts.set(e.session_id, (counts.get(e.session_id) || 0) + 1);
    });
    const opts: SessionOption[] = (sessionsRes.data || []).map((s: any) => ({
      ...s,
      period_name: s.session_period_id ? periodMap.get(s.session_period_id) || null : null,
      enrolled_count: counts.get(s.id) || 0,
    }));
    opts.sort((a, b) =>
      (a.period_name || "").localeCompare(b.period_name || "") ||
      a.day_of_week.localeCompare(b.day_of_week) ||
      a.start_time.localeCompare(b.start_time)
    );
    setSessions(opts);
  };

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    const updates: Record<string, unknown> = {
      child_name: form.child_name,
      child_age: form.child_age,
      parent_name: form.parent_name,
      parent_email: form.parent_email,
      parent_phone: form.parent_phone,
      swim_level: form.swim_level,
      status: form.status,
      payment_status: form.payment_status,
      session_fee_status: form.session_fee_status,
      notes: form.notes,
      session_id: form.session_id,
    };
    // If admin just flipped session fee to 'paid', stamp the timestamp
    if (form.session_fee_status === "paid" && !form.session_fee_paid_at) {
      updates.session_fee_paid_at = new Date().toISOString();
    }
    const { error } = await supabase
      .from("swim_enrollments")
      .update(updates)
      .eq("id", form.id);

    setSaving(false);
    if (error) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    } else {
      const movedTo = form.session_id !== originalSessionId
        ? sessions.find((s) => s.id === form.session_id)
        : null;
      toast({
        title: movedTo ? `Moved ${form.child_name}` : "Enrollment updated",
        description: movedTo ? describeSession(movedTo) : undefined,
      });
      setOriginalSessionId(form.session_id);
      onUpdated(form);
    }
  };

  const update = (key: keyof Enrollment, value: string | number | null) => {
    if (form) setForm({ ...form, [key]: value });
  };

  const handleSendPaymentLink = () => {
    if (!form) return;
    setPayLinkOpen(true);
  };

  const payLinkTarget: SendPaymentLinkTarget | null = form
    ? {
        enrollmentId: form.id,
        sessionId: form.session_id,
        childName: form.child_name,
        parentEmail: form.parent_email,
        isFirstTime: form.is_first_time,
        waiverSignedAt: (form as any).waiver_signed_at ?? null,
      }
    : null;

  const handleSendRegFeeLink = async () => {
    if (!form) return;
    setSendingRegLink(true);
    const { data, error } = await supabase.functions.invoke("send-registration-fee-payment-link", {
      body: { enrollmentId: form.id, environment: "live" },
    });
    setSendingRegLink(false);
    if (error || !data?.success) {
      toast({ title: "Failed to send", description: error?.message || data?.error || "Please try again.", variant: "destructive" });
    } else {
      toast({ title: "Registration fee link sent!", description: `Email sent to ${form.parent_email}` });
    }
  };

  if (!form) return null;

  const levelInfo = LEVEL_DISPLAY[form.swim_level as SwimLevel];
  const ageGroup = getAgeGroup(form.child_age);
  const groupName = levelInfo ? getGroupName(form.swim_level as SwimLevel, ageGroup) : form.swim_level;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{form.child_name}</span>
            <Badge variant="outline" className={levelInfo?.color || ""}>{groupName} ({levelInfo?.name || form.swim_level})</Badge>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="details" className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details">Enrollment Details</TabsTrigger>
            <TabsTrigger value="agreement">
              Signed Agreement
              {agreement && <FileCheck className="ml-1.5 w-3.5 h-3.5 text-green-600" />}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details">
            <ScrollArea className="h-[55vh] pr-4">
              <div className="space-y-5 py-2">
                {/* Child Info */}
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-3">Child Information</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Child Name</Label>
                      <Input value={form.child_name} onChange={(e) => update("child_name", e.target.value)} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs">Age</Label>
                      <Input type="number" value={form.child_age} onChange={(e) => update("child_age", parseInt(e.target.value) || 0)} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs">Swim Level</Label>
                      <Select value={form.swim_level} onValueChange={(v) => update("swim_level", v)}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(LEVEL_DISPLAY).map(([key, val]) => (
                            <SelectItem key={key} value={key}>{val.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Status</Label>
                      <Select value={form.status} onValueChange={(v) => update("status", v)}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="enrolled">Enrolled</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Class Assignment */}
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                    <CalendarClock className="w-4 h-4" />
                    Class Assignment
                  </h4>
                  {(() => {
                    const current = sessions.find((s) => s.id === form.session_id);
                    const isMoved = form.session_id !== originalSessionId;
                    return (
                      <div className="space-y-3">
                        <div className="p-3 rounded-md border bg-muted/40">
                          <p className="text-[11px] text-muted-foreground">Currently in</p>
                          <p className="text-sm font-medium">
                            {current ? describeSession(current) : form.session_id ? "Loading…" : "Not assigned to a class"}
                          </p>
                        </div>
                        <div>
                          <Label className="text-xs flex items-center gap-1.5">
                            <ArrowRightLeft className="w-3 h-3" />
                            Move to a different class
                          </Label>
                          <Select
                            value={form.session_id || ""}
                            onValueChange={(v) => update("session_id", v)}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder="Select a class…" />
                            </SelectTrigger>
                            <SelectContent>
                              {sessions.map((s) => {
                                const full = s.enrolled_count >= s.max_students && s.id !== originalSessionId;
                                return (
                                  <SelectItem key={s.id} value={s.id} disabled={full}>
                                    {describeSession(s)} — {full ? "FULL" : `${s.enrolled_count}/${s.max_students}`}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                          {isMoved && (
                            <p className="text-[11px] text-amber-600 mt-1.5">
                              Pending: click "Save Changes" to confirm move.
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <Separator />

                {/* Payment Info */}
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-3">Payment</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-md border">
                      <Label className="text-[11px] text-muted-foreground">
                        Registration Fee {form.is_first_time ? "($45)" : "(N/A — returning)"}
                      </Label>
                      <Select value={form.payment_status} onValueChange={(v) => update("payment_status", v)}>
                        <SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unpaid">Unpaid</SelectItem>
                          <SelectItem value="paid">Paid</SelectItem>
                          <SelectItem value="refunded">Refunded</SelectItem>
                          <SelectItem value="waived">Waived</SelectItem>
                          <SelectItem value="not_required">N/A (returning)</SelectItem>
                          <SelectItem value="comp">Comp</SelectItem>
                          <SelectItem value="flagged_no_pay">Flagged (no pay)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="p-3 rounded-md border">
                      <Label className="text-[11px] text-muted-foreground">Session Fee ($240)</Label>
                      <Select value={form.session_fee_status} onValueChange={(v) => update("session_fee_status", v)}>
                        <SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="due_day_1">Due Day 1</SelectItem>
                          <SelectItem value="paid">Paid</SelectItem>
                          <SelectItem value="comp">Comp</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="p-3 rounded-md border">
                      <p className="text-[11px] text-muted-foreground">First-Time Swimmer</p>
                      <p className="text-sm font-medium">{form.is_first_time ? "Yes" : "No (returning)"}</p>
                    </div>
                    <div className="p-3 rounded-md border">
                      <p className="text-[11px] text-muted-foreground">Session Start Date</p>
                      <p className="text-sm font-medium">{form.payment_due_date ? new Date(form.payment_due_date + "T00:00:00").toLocaleDateString() : "—"}</p>
                    </div>
                    {form.stripe_payment_id && (
                      <div className="col-span-2 p-3 rounded-md border">
                        <p className="text-[11px] text-muted-foreground">Stripe Reference (Reg Fee)</p>
                        <p className="text-sm font-mono">{form.stripe_payment_id}</p>
                      </div>
                    )}
                    {form.session_fee_stripe_id && (
                      <div className="col-span-2 p-3 rounded-md border">
                        <p className="text-[11px] text-muted-foreground">Stripe Reference (Session Fee)</p>
                        <p className="text-sm font-mono">{form.session_fee_stripe_id}</p>
                      </div>
                    )}
                    {form.is_first_time && form.payment_status === "unpaid" && (
                      <div className="col-span-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={handleSendRegFeeLink}
                          disabled={sendingRegLink}
                        >
                          <Send className="w-4 h-4 mr-2" />
                          {sendingRegLink ? "Sending..." : "Send $45 Registration Fee Payment Link"}
                        </Button>
                      </div>
                    )}
                    {form.session_fee_status === "due_day_1" && (
                      <div className="col-span-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={handleSendPaymentLink}
                          disabled={sendingLink}
                        >
                          <Send className="w-4 h-4 mr-2" />
                          Send Session Fee Payment Link…
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Parent Info */}
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-3">Parent / Guardian</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Name</Label>
                      <Input value={form.parent_name} onChange={(e) => update("parent_name", e.target.value)} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs">Email</Label>
                      <Input value={form.parent_email} onChange={(e) => update("parent_email", e.target.value)} className="mt-1" />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Phone</Label>
                      <Input value={form.parent_phone || ""} onChange={(e) => update("parent_phone", e.target.value || null)} className="mt-1" />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Notes */}
                <div>
                  <Label className="text-xs">Notes</Label>
                  <Textarea value={form.notes || ""} onChange={(e) => update("notes", e.target.value || null)} className="mt-1" rows={3} />
                </div>

                <div className="text-xs text-muted-foreground">
                  Enrolled: {new Date(form.created_at).toLocaleString()}
                </div>

                <Button onClick={handleSave} disabled={saving} className="w-full">
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="agreement">
            <ScrollArea className="h-[55vh] pr-4">
              {loadingAgreement ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                </div>
              ) : !agreement ? (
                <div className="text-center py-12 text-muted-foreground">
                  <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
                  <p className="font-medium">No signed agreement on file</p>
                  <p className="text-sm mt-1">This enrollment does not have a completed legal agreement.</p>
                </div>
              ) : (
                <div className="space-y-5 py-2">
                  {/* Acceptance Summary */}
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-3">Document Acceptance</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <AcceptBadge label="Liability Waiver" accepted={agreement.waiver_accepted} version={agreement.waiver_version} />
                      <AcceptBadge label="Privacy Policy" accepted={agreement.privacy_policy_accepted} version={agreement.privacy_policy_version} />
                      <AcceptBadge label="Terms of Service" accepted={agreement.terms_accepted} version={agreement.tos_version} />
                      <div className="flex items-center gap-2 p-2 rounded-md border">
                        <Camera className={`w-4 h-4 ${agreement.photo_release_accepted ? "text-green-600" : "text-muted-foreground"}`} />
                        <div>
                          <p className="text-xs font-medium">Photo Release</p>
                          <p className="text-[11px] text-muted-foreground">
                            {agreement.photo_release_accepted ? "Granted" : "Declined"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Signature */}
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-3">Electronic Signature</h4>
                    <div className="border-2 border-primary/20 rounded-lg p-4 bg-primary/5">
                      <p className="font-serif italic text-xl text-foreground">{agreement.signature_text}</p>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <div><span className="font-medium text-foreground">Signer:</span> {agreement.signer_name}</div>
                        <div><span className="font-medium text-foreground">Email:</span> {agreement.signer_email}</div>
                        <div><span className="font-medium text-foreground">Signed:</span> {new Date(agreement.signed_at).toLocaleString()}</div>
                        <div><span className="font-medium text-foreground">IP:</span> {agreement.signer_ip || "Not recorded"}</div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Emergency Contact */}
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-3">Emergency Contact</h4>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="flex items-center gap-2 p-3 rounded-md border">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-[11px] text-muted-foreground">Name</p>
                          <p className="text-sm font-medium">{agreement.emergency_contact_name}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 p-3 rounded-md border">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-[11px] text-muted-foreground">Phone</p>
                          <p className="text-sm font-medium">{agreement.emergency_contact_phone}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 p-3 rounded-md border">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-[11px] text-muted-foreground">Relationship</p>
                          <p className="text-sm font-medium">{agreement.emergency_contact_relationship}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
      <SendPaymentLinkDialog
        open={payLinkOpen}
        onOpenChange={setPayLinkOpen}
        target={payLinkTarget}
      />
    </Dialog>
  );
};

const AcceptBadge = ({ label, accepted, version }: { label: string; accepted: boolean; version: string }) => (
  <div className="flex items-center gap-2 p-2 rounded-md border">
    <ShieldCheck className={`w-4 h-4 ${accepted ? "text-green-600" : "text-red-500"}`} />
    <div>
      <p className="text-xs font-medium">{label}</p>
      <p className="text-[11px] text-muted-foreground">v{version} · {accepted ? "Accepted" : "Not accepted"}</p>
    </div>
  </div>
);

export default EnrollmentDetailDialog;

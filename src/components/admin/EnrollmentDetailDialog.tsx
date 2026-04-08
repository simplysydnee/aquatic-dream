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
import { Save, FileCheck, ShieldCheck, Camera, AlertTriangle, User, Phone } from "lucide-react";

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

  useEffect(() => {
    if (enrollment) {
      setForm({ ...enrollment });
      fetchAgreement(enrollment.id);
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

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    const { error } = await supabase
      .from("swim_enrollments")
      .update({
        child_name: form.child_name,
        child_age: form.child_age,
        parent_name: form.parent_name,
        parent_email: form.parent_email,
        parent_phone: form.parent_phone,
        swim_level: form.swim_level,
        status: form.status,
        notes: form.notes,
      })
      .eq("id", form.id);

    setSaving(false);
    if (error) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Enrollment updated" });
      onUpdated(form);
    }
  };

  const update = (key: keyof Enrollment, value: string | number | null) => {
    if (form) setForm({ ...form, [key]: value });
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
            <Badge variant="outline" className={levelInfo?.color || ""}>{levelInfo?.name || form.swim_level}</Badge>
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
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="confirmed">Confirmed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
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

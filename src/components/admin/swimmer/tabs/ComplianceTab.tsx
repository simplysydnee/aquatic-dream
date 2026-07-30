import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveSwimmerWaiver } from "@/lib/swimmerWaiver";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, ShieldAlert, Camera, Phone, User as UserIcon, CircleHelp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { Swimmer } from "@/hooks/useSwimmers";

interface AgreementRow {
  id: string;
  enrollment_id: string | null;
  lesson_booking_id: string | null;
  signer_name: string;
  signer_email: string;
  signed_at: string;
  photo_release_accepted: boolean;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
}

interface MissingTarget {
  type: "lesson_booking" | "enrollment";
  id: string;
  label: string;
}

const fmtDateTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

export default function ComplianceTab({ swimmer, onChanged }: { swimmer: Swimmer; onChanged?: () => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [agreements, setAgreements] = useState<AgreementRow[]>([]);
  const [bookingWaiverFlags, setBookingWaiverFlags] = useState<Record<string, string | null>>({});
  const [familyWaiverOnFile, setFamilyWaiverOnFile] = useState(false);
  const [target, setTarget] = useState<MissingTarget | null>(null);
  const [signerName, setSignerName] = useState(swimmer.parent_name || "");
  const [note, setNote] = useState("");
  const [photoRelease, setPhotoRelease] = useState<"yes" | "no">("yes");
  const [submitting, setSubmitting] = useState(false);

  const enrollmentIds = swimmer.enrollments.map((e) => e.id);
  const bookingIds = swimmer.bookings.map((b) => b.id);

  const load = async () => {
    setLoading(true);
    const orParts: string[] = [];
    if (enrollmentIds.length) orParts.push(`enrollment_id.in.(${enrollmentIds.join(",")})`);
    if (bookingIds.length) orParts.push(`lesson_booking_id.in.(${bookingIds.join(",")})`);

    let rows: AgreementRow[] = [];
    if (orParts.length) {
      const { data } = await supabase
        .from("enrollment_agreements")
        .select(
          "id, enrollment_id, lesson_booking_id, signer_name, signer_email, signed_at, photo_release_accepted, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship",
        )
        .or(orParts.join(","))
        .order("signed_at", { ascending: false });
      rows = (data as AgreementRow[]) || [];
    }
    setAgreements(rows);

    if (bookingIds.length) {
      const { data: bks } = await supabase
        .from("lesson_bookings")
        .select("id, waiver_signed_at")
        .in("id", bookingIds);
      const map: Record<string, string | null> = {};
      (bks || []).forEach((b: any) => (map[b.id] = b.waiver_signed_at));
      setBookingWaiverFlags(map);
    } else {
      setBookingWaiverFlags({});
    }

    // Family-wide waiver-on-file check (last+dob primary, email/phone fallback).
    // This is the same rule the check-in flow uses, so a waiver signed under a
    // sibling record or a visitor waiver still counts here.
    try {
      const parts = (swimmer.child_name || "").trim().split(/\s+/);
      const first = parts[0] || "";
      const last = parts.slice(1).join(" ") || "";
      if (first) {
        const status = await resolveSwimmerWaiver({
          firstName: first,
          lastName: last,
          dob: swimmer.child_dob,
          parentEmail: swimmer.parent_email,
          parentPhone: swimmer.parent_phone,
        });
        setFamilyWaiverOnFile(status.onFile);
      } else {
        setFamilyWaiverOnFile(false);
      }
    } catch {
      setFamilyWaiverOnFile(false);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swimmer.key]);

  const latest = agreements[0];
  const hasAnyWaiver =
    agreements.length > 0 ||
    Object.values(bookingWaiverFlags).some(Boolean) ||
    familyWaiverOnFile;

  // Build per-record status rows
  const enrollmentRows = swimmer.enrollments.map((e) => {
    const ag = agreements.find((a) => a.enrollment_id === e.id);
    return {
      key: `enr-${e.id}`,
      label: `Enrollment · ${e.session?.period?.name || e.swim_level || "Session"}`,
      signed: !!ag,
      ag,
      target: ag ? null : ({ type: "enrollment" as const, id: e.id, label: e.session?.period?.name || "Enrollment" }),
    };
  });

  const bookingRows = swimmer.bookings.map((b) => {
    const ag = agreements.find((a) => a.lesson_booking_id === b.id);
    const stamped = !!bookingWaiverFlags[b.id];
    return {
      key: `bk-${b.id}`,
      label: `Lesson Booking · ${b.lesson_type} (${b.series_start})`,
      signed: !!ag || stamped,
      ag,
      target: ag || stamped ? null : ({ type: "lesson_booking" as const, id: b.id, label: `${b.lesson_type} ${b.series_start}` }),
    };
  });

  const allRows = [...enrollmentRows, ...bookingRows];

  const submit = async () => {
    if (!target) return;
    setSubmitting(true);
    const { error } = await supabase.functions.invoke("admin-mark-waiver-complete", {
      body: {
        targetType: target.type,
        targetId: target.id,
        signerName: signerName.trim() || swimmer.parent_name,
        signerEmail: swimmer.parent_email,
        note: note.trim() || undefined,
        photoRelease: photoRelease === "yes",
        emergencyContactName: undefined,
        emergencyContactPhone: undefined,
      },
    });
    setSubmitting(false);
    if (error) {
      toast({
        title: "Could not mark waiver complete",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Waiver marked complete" });
    setTarget(null);
    setNote("");
    await load();
    onChanged?.();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const photoBadge = !latest ? (
    <Badge variant="outline" className="gap-1"><CircleHelp className="h-3 w-3" /> Not answered</Badge>
  ) : latest.photo_release_accepted ? (
    <Badge className="bg-emerald-600 hover:bg-emerald-600 gap-1"><Camera className="h-3 w-3" /> Approved</Badge>
  ) : (
    <Badge variant="destructive" className="gap-1"><Camera className="h-3 w-3" /> Declined</Badge>
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-md border p-3">
          <div className="text-xs uppercase text-muted-foreground tracking-wide mb-1">Waiver</div>
          {hasAnyWaiver ? (
            <Badge className="bg-emerald-600 hover:bg-emerald-600 gap-1">
              <ShieldCheck className="h-3 w-3" /> On file
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <ShieldAlert className="h-3 w-3" /> Not signed
            </Badge>
          )}
          {latest && (
            <div className="text-xs text-muted-foreground mt-2">
              Last signed by <span className="font-medium text-foreground">{latest.signer_name}</span> ({latest.signer_email})
              <br />
              {fmtDateTime(latest.signed_at)}
            </div>
          )}
        </div>

        <div className="rounded-md border p-3">
          <div className="text-xs uppercase text-muted-foreground tracking-wide mb-1">Photo release</div>
          {photoBadge}
          {latest && (
            <div className="text-xs text-muted-foreground mt-2">
              Per most-recent waiver
            </div>
          )}
        </div>
      </div>

      {latest && (latest.emergency_contact_name || latest.emergency_contact_phone) && (
        <div className="rounded-md border p-3">
          <div className="text-xs uppercase text-muted-foreground tracking-wide mb-2">Emergency contact</div>
          <div className="text-sm space-y-1">
            <div className="flex items-center gap-2"><UserIcon className="h-3.5 w-3.5 text-muted-foreground" />{latest.emergency_contact_name || "—"}{latest.emergency_contact_relationship ? ` (${latest.emergency_contact_relationship})` : ""}</div>
            {latest.emergency_contact_phone && (
              <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" />{latest.emergency_contact_phone}</div>
            )}
          </div>
        </div>
      )}

      <div>
        <div className="text-xs uppercase text-muted-foreground tracking-wide mb-2">Per-record status</div>
        {allRows.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No enrollments or bookings on file yet.</p>
        ) : (
          <div className="space-y-2">
            {allRows.map((row) => (
              <div key={row.key} className="flex items-center justify-between gap-2 rounded-md border p-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{row.label}</div>
                  {row.ag && (
                    <div className="text-xs text-muted-foreground truncate">
                      Signed by {row.ag.signer_name} · {fmtDateTime(row.ag.signed_at)}
                    </div>
                  )}
                </div>
                {row.signed ? (
                  <Badge className="bg-emerald-600 hover:bg-emerald-600 gap-1 shrink-0">
                    <ShieldCheck className="h-3 w-3" /> Signed
                  </Badge>
                ) : familyWaiverOnFile ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="gap-1 text-emerald-700 border-emerald-300">
                      <ShieldCheck className="h-3 w-3" /> Covered by waiver on file
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs"
                      onClick={() => row.target && setTarget(row.target)}
                    >
                      Attach agreement
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => row.target && setTarget(row.target)}
                  >
                    Mark complete
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark waiver complete</DialogTitle>
            <DialogDescription>
              Use this when a parent has signed a waiver in person, by paper, or under a different
              email than the one on the account. This creates an agreement record on file.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Record</Label>
              <div className="text-sm text-muted-foreground">{target?.label}</div>
            </div>
            <div>
              <Label htmlFor="signer">Signer name</Label>
              <Input id="signer" value={signerName} onChange={(e) => setSignerName(e.target.value)} />
            </div>
            <div>
              <Label>Photo release</Label>
              <RadioGroup value={photoRelease} onValueChange={(v) => setPhotoRelease(v as "yes" | "no")} className="flex gap-4 mt-1">
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="pr-yes" value="yes" />
                  <Label htmlFor="pr-yes" className="font-normal">Approved</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="pr-no" value="no" />
                  <Label htmlFor="pr-no" className="font-normal">Declined</Label>
                </div>
              </RadioGroup>
            </div>
            <div>
              <Label htmlFor="note">Note (optional)</Label>
              <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Mom signed in person 5/11; signed under different email" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)}>Cancel</Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Mark complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

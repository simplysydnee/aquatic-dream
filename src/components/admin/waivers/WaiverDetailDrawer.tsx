import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mail, Loader2 } from "lucide-react";
import { resendVisitorWaiverCopy } from "@/lib/visitorWaiver";
import { useToast } from "@/hooks/use-toast";
import type { UnifiedWaiverRow } from "@/pages/admin/WaiversAdmin";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  row: UnifiedWaiverRow | null;
}

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="grid grid-cols-3 gap-2 py-2 border-b border-border/50 text-sm">
    <div className="text-muted-foreground">{label}</div>
    <div className="col-span-2 text-foreground break-words">{value || "—"}</div>
  </div>
);

const WaiverDetailDrawer = ({ open, onOpenChange, row }: Props) => {
  const { toast } = useToast();
  const [resending, setResending] = useState(false);

  if (!row) return null;
  const raw: any = row.raw;
  const swimmers = row.swimmers || [];

  const handleResend = async () => {
    if (row.source !== "visitor") return;
    setResending(true);
    try {
      await resendVisitorWaiverCopy(row.id);
      toast({ title: "Copy resent", description: `Sent to ${row.signer_email}` });
    } catch (e: any) {
      toast({
        title: "Could not resend",
        description: e?.message,
        variant: "destructive",
      });
    } finally {
      setResending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {row.signer_name}
            <Badge variant="outline" className="capitalize">{row.source}</Badge>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-1">
          <Row label="Email" value={row.signer_email} />
          <Row label="Phone" value={row.signer_phone} />
          <Row label="Signed" value={new Date(row.signed_at).toLocaleString()} />
          <Row
            label="Photo release"
            value={row.photo_release ? "Consented" : "Declined"}
          />
          <Row
            label="Swimmers"
            value={
              swimmers.length === 0
                ? "—"
                : swimmers
                    .map((s: any) =>
                      `${s.first_name || ""} ${s.last_name || ""}`.trim() +
                      (s.relationship ? ` (${s.relationship})` : "") +
                      (s.dob ? ` — DOB ${s.dob}` : ""),
                    )
                    .join("; ")
            }
          />
          <Row label="Signature" value={<em>{raw.signature_text}</em>} />
          <Row
            label="Emergency contact"
            value={
              [
                `${raw.emergency_contact_first_name || ""} ${raw.emergency_contact_last_name || raw.emergency_contact_name || ""}`.trim(),
                raw.emergency_contact_relationship,
                raw.emergency_contact_phone,
              ]
                .filter(Boolean)
                .join(" • ")
            }
          />
          <Row label="Signer IP" value={raw.signer_ip} />
          <Row
            label="Versions"
            value={`Waiver ${raw.waiver_version} • Terms ${raw.tos_version} • Privacy ${raw.privacy_policy_version}`}
          />
          {row.source === "visitor" && (
            <Row
              label="Email copy"
              value={
                raw.email_sent_at
                  ? `Sent ${new Date(raw.email_sent_at).toLocaleString()}`
                  : "Not yet sent"
              }
            />
          )}
        </div>

        {row.source === "visitor" && (
          <div className="mt-6">
            <Button
              variant="outline"
              className="w-full"
              onClick={handleResend}
              disabled={resending}
            >
              {resending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Mail className="w-4 h-4 mr-2" />
              )}
              Resend copy to signer
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default WaiverDetailDrawer;

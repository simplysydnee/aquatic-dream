import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, Loader2, Link2, Trash2, Search, Plus } from "lucide-react";
import { resendVisitorWaiverCopy } from "@/lib/visitorWaiver";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { UnifiedWaiverRow } from "@/pages/admin/WaiversAdmin";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  row: UnifiedWaiverRow | null;
  onChanged?: () => void;
}

type LinkTarget = {
  kind: "enrollment" | "lesson";
  target_id: string;
  child_name: string | null;
  parent_name: string | null;
  parent_email: string | null;
  detail: string | null;
};

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="grid grid-cols-3 gap-2 py-2 border-b border-border/50 text-sm">
    <div className="text-muted-foreground">{label}</div>
    <div className="col-span-2 text-foreground break-words">{value || "—"}</div>
  </div>
);

const WaiverDetailDrawer = ({ open, onOpenChange, row, onChanged }: Props) => {
  const { toast } = useToast();
  const [resending, setResending] = useState(false);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<LinkTarget[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!row) return null;
  const raw: any = row.raw;
  const swimmers = row.swimmers || [];
  const isVisitor = row.source === "visitor";

  const handleResend = async () => {
    if (!isVisitor) return;
    setResending(true);
    try {
      await resendVisitorWaiverCopy(row.id);
      toast({ title: "Copy resent", description: `Sent to ${row.signer_email}` });
    } catch (e: any) {
      toast({ title: "Could not resend", description: e?.message, variant: "destructive" });
    } finally {
      setResending(false);
    }
  };

  const runSearch = async () => {
    const q = search.trim();
    if (q.length < 3) {
      toast({ title: "Type at least 3 characters", variant: "destructive" });
      return;
    }
    setSearching(true);
    try {
      const { data, error } = await supabase.rpc("admin_search_link_targets" as any, { _q: q });
      if (error) throw error;
      setResults((data as LinkTarget[]) || []);
    } catch (e: any) {
      toast({ title: "Search failed", description: e?.message, variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const linkTo = async (t: LinkTarget) => {
    setBusyId(t.target_id);
    try {
      const payload: any = { _waiver_id: row.id };
      if (t.kind === "enrollment") payload._enrollment_id = t.target_id;
      else payload._lesson_booking_id = t.target_id;
      const { error } = await supabase.rpc("admin_link_visitor_waiver" as any, payload);
      if (error) throw error;
      toast({ title: "Linked", description: `${t.child_name || "Swimmer"} now linked to this waiver` });
      onChanged?.();
    } catch (e: any) {
      toast({ title: "Link failed", description: e?.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const unlink = async (enrollment_id: string | null, lesson_booking_id: string | null) => {
    const key = enrollment_id || lesson_booking_id || "";
    setBusyId(key);
    try {
      const { error } = await supabase.rpc("admin_unlink_visitor_waiver" as any, {
        _waiver_id: row.id,
        _enrollment_id: enrollment_id,
        _lesson_booking_id: lesson_booking_id,
      });
      if (error) throw error;
      toast({ title: "Unlinked" });
      onChanged?.();
    } catch (e: any) {
      toast({ title: "Unlink failed", description: e?.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const existingLinkIds = new Set(
    (row.links || []).map((l) => l.enrollment_id || l.lesson_booking_id).filter(Boolean) as string[],
  );

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
          <Row label="Photo release" value={row.photo_release ? "Consented" : "Declined"} />
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
          {isVisitor && (
            <Row
              label="Email copy"
              value={raw.email_sent_at ? `Sent ${new Date(raw.email_sent_at).toLocaleString()}` : "Not yet sent"}
            />
          )}
        </div>

        {isVisitor && (
          <div className="mt-6 space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Link2 className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">Linked swimmers</h3>
              </div>
              {(row.links?.length || 0) === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No matching enrolled swimmer or lesson booking. Use search below to link manually.
                </p>
              ) : (
                <div className="space-y-2">
                  {row.links!.map((l, i) => {
                    const id = l.enrollment_id || l.lesson_booking_id || "";
                    return (
                      <div
                        key={`${id}-${i}`}
                        className="flex items-center justify-between gap-2 border border-border rounded-md px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="font-medium truncate">{l.child_name || "—"}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {l.link_kind === "enrollment" ? "Enrollment" : "Lesson booking"}
                            {l.parent_email ? ` • ${l.parent_email}` : ""}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busyId === id}
                          onClick={() => unlink(l.enrollment_id, l.lesson_booking_id)}
                        >
                          {busyId === id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <h3 className="font-semibold text-sm mb-2">Manually link to a swimmer</h3>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by child name, parent name or email…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && runSearch()}
                    className="pl-8"
                  />
                </div>
                <Button onClick={runSearch} disabled={searching} variant="secondary">
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
                </Button>
              </div>

              {results.length > 0 && (
                <div className="mt-3 space-y-2 max-h-72 overflow-y-auto">
                  {results.map((t) => {
                    const already = existingLinkIds.has(t.target_id);
                    return (
                      <div
                        key={`${t.kind}-${t.target_id}`}
                        className="flex items-center justify-between gap-2 border border-border rounded-md px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="font-medium truncate">
                            {t.child_name || "—"}{" "}
                            <Badge variant="outline" className="ml-1 capitalize">{t.kind}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {t.parent_name ? `${t.parent_name} • ` : ""}
                            {t.parent_email || ""}
                            {t.detail ? ` • ${t.detail}` : ""}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant={already ? "outline" : "default"}
                          disabled={already || busyId === t.target_id}
                          onClick={() => linkTo(t)}
                        >
                          {busyId === t.target_id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : already ? (
                            "Linked"
                          ) : (
                            <>
                              <Plus className="w-4 h-4 mr-1" /> Link
                            </>
                          )}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
              {!searching && search.trim().length >= 3 && results.length === 0 && (
                <p className="text-xs text-muted-foreground mt-2">No matches yet — try searching.</p>
              )}
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={handleResend}
              disabled={resending}
            >
              {resending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
              Resend copy to signer
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default WaiverDetailDrawer;

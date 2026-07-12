import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

type Variant = "pay_link" | "reminder_only" | "skipped_no_phone" | "skipped_already_sent";

type PreviewRow = {
  enrollmentId: string;
  childName: string;
  parentName: string;
  parentPhone: string | null;
  routedPhone: string | null;
  sessionName: string | null;
  startTime: string | null;
  variant: Variant;
  willSend: boolean;
  includesLink: boolean;
  payLink: string | null;
  message: string;
  skipReason: string | null;
};

type PreviewResponse = {
  ok: boolean;
  targetDate: string;
  rows: PreviewRow[];
  total: number;
  withPayLink: number;
  reminderOnly: number;
  skippedNoPhone: number;
  skippedAlreadySent: number;
  isTest?: boolean;
};

interface Props {
  open: boolean;
  onClose: () => void;
  /** "all" or a specific sessionPeriodId */
  periodFilter: string;
  /** If provided, preview will render as test-mode by default. */
  initialTestPhone?: string;
}

const VARIANT_LABEL: Record<Variant, string> = {
  pay_link: "Pay link",
  reminder_only: "Reminder only",
  skipped_no_phone: "Skip: no phone",
  skipped_already_sent: "Skip: already sent",
};

export default function StartReminderPreviewDialog({
  open,
  onClose,
  periodFilter,
  initialTestPhone,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [testPhone, setTestPhone] = useState<string>(initialTestPhone ?? "");
  const [useTestPhone, setUseTestPhone] = useState<boolean>(!!initialTestPhone);

  const loadPreview = async (opts: { testPhone?: string | null } = {}) => {
    setLoading(true);
    setPreview(null);
    try {
      const body: Record<string, unknown> = { mode: "preview" };
      if (periodFilter !== "all") body.sessionPeriodId = periodFilter;
      if (opts.testPhone) body.testPhone = opts.testPhone;
      const { data, error } = await supabase.functions.invoke(
        "send-session-start-reminders",
        { body },
      );
      if (error) {
        toast({ title: "Preview failed", description: error.message, variant: "destructive" });
        return;
      }
      const resp = data as PreviewResponse;
      setPreview(resp);
      const initial: Record<string, boolean> = {};
      for (const r of resp.rows) initial[r.enrollmentId] = r.willSend;
      setChecked(initial);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setTestPhone(initialTestPhone ?? "");
    setUseTestPhone(!!initialTestPhone);
    void loadPreview({ testPhone: initialTestPhone ?? null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, periodFilter]);

  const rows = preview?.rows ?? [];
  const checkedIds = useMemo(
    () => rows.filter((r) => r.willSend && checked[r.enrollmentId]).map((r) => r.enrollmentId),
    [rows, checked],
  );

  const toggleAll = (val: boolean) => {
    const next: Record<string, boolean> = {};
    for (const r of rows) next[r.enrollmentId] = val && r.willSend;
    setChecked(next);
  };

  const doSend = async (routeToTest: boolean) => {
    if (checkedIds.length === 0) {
      toast({ title: "No rows selected", description: "Check at least one row to send." });
      return;
    }
    const routedTestPhone = routeToTest ? testPhone.trim() : "";
    if (routeToTest && !routedTestPhone) {
      toast({ title: "Enter a test phone", description: "Format: +12095551234", variant: "destructive" });
      return;
    }
    const label = routeToTest
      ? `Send ${checkedIds.length} test message${checkedIds.length === 1 ? "" : "s"} to ${routedTestPhone}?`
      : `Send ${checkedIds.length} SMS to families now?`;
    if (!window.confirm(label)) return;

    setSending(true);
    try {
      const body: Record<string, unknown> = {
        mode: "send",
        enrollmentIds: checkedIds,
      };
      if (periodFilter !== "all") body.sessionPeriodId = periodFilter;
      if (routeToTest) {
        body.testPhone = routedTestPhone;
        try {
          window.localStorage.setItem("admin_test_sms_phone", routedTestPhone);
        } catch {
          // ignore
        }
      }
      const { data, error } = await supabase.functions.invoke(
        "send-session-start-reminders",
        { body },
      );
      if (error) {
        toast({ title: "Send failed", description: error.message, variant: "destructive" });
        return;
      }
      toast({
        title: routeToTest ? "Test SMS sent" : "Start reminders sent",
        description: `${data?.sent ?? 0} sent, ${data?.failed ?? 0} failed.`,
      });
      onClose();
    } finally {
      setSending(false);
    }
  };

  const formatTime = (t: string | null) => {
    if (!t) return "";
    const [h, m] = t.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-6xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Preview start-of-session reminders
            {preview?.targetDate ? ` — ${preview.targetDate}` : ""}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2 text-sm text-muted-foreground">Building preview and Stripe links…</span>
          </div>
        ) : !preview ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No preview loaded.</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline">{preview.withPayLink} pay link</Badge>
              <Badge variant="outline">{preview.reminderOnly} reminder only</Badge>
              <Badge variant="outline">{preview.skippedNoPhone} no phone</Badge>
              <Badge variant="outline">{preview.skippedAlreadySent} already texted</Badge>
              <span className="ml-auto text-muted-foreground">{checkedIds.length} selected</span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" variant="ghost" onClick={() => toggleAll(true)}>Select all sendable</Button>
              <Button size="sm" variant="ghost" onClick={() => toggleAll(false)}>Clear</Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => loadPreview({ testPhone: useTestPhone ? testPhone.trim() || null : null })}
              >
                Refresh
              </Button>
            </div>

            <div className="overflow-auto border rounded-md flex-1">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr className="text-left">
                    <th className="p-2 w-10"></th>
                    <th className="p-2">Family</th>
                    <th className="p-2">Phone</th>
                    <th className="p-2">Session</th>
                    <th className="p-2">Variant</th>
                    <th className="p-2">Message</th>
                    <th className="p-2">Pay link</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td className="p-4 text-center text-muted-foreground" colSpan={7}>
                        No enrollments match.
                      </td>
                    </tr>
                  )}
                  {rows.map((r) => (
                    <tr key={r.enrollmentId} className={`border-t ${!r.willSend ? "opacity-60" : ""}`}>
                      <td className="p-2 align-top">
                        <Checkbox
                          checked={!!checked[r.enrollmentId]}
                          disabled={!r.willSend}
                          onCheckedChange={(v) =>
                            setChecked((prev) => ({ ...prev, [r.enrollmentId]: !!v }))
                          }
                        />
                      </td>
                      <td className="p-2 align-top">
                        <div className="font-medium">{r.childName}</div>
                        <div className="text-muted-foreground">{r.parentName}</div>
                      </td>
                      <td className="p-2 align-top whitespace-nowrap">
                        {r.parentPhone || <span className="text-destructive">(none)</span>}
                      </td>
                      <td className="p-2 align-top whitespace-nowrap">
                        {r.sessionName ?? "—"}
                        <div className="text-muted-foreground">{formatTime(r.startTime)}</div>
                      </td>
                      <td className="p-2 align-top whitespace-nowrap">
                        <Badge variant={r.willSend ? "default" : "secondary"}>
                          {VARIANT_LABEL[r.variant]}
                        </Badge>
                      </td>
                      <td className="p-2 align-top">
                        <div className="max-w-md whitespace-pre-wrap break-words">{r.message}</div>
                      </td>
                      <td className="p-2 align-top">
                        {r.payLink ? (
                          <a
                            href={r.payLink}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline break-all"
                          >
                            open
                          </a>
                        ) : r.includesLink ? (
                          <span className="text-destructive">missing</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-end gap-3 pt-2 border-t">
              <div className="flex-1 min-w-[220px]">
                <Label htmlFor="test-phone" className="text-xs">Test phone (route all checked here)</Label>
                <div className="flex gap-2">
                  <Input
                    id="test-phone"
                    placeholder="+12095551234"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const p = testPhone.trim();
                      setUseTestPhone(!!p);
                      void loadPreview({ testPhone: p || null });
                    }}
                  >
                    Re-render as test
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}

        <DialogFooter className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button
            variant="outline"
            onClick={() => void doSend(true)}
            disabled={sending || loading || checkedIds.length === 0 || !testPhone.trim()}
          >
            Send checked to my number
          </Button>
          <Button
            onClick={() => void doSend(false)}
            disabled={sending || loading || checkedIds.length === 0}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Send checked to families
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

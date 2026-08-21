import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { StaffPinPad } from "./StaffPinPad";
import {
  isNotAuthorized,
  type StaffInstructorForDate,
  type StaffPinStatusRow,
  type StaffRole,
  type StaffSession,
} from "./staffTypes";
import { formatClockPacific, formatTimeLabel, todayPacific } from "@/lib/staffDate";

interface Props {
  onSignedIn: (session: StaffSession) => void;
}

type Mode = "verify" | "enroll";

export function StaffInstructorPicker({ onSignedIn }: Props) {
  const today = todayPacific();
  const [loading, setLoading] = useState(true);
  const [notAuthorized, setNotAuthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [instructors, setInstructors] = useState<StaffInstructorForDate[]>([]);
  const [pinStatus, setPinStatus] = useState<StaffPinStatusRow[]>([]);

  const [selected, setSelected] = useState<StaffInstructorForDate | null>(null);
  const [mode, setMode] = useState<Mode>("verify");
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [authorizerId, setAuthorizerId] = useState("");
  const [authorizerPin, setAuthorizerPin] = useState("");
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [dialogSuccess, setDialogSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const [instRes, statusRes] = await Promise.all([
        supabase.rpc("staff_instructors_for_date", { p_date: today }),
        supabase.rpc("staff_pin_status"),
      ]);
      if (cancelled) return;
      if (isNotAuthorized(instRes.error?.message) || isNotAuthorized(statusRes.error?.message)) {
        setNotAuthorized(true);
        setLoading(false);
        return;
      }
      if (instRes.error) setError(instRes.error.message);
      setInstructors(((instRes.data ?? []) as StaffInstructorForDate[]).slice().sort((a, b) =>
        (a.first_lesson ?? "").localeCompare(b.first_lesson ?? "")
      ));
      setPinStatus((statusRes.data ?? []) as StaffPinStatusRow[]);
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [today]);

  const authorizers = useMemo(
    () => pinStatus.filter((p) => (p.role === "supervisor" || p.role === "admin") && p.has_pin),
    [pinStatus]
  );

  const statusFor = (instructorId: string) => pinStatus.find((p) => p.instructor_id === instructorId);

  const openTile = (inst: StaffInstructorForDate) => {
    const status = statusFor(inst.instructor_id);
    setSelected(inst);
    setMode(status && !status.has_pin ? "enroll" : "verify");
    setPin("");
    setNewPin("");
    setAuthorizerId("");
    setAuthorizerPin("");
    setDialogError(null);
    setLockedUntil(null);
  };

  const closeDialog = () => {
    setSelected(null);
    setPin("");
    setNewPin("");
    setAuthorizerPin("");
    setDialogError(null);
    setLockedUntil(null);
  };

  const submitVerify = async () => {
    if (!selected || pin.length < 4) return;
    setSubmitting(true);
    setDialogError(null);
    const { data, error: rpcError } = await supabase.rpc("staff_pin_verify", {
      p_instructor_id: selected.instructor_id,
      p_pin: pin,
    });
    setSubmitting(false);
    if (rpcError) {
      setDialogError(rpcError.message);
      setPin("");
      return;
    }
    const row = (data ?? [])[0];
    if (!row || !row.ok) {
      if (row?.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
        setLockedUntil(row.locked_until);
      } else {
        setDialogError("That PIN did not work. Try again.");
      }
      setPin("");
      return;
    }
    onSignedIn({
      instructorId: row.instructor_id,
      instructorName: row.instructor_name,
      role: (row.role as StaffRole) ?? "instructor",
    });
  };

  const submitEnroll = async () => {
    if (!selected || newPin.length < 4 || !authorizerId || authorizerPin.length < 4) return;
    setSubmitting(true);
    setDialogError(null);
    const { data, error: rpcError } = await supabase.rpc("staff_pin_enroll", {
      p_instructor_id: selected.instructor_id,
      p_new_pin: newPin,
      p_authorizer_id: authorizerId,
      p_authorizer_pin: authorizerPin,
    });
    setSubmitting(false);
    if (rpcError || !data) {
      setDialogError(rpcError?.message ?? "Could not set up that PIN. Check the authorizing PIN.");
      setAuthorizerPin("");
      return;
    }
    setPinStatus((prev) =>
      prev.map((p) => (p.instructor_id === selected.instructor_id ? { ...p, has_pin: true } : p))
    );
    setMode("verify");
    setPin("");
    setNewPin("");
    setAuthorizerPin("");
    setDialogError("PIN set. Enter it now to sign in.");
  };

  if (notAuthorized) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <h1 className="text-2xl font-semibold">Staff mode is not set up on this device.</h1>
        <p className="mt-3 text-muted-foreground">
          Ask an administrator to sign this tablet in with the staff kiosk account.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-3xl font-bold">Who is teaching?</h1>
      <p className="mt-1 text-lg text-muted-foreground">Tap your name to sign in.</p>

      {error && <p className="mt-4 text-destructive">{error}</p>}

      {instructors.length === 0 ? (
        <Card className="mt-8 p-10 text-center text-xl text-muted-foreground">
          No lessons scheduled today.
        </Card>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {instructors.map((inst) => {
            const status = statusFor(inst.instructor_id);
            return (
              <button
                key={inst.instructor_id}
                type="button"
                onClick={() => openTile(inst)}
                className="rounded-xl border-2 border-border bg-card p-6 text-left transition hover:border-primary hover:bg-accent focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
              >
                <div className="text-2xl font-semibold">{inst.instructor_name}</div>
                <div className="mt-2 text-lg text-muted-foreground">
                  {inst.lesson_count} {inst.lesson_count === 1 ? "lesson" : "lessons"}
                  {inst.first_lesson ? ` · first at ${formatTimeLabel(inst.first_lesson)}` : ""}
                </div>
                {status && !status.has_pin && (
                  <div className="mt-3 inline-block rounded-full bg-secondary px-3 py-1 text-sm font-medium">
                    Set up PIN
                  </div>
                )}
                {status?.locked && (
                  <div className="mt-3 inline-block rounded-full bg-destructive/10 px-3 py-1 text-sm font-medium text-destructive">
                    Locked
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {mode === "enroll" ? `Set up PIN for ${selected?.instructor_name}` : selected?.instructor_name}
            </DialogTitle>
          </DialogHeader>

          {lockedUntil ? (
            <div className="py-6 text-center text-lg font-medium text-destructive">
              Locked until {formatClockPacific(lockedUntil)}
            </div>
          ) : mode === "verify" ? (
            <div className="space-y-4">
              <StaffPinPad value={pin} onChange={setPin} disabled={submitting} label="Enter your 4 digit PIN" />
              {dialogError && <p className="text-center text-sm text-destructive">{dialogError}</p>}
              <Button className="h-14 w-full text-lg" disabled={pin.length < 4 || submitting} onClick={submitVerify}>
                {submitting ? "Checking…" : "Sign in"}
              </Button>
            </div>
          ) : (
            <div className="space-y-5">
              <StaffPinPad
                value={newPin}
                onChange={setNewPin}
                disabled={submitting}
                label="Choose your 4 digit PIN"
              />
              <div className="space-y-2">
                <p className="text-sm font-medium">A supervisor or admin must authorize this</p>
                <Select value={authorizerId} onValueChange={setAuthorizerId}>
                  <SelectTrigger className="h-12 text-base">
                    <SelectValue placeholder="Select supervisor or admin" />
                  </SelectTrigger>
                  <SelectContent>
                    {authorizers.map((a) => (
                      <SelectItem key={a.instructor_id} value={a.instructor_id}>
                        {a.instructor_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <StaffPinPad
                  value={authorizerPin}
                  onChange={setAuthorizerPin}
                  disabled={submitting || !authorizerId}
                  label="Authorizer PIN"
                />
              </div>
              {dialogError && <p className="text-center text-sm text-destructive">{dialogError}</p>}
              <Button
                className="h-14 w-full text-lg"
                disabled={newPin.length < 4 || !authorizerId || authorizerPin.length < 4 || submitting}
                onClick={submitEnroll}
              >
                {submitting ? "Saving…" : "Set up PIN"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

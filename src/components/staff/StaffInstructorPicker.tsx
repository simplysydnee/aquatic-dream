import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ShieldAlert } from "lucide-react";
import { StaffPinPad } from "./StaffPinPad";
import { formatClockPacific, formatTime } from "@/lib/staffDate";
import type { StaffSession } from "./staffTypes";

interface InstructorTile {
  instructor_id: string;
  instructor_name: string;
  lesson_count: number;
  first_lesson: string | null;
}

interface PinStatusRow {
  instructor_id: string;
  instructor_name: string;
  has_pin: boolean;
  role: string;
  locked: boolean;
}

interface StaffInstructorPickerProps {
  date: string;
  onSignedIn: (session: StaffSession) => void;
}

/** Screen 1: who is standing at the pool right now. Today only, by design. */
export const StaffInstructorPicker = ({ date, onSignedIn }: StaffInstructorPickerProps) => {
  const [loading, setLoading] = useState(true);
  const [tiles, setTiles] = useState<InstructorTile[]>([]);
  const [pinStatus, setPinStatus] = useState<PinStatusRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<InstructorTile | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const [scheduleRes, statusRes] = await Promise.all([
        supabase.rpc("staff_instructors_for_date", { p_date: date }),
        supabase.rpc("staff_pin_status"),
      ]);
      if (!active) return;
      if (scheduleRes.error || statusRes.error) {
        setLoadError(scheduleRes.error?.message ?? statusRes.error?.message ?? "Could not load");
      } else {
        setLoadError(null);
        setTiles((scheduleRes.data ?? []) as InstructorTile[]);
        setPinStatus((statusRes.data ?? []) as PinStatusRow[]);
      }
      setLoading(false);
    };
    void load();
    return () => {
      active = false;
    };
  }, [date]);

  const sorted = useMemo(
    () =>
      [...tiles].sort((a, b) =>
        (a.first_lesson ?? "99:99").localeCompare(b.first_lesson ?? "99:99"),
      ),
    [tiles],
  );

  const statusFor = (id: string) => pinStatus.find((p) => p.instructor_id === id) ?? null;

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Who is teaching?</h1>
        <p className="text-lg text-muted-foreground">Tap your name to sign in.</p>
      </div>

      {loadError && (
        <Card className="border-destructive/40 bg-destructive/5 p-5 text-base text-destructive">
          {loadError}
        </Card>
      )}

      {!loadError && sorted.length === 0 && (
        <Card className="p-10 text-center text-xl text-muted-foreground">
          No lessons scheduled today.
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((tile) => (
          <button
            key={tile.instructor_id}
            type="button"
            onClick={() => setSelected(tile)}
            className="rounded-2xl border-2 border-border bg-card p-6 text-left transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40 active:bg-muted"
          >
            <p className="text-2xl font-semibold text-foreground">{tile.instructor_name}</p>
            <p className="mt-1 text-base text-muted-foreground">
              {tile.lesson_count} {tile.lesson_count === 1 ? "lesson" : "lessons"}
              {tile.first_lesson ? ` · first ${formatTime(tile.first_lesson)}` : ""}
            </p>
          </button>
        ))}
      </div>

      <StaffSignInDialog
        instructor={selected}
        status={selected ? statusFor(selected.instructor_id) : null}
        supervisors={pinStatus.filter(
          (p) => (p.role === "supervisor" || p.role === "admin") && p.has_pin,
        )}
        onClose={() => setSelected(null)}
        onSignedIn={onSignedIn}
      />
    </div>
  );
};

interface SignInDialogProps {
  instructor: InstructorTile | null;
  status: PinStatusRow | null;
  supervisors: PinStatusRow[];
  onClose: () => void;
  onSignedIn: (session: StaffSession) => void;
}

const StaffSignInDialog = ({
  instructor,
  status,
  supervisors,
  onClose,
  onSignedIn,
}: SignInDialogProps) => {
  const [pin, setPin] = useState("");
  const [authorizerId, setAuthorizerId] = useState("");
  const [authorizerPin, setAuthorizerPin] = useState("");
  const [step, setStep] = useState<"pin" | "authorize">("pin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);

  useEffect(() => {
    setPin("");
    setAuthorizerId("");
    setAuthorizerPin("");
    setStep("pin");
    setError(null);
    setLockedUntil(null);
  }, [instructor?.instructor_id]);

  if (!instructor) return null;

  const needsEnrollment = status ? !status.has_pin : false;
  const locked = Boolean(status?.locked) || Boolean(lockedUntil);

  const verify = async () => {
    setBusy(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("staff_pin_verify", {
      p_instructor_id: instructor.instructor_id,
      p_pin: pin,
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      setPin("");
      return;
    }
    const row = (data ?? [])[0];
    if (!row?.ok) {
      if (row?.locked_until) setLockedUntil(row.locked_until);
      setError(row?.locked_until ? "Too many tries." : "That PIN did not match.");
      setPin("");
      return;
    }
    onSignedIn({
      instructorId: row.instructor_id,
      instructorName: row.instructor_name,
      role: (row.role as StaffSession["role"]) ?? "instructor",
    });
  };

  const enroll = async () => {
    setBusy(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("staff_pin_enroll", {
      p_instructor_id: instructor.instructor_id,
      p_new_pin: pin,
      p_authorizer_id: authorizerId,
      p_authorizer_pin: authorizerPin,
    });
    setBusy(false);
    if (rpcError || !data) {
      setError(rpcError?.message ?? "That authorization did not work.");
      setAuthorizerPin("");
      return;
    }
    await verify();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">{instructor.instructor_name}</DialogTitle>
        </DialogHeader>

        {locked ? (
          <div className="space-y-3 py-6 text-center">
            <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
            <p className="text-lg font-medium text-destructive">
              {lockedUntil
                ? `Locked until ${formatClockPacific(lockedUntil)}`
                : "Locked. Ask a supervisor."}
            </p>
          </div>
        ) : needsEnrollment && step === "pin" ? (
          <div className="space-y-5">
            <StaffPinPad label="Choose your 4 digit PIN" value={pin} onChange={setPin} />
            <Button
              className="h-14 w-full text-lg"
              disabled={pin.length !== 4}
              onClick={() => setStep("authorize")}
            >
              Set up PIN
            </Button>
          </div>
        ) : needsEnrollment ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label className="text-base">Supervisor or admin</Label>
              <Select value={authorizerId} onValueChange={setAuthorizerId}>
                <SelectTrigger className="h-14 text-base">
                  <SelectValue placeholder="Select who is authorizing" />
                </SelectTrigger>
                <SelectContent>
                  {supervisors.map((s) => (
                    <SelectItem key={s.instructor_id} value={s.instructor_id}>
                      {s.instructor_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <StaffPinPad
              label="Their PIN"
              value={authorizerPin}
              onChange={setAuthorizerPin}
              disabled={!authorizerId}
            />
            {error && <p className="text-center text-base text-destructive">{error}</p>}
            <Button
              className="h-14 w-full text-lg"
              disabled={busy || !authorizerId || authorizerPin.length !== 4}
              onClick={() => void enroll()}
            >
              {busy ? "Working..." : "Authorize and sign in"}
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <StaffPinPad label="Enter your PIN" value={pin} onChange={setPin} disabled={busy} />
            {error && <p className="text-center text-base text-destructive">{error}</p>}
            <Button
              className="h-14 w-full text-lg"
              disabled={busy || pin.length !== 4}
              onClick={() => void verify()}
            >
              {busy ? "Checking..." : "Sign in"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { StaffInstructorPicker } from "@/components/staff/StaffInstructorPicker";
import { StaffSchedule } from "@/components/staff/StaffSchedule";
import type { StaffScheduleRow, StaffSession } from "@/components/staff/staffTypes";
import { LEVEL_GROUP_NAMES, type SwimLevel } from "@/components/swim-enrollment/types";
import LevelBadge from "@/components/LevelBadge";

/** Inactivity window before the shared tablet forgets who is signed in. */
const INACTIVITY_MS = 20 * 60 * 1000; // 20 minutes

function KioskSignIn() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await signIn(email, password);
    setBusy(false);
    if (signInError) setError("Could not sign in with those details.");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md p-8">
        <h1 className="text-2xl font-bold">Staff mode</h1>
        <p className="mt-2 text-muted-foreground">Sign this tablet in with the staff kiosk account.</p>
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="staff-email">Email</Label>
            <Input
              id="staff-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 text-base"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-password">Password</Label>
            <Input
              id="staff-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 text-base"
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}

/** Phase 3 fills this in. */
function SwimmerPlaceholder({ row, onBack }: { row: StaffScheduleRow; onBack: () => void }) {
  const level = row.current_level as SwimLevel | null;
  const name = [row.swimmer_first, row.swimmer_last].filter(Boolean).join(" ") || "Swimmer";
  return (
    <div className="mx-auto max-w-2xl p-6">
      <Button variant="outline" className="h-12 px-5 text-base" onClick={onBack}>
        Back to schedule
      </Button>
      <Card className="mt-5 p-8 text-center">
        <div className="flex flex-col items-center gap-3">
          {level && <LevelBadge level={level} size={80} />}
          <h1 className="text-3xl font-bold">{name}</h1>
          {level && <p className="text-lg text-muted-foreground">{LEVEL_GROUP_NAMES[level]}</p>}
        </div>
        <p className="mt-8 text-lg text-muted-foreground">Skills tracking is coming next.</p>
      </Card>
    </div>
  );
}

export default function StaffMode() {
  const { user, loading } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [staffSession, setStaffSession] = useState<StaffSession | null>(null);
  const [openRow, setOpenRow] = useState<StaffScheduleRow | null>(null);
  const timerRef = useRef<number | null>(null);

  const endStaffSession = useCallback(() => {
    setStaffSession(null);
    setOpenRow(null);
  }, []);

  // --- 20 minute inactivity expiry: any tap, scroll or keypress resets it ---
  useEffect(() => {
    if (!staffSession) return;

    const reset = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(endStaffSession, INACTIVITY_MS);
    };

    const events: Array<keyof WindowEventMap> = [
      "pointerdown",
      "touchstart",
      "keydown",
      "scroll",
      "wheel",
    ];
    events.forEach((evt) => window.addEventListener(evt, reset, { passive: true }));
    reset();

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, reset));
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [staffSession, endStaffSession]);

  useEffect(() => {
    if (!user) {
      setAllowed(null);
      return;
    }
    let cancelled = false;
    void supabase.rpc("can_use_staff_mode").then(({ data, error }) => {
      if (cancelled) return;
      setAllowed(!error && data === true);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return <KioskSignIn />;

  if (allowed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8 text-center">
        <div>
          <h1 className="text-2xl font-semibold">Staff mode is not set up on this device.</h1>
          <p className="mt-3 text-muted-foreground">
            Ask an administrator to sign this tablet in with the staff kiosk account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {staffSession && (
        <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-card px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Signed in as</p>
            <p className="truncate text-lg font-semibold">{staffSession.instructorName}</p>
          </div>
          <Button variant="outline" className="h-12 px-4 text-base" onClick={endStaffSession}>
            Not you? Switch
          </Button>
        </header>
      )}

      {!staffSession ? (
        <StaffInstructorPicker onSignedIn={setStaffSession} />
      ) : openRow ? (
        <SwimmerPlaceholder row={openRow} onBack={() => setOpenRow(null)} />
      ) : (
        <StaffSchedule session={staffSession} onOpenSwimmer={setOpenRow} />
      )}
    </div>
  );
}

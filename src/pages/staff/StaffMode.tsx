import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, LogOut } from "lucide-react";
import { StaffInstructorPicker } from "@/components/staff/StaffInstructorPicker";
import { StaffSchedule } from "@/components/staff/StaffSchedule";
import type { StaffSession } from "@/components/staff/staffTypes";
import { todayPacific } from "@/lib/staffDate";

/** A shared tablet must never keep one instructor signed in while another uses it. */
const INACTIVITY_MS = 20 * 60 * 1000;

const StaffMode = () => {
  const { user, loading: authLoading, signIn } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [staff, setStaff] = useState<StaffSession | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!user) {
      setAllowed(null);
      return;
    }
    let active = true;
    void supabase.rpc("can_use_staff_mode").then(({ data, error }) => {
      if (active) setAllowed(!error && data === true);
    });
    return () => {
      active = false;
    };
  }, [user]);

  const endStaffSession = useCallback(() => setStaff(null), []);

  // Inactivity expiry. Any touch, tap, key or scroll restarts the 20 minute clock.
  useEffect(() => {
    if (!staff) return;
    const reset = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(endStaffSession, INACTIVITY_MS);
    };
    const events: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "touchstart",
      "scroll",
    ];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [staff, endStaffSession]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <KioskSignIn onSignIn={signIn} />;

  if (allowed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="max-w-md p-8 text-center">
          <h1 className="text-2xl font-display font-bold text-foreground">Staff mode</h1>
          <p className="mt-3 text-base text-muted-foreground">
            This account is not set up for the pool tablet. Ask an admin to provision it.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Staff mode
            </p>
            <p className="text-lg font-semibold text-foreground">
              {staff ? staff.instructorName : "Not signed in"}
            </p>
          </div>
          {staff && (
            <Button variant="outline" className="h-12 text-base" onClick={endStaffSession}>
              <LogOut className="mr-2 h-5 w-5" />
              Not you? Switch
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {staff ? (
          <StaffSchedule session={staff} />
        ) : (
          <StaffInstructorPicker date={todayPacific()} onSignedIn={setStaff} />
        )}
      </main>
    </div>
  );
};

const KioskSignIn = ({
  onSignIn,
}: {
  onSignIn: (email: string, password: string) => Promise<{ error: Error | null }>;
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await onSignIn(email.trim(), password);
    setBusy(false);
    if (signInError) setError(signInError.message);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm p-8">
        <h1 className="text-2xl font-display font-bold text-foreground">Staff mode</h1>
        <p className="mt-1 text-base text-muted-foreground">Sign in with the tablet account.</p>
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="kiosk-email">Email</Label>
            <Input
              id="kiosk-email"
              type="email"
              className="h-12 text-base"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kiosk-password">Password</Label>
            <Input
              id="kiosk-password"
              type="password"
              className="h-12 text-base"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
};

export default StaffMode;

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, Tablet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type ProvisionResult = {
  user_id: string;
  email: string;
  label: string;
  account_created: boolean;
  kiosk_row_created: boolean;
};

const UsersAdmin = () => {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [kioskLabel, setKioskLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ProvisionResult | null>(null);

  const handleProvision = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    const { data, error } = await supabase.functions.invoke("provision-staff-kiosk", {
      body: { email, password, label: kioskLabel },
    });

    setSubmitting(false);

    if (error || (data as { error?: string } | null)?.error) {
      const message =
        (data as { error?: string } | null)?.error ?? error?.message ?? "Could not provision kiosk";
      toast({ title: "Provisioning failed", description: message, variant: "destructive" });
      return;
    }

    // Clear the password immediately; it is never displayed or stored here.
    setPassword("");
    setResult(data as ProvisionResult);
    const result = data as ProvisionResult;
    if (result.account_created) {
      toast({ title: "Kiosk account created", description: "Staff mode can sign in on the tablet." });
    } else {
      toast({ title: "Kiosk password reset", description: "The existing kiosk password has been updated." });
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-display font-bold text-foreground">User Management</h2>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Staff accounts</CardTitle>
              <CardDescription>
                To add a new staff member, create their account and assign the admin role through your backend.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            User management features (invite staff, assign roles, revoke access) coming soon.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Tablet className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Pool deck kiosk login</CardTitle>
              <CardDescription>
                Creates the shared tablet login for staff mode. The password is sent straight to the
                backend and is never saved or shown here.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleProvision} className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="kiosk-email">Email</Label>
              <Input
                id="kiosk-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="kiosk-password">Password</Label>
              <Input
                id="kiosk-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="kiosk-label">Label</Label>
              <Input
                id="kiosk-label"
                value={kioskLabel}
                onChange={(e) => setKioskLabel(e.target.value)}
                placeholder="Pool deck tablet"
                required
              />
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating..." : "Create kiosk account"}
            </Button>
          </form>

          {result && (
            <div className="mt-4 rounded-md border border-border bg-muted/40 p-3 text-sm">
              <p className="font-medium text-foreground">{result.label}</p>
              <p className="text-muted-foreground">{result.email}</p>
              <p className="text-muted-foreground">
                {result.kiosk_row_created
                  ? "Kiosk access row created."
                  : "Kiosk access row already existed."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default UsersAdmin;

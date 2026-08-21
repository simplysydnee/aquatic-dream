import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, Tablet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ProvisionResult {
  user_id: string;
  email: string;
  label: string;
  kiosk_row_created: boolean;
}

const StaffKioskCard = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [label, setLabel] = useState("Pool deck tablet");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProvisionResult | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    const { data, error } = await supabase.functions.invoke("provision-staff-kiosk", {
      body: { email: email.trim(), password, label: label.trim() },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message || "Could not provision the kiosk account");
      return;
    }
    const payload = data as ProvisionResult & { error?: string };
    if (payload?.error) {
      toast.error(payload.error);
      return;
    }
    setPassword("");
    setResult(payload);
    toast.success(
      payload.kiosk_row_created ? "Kiosk account ready" : "Kiosk account already existed",
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Tablet className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle>Staff kiosk account</CardTitle>
            <CardDescription>
              Creates the shared tablet login for /staff. It gets no admin role and no table
              access. Enter the password you want to use on the tablet.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-3" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="kiosk-provision-email">Email</Label>
            <Input
              id="kiosk-provision-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tablet@aquaticdreamsswim.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kiosk-provision-password">Password</Label>
            <Input
              id="kiosk-provision-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kiosk-provision-label">Label</Label>
            <Input
              id="kiosk-provision-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
            />
          </div>
          <div className="sm:col-span-3">
            <Button type="submit" disabled={busy}>
              {busy ? "Provisioning..." : "Provision kiosk account"}
            </Button>
          </div>
        </form>

        {result && (
          <p className="mt-4 text-sm text-muted-foreground">
            {result.email} is ready as {result.label}.{" "}
            {result.kiosk_row_created ? "Kiosk access row created." : "Kiosk access row already in place."}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

const UsersAdmin = () => {
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
              <CardTitle>Staff Accounts</CardTitle>
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

      <StaffKioskCard />
    </div>
  );
};

export default UsersAdmin;

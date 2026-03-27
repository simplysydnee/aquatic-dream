import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";

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
    </div>
  );
};

export default UsersAdmin;

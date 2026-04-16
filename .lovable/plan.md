

## Create Staff Admin Account

### What we'll do
1. Create a new user account in the authentication system with email `generalmail@aquaticdreams.com` and password `Scub@2026`
2. Assign the `admin` role to this user in the `user_roles` table so they can access the admin dashboard

### Technical steps
- Use an edge function or direct database operations to create the auth user and insert the admin role
- The existing `handle_new_user` trigger will automatically create a profile entry
- The `has_role` function already handles admin checks, so no code changes are needed

### No code changes required
The existing login page, ProtectedRoute, and auth hooks already support this — we just need to provision the account in the backend.


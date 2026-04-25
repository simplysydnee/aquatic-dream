import { Navigate, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { CalendarClock, ClipboardList, LogOut, Loader2, CalendarCheck, CalendarOff, Hand } from "lucide-react";

export default function InstructorLayout() {
  const { user, isInstructor, isAdmin, loading, signOut } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/admin/login" replace />;
  if (!isInstructor && !isAdmin) return <Navigate to="/" replace />;

  const linkBase = "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-muted";
  const active = "bg-muted text-primary";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="font-display text-lg font-semibold">Instructor Portal</h1>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground hidden sm:inline">{user.email}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => { await signOut(); navigate("/admin/login"); }}
            >
              <LogOut className="w-4 h-4 mr-1" /> Sign out
            </Button>
          </div>
        </div>
        <nav className="max-w-6xl mx-auto px-4 pb-2 flex gap-1">
          <NavLink to="/instructor" end className={({ isActive }) => `${linkBase} ${isActive ? active : ""}`}>
            <CalendarClock className="w-4 h-4" /> My Schedule
          </NavLink>
          <NavLink to="/instructor/roster" className={({ isActive }) => `${linkBase} ${isActive ? active : ""}`}>
            <ClipboardList className="w-4 h-4" /> My Rosters
          </NavLink>
          <NavLink to="/instructor/availability" className={({ isActive }) => `${linkBase} ${isActive ? active : ""}`}>
            <CalendarCheck className="w-4 h-4" /> Availability
          </NavLink>
          <NavLink to="/instructor/time-off" className={({ isActive }) => `${linkBase} ${isActive ? active : ""}`}>
            <CalendarOff className="w-4 h-4" /> Time Off
          </NavLink>
          <NavLink to="/instructor/open-shifts" className={({ isActive }) => `${linkBase} ${isActive ? active : ""}`}>
            <Hand className="w-4 h-4" /> Open Shifts
          </NavLink>
        </nav>
      </header>
      <main className="flex-1 max-w-6xl mx-auto w-full p-4">
        <Outlet />
      </main>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Navigate, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { CalendarClock, ClipboardList, LogOut, Loader2, CalendarCheck, CalendarOff, Hand, Clock, Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function InstructorLayout() {
  const { user, isInstructor, isAdmin, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) return;
    const loadUnread = async () => {
      const { data: inst } = await supabase
        .from("instructors")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!inst?.id) return;
      const { data: anns } = await supabase
        .from("announcements")
        .select("id");
      const { data: reads } = await supabase
        .from("announcement_reads")
        .select("announcement_id")
        .eq("instructor_id", inst.id);
      const readSet = new Set((reads ?? []).map((r: any) => r.announcement_id));
      setUnread((anns ?? []).filter((a: any) => !readSet.has(a.id)).length);
    };
    loadUnread();
    const channel = supabase
      .channel("ann-unread")
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, loadUnread)
      .on("postgres_changes", { event: "*", schema: "public", table: "announcement_reads" }, loadUnread)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

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
        <nav className="max-w-6xl mx-auto px-4 pb-2 flex flex-wrap gap-1">
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
          <NavLink to="/instructor/time-clock" className={({ isActive }) => `${linkBase} ${isActive ? active : ""}`}>
            <Clock className="w-4 h-4" /> Time Clock
          </NavLink>
          <NavLink to="/instructor/announcements" className={({ isActive }) => `${linkBase} ${isActive ? active : ""}`}>
            <Megaphone className="w-4 h-4" /> Announcements
            {unread > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </NavLink>
        </nav>
      </header>
      <main className="flex-1 max-w-6xl mx-auto w-full p-4">
        <Outlet />
      </main>
    </div>
  );
}

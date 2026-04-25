import { Users, Waves, MessageSquare, LogOut, CalendarDays, BookOpen, ClipboardList, Briefcase, FileText, PanelLeftClose, PanelLeft, UserCheck, Layers, CalendarClock, CalendarOff, Clock } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useAdminBadgeCounts } from "@/hooks/useAdminBadgeCounts";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";

export function AdminSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const { signOut, user } = useAuth();
  const { newLessonRequests, newContacts, newApplications } = useAdminBadgeCounts();

  const items = [
    { title: "Calendar", url: "/admin", icon: CalendarDays, badge: 0 },
    { title: "Class Roster", url: "/admin/roster", icon: ClipboardList, badge: 0 },
    { title: "Sessions", url: "/admin/sessions", icon: Layers, badge: 0 },
    { title: "Instructors", url: "/admin/instructors", icon: UserCheck, badge: 0 },
    { title: "Schedule", url: "/admin/schedule", icon: CalendarClock, badge: 0 },
    { title: "Time Off & Trades", url: "/admin/time-off", icon: CalendarOff, badge: 0 },
    { title: "Timesheets", url: "/admin/timesheets", icon: Clock, badge: 0 },
    { title: "Swim Enrollments", url: "/admin/enrollments", icon: Waves, badge: 0 },
    { title: "Lesson Requests", url: "/admin/lesson-requests", icon: BookOpen, badge: newLessonRequests },
    { title: "Contact Inquiries", url: "/admin/contacts", icon: MessageSquare, badge: newContacts },
    { title: "Job Postings", url: "/admin/careers", icon: Briefcase, badge: 0 },
    { title: "Applications", url: "/admin/applications", icon: FileText, badge: newApplications },
    { title: "User Management", url: "/admin/users", icon: Users, badge: 0 },
  ];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-2 flex justify-end">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 ml-auto"
          onClick={toggleSidebar}
        >
          {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            {!collapsed && "Admin Dashboard"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/admin"}
                      className="hover:bg-muted/50 relative"
                      activeClassName="bg-muted text-primary font-medium"
                    >
                      <div className="relative">
                        <item.icon className="mr-2 h-4 w-4" />
                        {collapsed && item.badge > 0 && (
                          <span className="absolute -top-1 -right-0 h-2 w-2 rounded-full bg-red-500" />
                        )}
                      </div>
                      {!collapsed && <span className="flex-1">{item.title}</span>}
                      {!collapsed && item.badge > 0 && (
                        <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-semibold">
                          {item.badge > 99 ? "99+" : item.badge}
                        </span>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-2">
        {!collapsed && (
          <p className="text-xs text-muted-foreground truncate px-2 mb-1">
            {user?.email}
          </p>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={signOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          {!collapsed && "Sign Out"}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}

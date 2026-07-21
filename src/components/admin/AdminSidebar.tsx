import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Users,
  Waves,
  MessageSquare,
  LogOut,
  CalendarDays,
  BookOpen,
  ClipboardList,
  PanelLeftClose,
  PanelLeft,
  UserCheck,
  Layers,
  CalendarClock,
  BarChart3,
  Mail,
  IdCard,
  ChevronDown,
  Send,
  FileSignature,
  CheckSquare,
  Globe,
  BotMessageSquare,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useAdminBadgeCounts } from "@/hooks/useAdminBadgeCounts";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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

type NavItem = { title: string; url: string; icon: any; badge: number };
type NavGroup = { label: string; items: NavItem[] };

const STORAGE_KEY = "admin-sidebar-groups";

export function AdminSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const { signOut, user } = useAuth();
  const { newLessonRequests, newContacts } = useAdminBadgeCounts();
  const { pathname } = useLocation();

  const groups: NavGroup[] = [
    {
      label: "Operations",
      items: [
        { title: "Calendar", url: "/admin", icon: CalendarDays, badge: 0 },
        { title: "Check-in", url: "/admin/checkin", icon: CheckSquare, badge: 0 },
        { title: "Class Roster", url: "/admin/roster", icon: ClipboardList, badge: 0 },
        { title: "Messages", url: "/admin/messages", icon: Send, badge: 0 },
      ],
    },
    {
      label: "Clients & Inquiries",
      items: [
        { title: "Clients", url: "/admin/clients", icon: IdCard, badge: 0 },
        { title: "Swim Enrollments", url: "/admin/enrollments", icon: Waves, badge: 0 },
        { title: "Lesson Requests", url: "/admin/lesson-requests", icon: BookOpen, badge: newLessonRequests },
        { title: "Contact Inquiries", url: "/admin/contacts", icon: MessageSquare, badge: newContacts },
        { title: "Waivers", url: "/admin/waivers", icon: FileSignature, badge: 0 },
      ],
    },
    {
      label: "Programs",
      items: [
        { title: "Sessions", url: "/admin/sessions", icon: Layers, badge: 0 },
        { title: "Private Lessons", url: "/admin/private-lessons", icon: CalendarClock, badge: 0 },
        { title: "Reports", url: "/admin/reports", icon: BarChart3, badge: 0 },
      ],
    },
    {
      label: "Staff",
      items: [
        { title: "Instructors", url: "/admin/instructors", icon: UserCheck, badge: 0 },
      ],
    },
    {
      label: "Marketing",
      items: [
        { title: "Campaigns", url: "/admin/marketing", icon: Send, badge: 0 },
      ],
    },
    {
      label: "System",
      items: [
        { title: "Email Log", url: "/admin/emails", icon: Mail, badge: 0 },
        { title: "Domain Health", url: "/admin/domain-health", icon: Globe, badge: 0 },
        { title: "AI Assistant", url: "/admin/agent-connect", icon: BotMessageSquare, badge: 0 },
        { title: "User Management", url: "/admin/users", icon: Users, badge: 0 },
      ],
    },
  ];

  const isItemActive = (url: string) =>
    url === "/admin" ? pathname === "/admin" : pathname === url || pathname.startsWith(url + "/");

  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return Object.fromEntries(groups.map((g) => [g.label, true]));
  });

  useEffect(() => {
    const active = groups.find((g) => g.items.some((i) => isItemActive(i.url)));
    if (active && !openMap[active.label]) {
      setOpenMap((prev) => ({ ...prev, [active.label]: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(openMap));
    } catch {}
  }, [openMap]);

  const setGroupOpen = (label: string, open: boolean) =>
    setOpenMap((prev) => ({ ...prev, [label]: open }));

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
        {groups.map((group) => {
          const groupBadge = group.items.reduce((sum, i) => sum + (i.badge || 0), 0);
          const isOpen = openMap[group.label] ?? true;

          if (collapsed) {
            return (
              <SidebarGroup key={group.label}>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild>
                          <NavLink
                            to={item.url}
                            end={item.url === "/admin"}
                            className="hover:bg-muted/50 relative"
                            activeClassName="bg-muted text-primary font-medium"
                          >
                            <div className="relative">
                              <item.icon className="h-4 w-4" />
                              {item.badge > 0 && (
                                <span className="absolute -top-1 -right-0 h-2 w-2 rounded-full bg-red-500" />
                              )}
                            </div>
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          }

          return (
            <Collapsible
              key={group.label}
              open={isOpen}
              onOpenChange={(o) => setGroupOpen(group.label, o)}
            >
              <SidebarGroup>
                <SidebarGroupLabel asChild>
                  <CollapsibleTrigger className="flex w-full items-center justify-between hover:bg-muted/40 rounded-md px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>{group.label}</span>
                    <span className="flex items-center gap-1.5">
                      {!isOpen && groupBadge > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-semibold">
                          {groupBadge > 99 ? "99+" : groupBadge}
                        </span>
                      )}
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform ${isOpen ? "" : "-rotate-90"}`}
                      />
                    </span>
                  </CollapsibleTrigger>
                </SidebarGroupLabel>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {group.items.map((item) => (
                        <SidebarMenuItem key={item.title}>
                          <SidebarMenuButton asChild>
                            <NavLink
                              to={item.url}
                              end={item.url === "/admin"}
                              className="hover:bg-muted/50 relative"
                              activeClassName="bg-muted text-primary font-medium"
                            >
                              <item.icon className="mr-2 h-4 w-4" />
                              <span className="flex-1">{item.title}</span>
                              {item.badge > 0 && (
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
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          );
        })}
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

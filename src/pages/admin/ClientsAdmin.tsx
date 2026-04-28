import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, Mail, Phone, User as UserIcon, SlidersHorizontal, X, MessageSquare } from "lucide-react";
import { useSwimmers, type Swimmer, type SwimmerStatusKey } from "@/hooks/useSwimmers";
import SwimmerStatusBadges from "@/components/admin/clients/SwimmerStatusBadges";
import SwimmerDetailDrawer from "@/components/admin/clients/SwimmerDetailDrawer";
import LessonRequestDetailDialog, { type LessonRequest } from "@/components/admin/LessonRequestDetailDialog";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/lib/phone";
import { LEVEL_BADGE_COLORS, type SwimLevel } from "@/components/swim-enrollment/types";
import { useCommentCounts } from "@/hooks/useInternalComments";

const levelClass = (level?: string | null) => {
  if (!level) return "";
  const key = level.toLowerCase() as SwimLevel;
  const c = LEVEL_BADGE_COLORS[key];
  if (!c) return "";
  return cn(c.bg, c.text, "ring-1", c.ring, "border-transparent");
};

type Filter =
  | "all"
  | "new_inquiry"
  | "enrolled"
  | "active"
  | "upcoming"
  | "unpaid"
  | "past"
  | "has_request"
  | "req_new"
  | "req_contacted"
  | "req_scheduled"
  | "lesson_private"
  | "lesson_semi"
  | "lesson_group";

const FILTER_GROUPS: { label: string; items: { key: Filter; label: string }[] }[] = [
  {
    label: "Status",
    items: [
      { key: "all", label: "All" },
      { key: "new_inquiry", label: "New Inquiry" },
      { key: "enrolled", label: "Enrolled" },
      { key: "active", label: "Active" },
      { key: "upcoming", label: "Upcoming" },
      { key: "unpaid", label: "Unpaid" },
      { key: "past", label: "Past" },
    ],
  },
  {
    label: "Request Status",
    items: [
      { key: "has_request", label: "Any Request" },
      { key: "req_new", label: "Request · New" },
      { key: "req_contacted", label: "Request · Contacted" },
      { key: "req_scheduled", label: "Request · Scheduled" },
    ],
  },
  {
    label: "Lesson Type",
    items: [
      { key: "lesson_private", label: "Private" },
      { key: "lesson_semi", label: "Semi-Private" },
      { key: "lesson_group", label: "Group" },
    ],
  },
];

const PAGE_SIZE = 25;

const hasLessonType = (s: Swimmer, type: "private" | "semi-private" | "group") => {
  return (
    s.requests.some((r) => r.lesson_type === type) ||
    s.enrollments.some((e) => e.lesson_type === type) ||
    s.bookings.some((b) => b.lesson_type === type)
  );
};

const matchFilter = (s: Swimmer, f: Filter) => {
  if (f === "all") return true;
  const keys = new Set<SwimmerStatusKey>(s.statuses.map((x) => x.key));
  switch (f) {
    case "new_inquiry":
      return keys.has("new_inquiry");
    case "enrolled":
      return keys.has("enrolled_active") || keys.has("enrolled_upcoming");
    case "active":
      return keys.has("enrolled_active") || keys.has("booking_active");
    case "upcoming":
      return keys.has("enrolled_upcoming");
    case "unpaid":
      return keys.has("unpaid");
    case "past":
      return keys.has("past_client");
    case "has_request":
      return (
        keys.has("lesson_requested_new") ||
        keys.has("lesson_requested_contacted") ||
        keys.has("lesson_requested_scheduled")
      );
    case "req_new":
      return keys.has("lesson_requested_new");
    case "req_contacted":
      return keys.has("lesson_requested_contacted");
    case "req_scheduled":
      return keys.has("lesson_requested_scheduled");
    case "lesson_private":
      return hasLessonType(s, "private");
    case "lesson_semi":
      return hasLessonType(s, "semi-private");
    case "lesson_group":
      return hasLessonType(s, "group");
  }
  return true;
};

export default function ClientsAdmin() {
  const { swimmers, loading } = useSwimmers();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Swimmer | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Lesson request dialog
  const [activeRequest, setActiveRequest] = useState<LessonRequest | null>(null);
  const [reqDialogOpen, setReqDialogOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return swimmers.filter((s) => {
      if (!matchFilter(s, filter)) return false;
      if (!q) return true;
      return (
        s.child_name.toLowerCase().includes(q) ||
        s.parent_name.toLowerCase().includes(q) ||
        s.parent_email.toLowerCase().includes(q) ||
        (s.parent_phone || "").toLowerCase().includes(q)
      );
    });
  }, [swimmers, search, filter]);

  // Reset visible count + scroll position when filter/search changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [search, filter]);

  // Infinite scroll observer
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((c) => Math.min(c + PAGE_SIZE, filtered.length));
        }
      },
      { root: scrollRef.current, rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [filtered.length, visibleCount]);

  const visible = filtered.slice(0, visibleCount);
  const visibleKeys = useMemo(() => visible.map((v) => v.key), [visible]);
  const commentCounts = useCommentCounts("swimmer", visibleKeys);

  const siblingsOf = (s: Swimmer) =>
    swimmers.filter((x) => x.parent_email.toLowerCase() === s.parent_email.toLowerCase() && x.key !== s.key);

  const openSwimmer = (s: Swimmer) => {
    setSelected(s);
    setDrawerOpen(true);
  };

  const openRequest = async (id: string) => {
    const { data } = await supabase.from("lesson_requests").select("*").eq("id", id).maybeSingle();
    if (data) {
      setActiveRequest(data as LessonRequest);
      setReqDialogOpen(true);
    }
  };

  const openEnrollment = (id: string) => {
    window.location.href = `/admin/enrollments?enrollment=${id}`;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const activeFilterLabel =
    FILTER_GROUPS.flatMap((g) => g.items).find((i) => i.key === filter)?.label ?? "All";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-display font-bold text-foreground">Clients</h2>
        <p className="text-sm text-muted-foreground">
          One row per swimmer. Search across requests, enrollments, and bookings.
        </p>
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search swimmer, parent, email, or phone…"
                className="pl-9"
              />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="default" className="shrink-0 gap-2">
                  <SlidersHorizontal className="h-4 w-4" />
                  <span className="hidden sm:inline">Filter</span>
                  {filter !== "all" && (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                      {activeFilterLabel}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm">Filters</h4>
                  {filter !== "all" && (
                    <Button variant="ghost" size="sm" onClick={() => setFilter("all")} className="h-7 text-xs gap-1">
                      <X className="h-3 w-3" /> Clear
                    </Button>
                  )}
                </div>
                {FILTER_GROUPS.map((group) => (
                  <div key={group.label} className="space-y-1.5">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                      {group.label}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {group.items.map((f) => (
                        <Button
                          key={f.key}
                          variant={filter === f.key ? "default" : "outline"}
                          size="sm"
                          onClick={() => setFilter(f.key)}
                          className="h-7 text-xs"
                        >
                          {f.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </PopoverContent>
            </Popover>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>
          Showing <span className="font-semibold text-foreground">{Math.min(visibleCount, filtered.length)}</span> of{" "}
          <span className="font-semibold text-foreground">{filtered.length}</span>
          {filtered.length !== swimmers.length && <span> · {swimmers.length} total</span>}
        </span>
        {filter !== "all" && (
          <button onClick={() => setFilter("all")} className="text-primary hover:underline inline-flex items-center gap-1">
            <X className="h-3 w-3" /> Clear filter
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        className="space-y-2 max-h-[calc(100vh-18rem)] overflow-y-auto pr-1 rounded-lg border bg-muted/20 p-2"
      >
        {visible.map((s) => (
          <button
            key={s.key}
            onClick={() => openSwimmer(s)}
            className={cn(
              "w-full text-left rounded-lg border bg-card p-4 hover:bg-muted/40 transition-colors",
              "flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4",
            )}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-foreground">{s.child_name}</span>
                {s.child_age != null && <span className="text-sm text-muted-foreground">({s.child_age})</span>}
                {s.swim_level && (
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {s.swim_level}
                  </Badge>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <UserIcon className="h-3 w-3" />
                  {s.parent_name}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {s.parent_email}
                </span>
                {s.parent_phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {s.parent_phone}
                  </span>
                )}
              </div>
              <SwimmerStatusBadges statuses={s.statuses} className="mt-2" />
            </div>
            <div className="text-right text-xs text-muted-foreground shrink-0">
              <div>Last activity</div>
              <div className="font-medium text-foreground">{new Date(s.last_activity).toLocaleDateString()}</div>
            </div>
          </button>
        ))}

        {filtered.length === 0 && (
          <div className="py-12 text-center text-muted-foreground text-sm">No swimmers match.</div>
        )}

        {visibleCount < filtered.length && (
          <div ref={sentinelRef} className="py-6 text-center text-xs text-muted-foreground">
            Loading more… ({visibleCount} of {filtered.length})
          </div>
        )}
        {visibleCount >= filtered.length && filtered.length > PAGE_SIZE && (
          <div className="py-4 text-center text-xs text-muted-foreground">— End of list —</div>
        )}
      </div>

      <SwimmerDetailDrawer
        swimmer={selected}
        siblings={selected ? siblingsOf(selected) : []}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onOpenRequest={openRequest}
        onOpenEnrollment={openEnrollment}
        onSelectSwimmer={openSwimmer}
      />

      <LessonRequestDetailDialog
        request={activeRequest}
        open={reqDialogOpen}
        onOpenChange={setReqDialogOpen}
        onUpdated={(r) => setActiveRequest(r)}
      />
    </div>
  );
}

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Mail, Phone, User as UserIcon } from "lucide-react";
import { useSwimmers, type Swimmer, type SwimmerStatusKey } from "@/hooks/useSwimmers";
import SwimmerStatusBadges from "@/components/admin/clients/SwimmerStatusBadges";
import SwimmerDetailDrawer from "@/components/admin/clients/SwimmerDetailDrawer";
import LessonRequestDetailDialog, { type LessonRequest } from "@/components/admin/LessonRequestDetailDialog";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Filter = "all" | "new_inquiry" | "active" | "upcoming" | "unpaid" | "past" | "has_request";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new_inquiry", label: "New Inquiry" },
  { key: "active", label: "Active" },
  { key: "upcoming", label: "Upcoming" },
  { key: "unpaid", label: "Unpaid" },
  { key: "past", label: "Past" },
  { key: "has_request", label: "Has Request" },
];

const matchFilter = (s: Swimmer, f: Filter) => {
  if (f === "all") return true;
  const keys = new Set<SwimmerStatusKey>(s.statuses.map((x) => x.key));
  if (f === "new_inquiry") return keys.has("new_inquiry");
  if (f === "active") return keys.has("enrolled_active") || keys.has("booking_active");
  if (f === "upcoming") return keys.has("enrolled_upcoming");
  if (f === "unpaid") return keys.has("unpaid");
  if (f === "past") return keys.has("past_client");
  if (f === "has_request")
    return keys.has("lesson_requested_new") || keys.has("lesson_requested_contacted") || keys.has("lesson_requested_scheduled");
  return true;
};

export default function ClientsAdmin() {
  const { swimmers, loading } = useSwimmers();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Swimmer | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

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
    // Deep-link to the enrollments admin page (existing dialog lives there)
    window.location.href = `/admin/enrollments?enrollment=${id}`;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground">Clients</h2>
          <p className="text-sm text-muted-foreground">
            One row per swimmer. Search across requests, enrollments, and bookings.
          </p>
        </div>
        <Badge variant="outline" className="text-sm">
          {filtered.length} of {swimmers.length}
        </Badge>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search swimmer, parent, email, or phone…"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <Button
                key={f.key}
                variant={filter === f.key ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(f.key)}
                className="h-8"
              >
                {f.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {filtered.map((s) => (
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
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">No swimmers match.</CardContent>
          </Card>
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

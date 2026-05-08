import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LEVEL_DISPLAY, type SwimLevel, getGroupName, getAgeGroup } from "@/components/swim-enrollment/types";
import { ChevronDown, Users, Info } from "lucide-react";
import { useState } from "react";
import LevelBadge from "@/components/LevelBadge";
import { formatPaymentStatus, paymentStatusBadgeClass } from "@/lib/paymentLabels";


interface SessionInfo {
  id: string;
  start_time: string;
  end_time?: string;
  session_name: string | null;
  age_group: string | null;
  swim_level: string;
  max_students: number;
  day_of_week: string;
  session_period_id: string | null;
}

interface Enrollment {
  id: string;
  child_name: string;
  child_age: number;
  parent_name: string;
  parent_email: string;
  payment_status: string;
  session_fee_status?: string;
  status: string;
  session_id: string | null;
}

interface SessionPeriod {
  id: string;
  name: string;
  start_date: string;
}

function formatDayOfWeek(dow: string) {
  const map: Record<string, string> = {
    monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu",
    friday: "Fri", saturday: "Sat", sunday: "Sun",
  };
  const parts = dow.toLowerCase().split("_");
  return parts.map(p => map[p] || p).join(" & ");
}

function formatTime(t: string) {
  const [h, m] = t.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m} ${ampm}`;
}

export default function SessionEnrollmentCards({
  sessions,
  enrollments,
  sessionPeriods,
}: {
  sessions: Record<string, SessionInfo>;
  enrollments: Enrollment[];
  sessionPeriods: SessionPeriod[];
}) {
  const getDefaultPeriod = () => {
    if (sessionPeriods.length === 0) return "all";
    const today = new Date().toISOString().split("T")[0];
    // Pick the next upcoming session, or if all are past, pick the first one (earliest)
    const upcoming = sessionPeriods.find(p => p.start_date >= today);
    return upcoming?.id || sessionPeriods[0].id;
  };
  const [selectedPeriod, setSelectedPeriod] = useState<string>(getDefaultPeriod);
  const enrollmentsBySession: Record<string, Enrollment[]> = {};
  enrollments.forEach((e) => {
    if (e.session_id && e.status !== "cancelled") {
      if (!enrollmentsBySession[e.session_id]) enrollmentsBySession[e.session_id] = [];
      enrollmentsBySession[e.session_id].push(e);
    }
  });

  const sessionsByPeriod: Record<string, SessionInfo[]> = {};
  const unassigned: SessionInfo[] = [];
  Object.values(sessions).forEach((s) => {
    if (s.session_period_id) {
      if (!sessionsByPeriod[s.session_period_id]) sessionsByPeriod[s.session_period_id] = [];
      sessionsByPeriod[s.session_period_id].push(s);
    } else {
      unassigned.push(s);
    }
  });

  const periodOrder = sessionPeriods.filter(p => sessionsByPeriod[p.id]);
  const filteredPeriods = selectedPeriod === "all"
    ? periodOrder
    : periodOrder.filter(p => p.id === selectedPeriod);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Sessions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sessions</SelectItem>
            {periodOrder.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="w-3.5 h-3.5" />
          <span><strong>Reg</strong> = $45 registration fee · <strong>Session</strong> = $240 tuition</span>
        </div>
      </div>

      {filteredPeriods.map((period) => (
        <div key={period.id} className="space-y-4">
          <h3 className="text-lg font-semibold text-foreground">{period.name}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sessionsByPeriod[period.id]
              .sort((a, b) => a.start_time.localeCompare(b.start_time))
              .map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  enrolled={enrollmentsBySession[session.id] || []}
                />
              ))}
          </div>
        </div>
      ))}
      {unassigned.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-muted-foreground">Unassigned Sessions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {unassigned.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                enrolled={enrollmentsBySession[session.id] || []}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SessionCard({ session, enrolled }: { session: SessionInfo; enrolled: Enrollment[] }) {
  const [open, setOpen] = useState(false);
  const levelInfo = LEVEL_DISPLAY[session.swim_level as SwimLevel];
  const ageGroup = session.age_group === "preschool-3-5" ? "preschool-3-5" as const : "school-age-6-12" as const;
  const groupName = levelInfo ? getGroupName(session.swim_level as SwimLevel, ageGroup) : session.swim_level;
  const count = enrolled.length;
  const max = session.max_students;
  const pct = max > 0 ? Math.min((count / max) * 100, 100) : 0;
  const isFull = count >= max;

  return (
    <Card className={isFull ? "border-red-300" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {levelInfo && <LevelBadge level={session.swim_level as SwimLevel} size={36} />}
            <CardTitle className="text-sm font-medium truncate">
              {session.session_name || groupName}
            </CardTitle>
          </div>
          <Badge variant="outline" className={levelInfo?.color || ""}>
            {groupName}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground space-y-0.5">
          <div>{formatDayOfWeek(session.day_of_week)} · {formatTime(session.start_time)}{session.end_time ? ` – ${formatTime(session.end_time)}` : ""}</div>
          {session.age_group && <div className="capitalize">{session.age_group.replace(/-/g, " ").replace("3 5", "3–5").replace("6 12", "6–12")}</div>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {count} / {max}
            </span>
            {isFull && <span className="text-xs font-medium text-red-600">FULL</span>}
          </div>
          <Progress value={pct} className="h-2" />
        </div>

        {count > 0 && (
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
              {open ? "Hide" : "Show"} swimmers
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-1">
              {enrolled.map((e) => (
                <div key={e.id} className="flex items-start justify-between gap-2 text-xs py-1.5 border-b last:border-0">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{e.child_name}</div>
                    <div className="text-muted-foreground truncate">{e.parent_name}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant="outline" className={`${paymentStatusBadgeClass(e.payment_status)} text-[10px]`}>
                      Reg: {formatPaymentStatus(e.payment_status)}
                    </Badge>
                    <Badge variant="outline" className={`${paymentStatusBadgeClass(e.session_fee_status)} text-[10px]`}>
                      Session: {formatPaymentStatus(e.session_fee_status)}
                    </Badge>
                  </div>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}

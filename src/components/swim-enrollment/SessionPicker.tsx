import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Clock, Users, Loader2, DollarSign, Calendar, ShoppingBag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SwimLevel, LEVEL_DISPLAY, getAgeGroup, getGroupName, AGE_GROUP_LABELS, PRICING } from "./types";

interface SessionWithSpots {
  id: string;
  session_name: string;
  session_start_date: string;
  session_end_date: string;
  start_time: string;
  end_time: string;
  max_students: number;
  enrolled_count: number;
  spots_left: number;
  age_group: string;
}

interface Props {
  level: SwimLevel;
  childAge: number;
  onSelect: (sessionId: string) => void;
  onBack: () => void;
}

function formatTime(time: string) {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m} ${ampm}`;
}

function formatDateRange(start: string, end: string) {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${s.toLocaleDateString("en-US", opts)} – ${e.toLocaleDateString("en-US", opts)}`;
}

const SessionPicker = ({ level, childAge, onSelect, onBack }: Props) => {
  const [sessions, setSessions] = useState<SessionWithSpots[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const ageGroup = getAgeGroup(childAge);
  const levelInfo = LEVEL_DISPLAY[level];

  // Preschool classes are mixed (white/red together, 3 total).
  // All preschool sessions are stored as "white" level.
  // School-age: query by exact level.

  useEffect(() => {
    async function fetchSessions() {
      setLoading(true);
      let query = supabase
        .from("swim_sessions")
        .select("*")
        .eq("age_group", ageGroup)
        .eq("is_active", true)
        .eq("registration_status", "open");

      // For school-age, filter by exact level; for preschool, show all preschool sessions
      if (ageGroup === "school-age-6-12") {
        query = query.eq("swim_level", level);
      }

      const { data: sessionData, error } = await query;

      if (error || !sessionData) {
        setLoading(false);
        return;
      }

      const sessionIds = sessionData.map((s) => s.id);
      const { data: enrollments } = sessionIds.length > 0
        ? await supabase
            .from("swim_enrollments")
            .select("session_id")
            .in("session_id", sessionIds)
            .in("status", ["pending", "confirmed"])
        : { data: [] };

      const countMap: Record<string, number> = {};
      enrollments?.forEach((e) => {
        if (e.session_id) {
          countMap[e.session_id] = (countMap[e.session_id] || 0) + 1;
        }
      });

      const withSpots: SessionWithSpots[] = sessionData.map((s: any) => ({
        id: s.id,
        session_name: s.session_name || "Session",
        session_start_date: s.session_start_date || "",
        session_end_date: s.session_end_date || "",
        start_time: s.start_time,
        end_time: s.end_time,
        max_students: s.max_students,
        enrolled_count: countMap[s.id] || 0,
        spots_left: s.max_students - (countMap[s.id] || 0),
        age_group: s.age_group || "",
      }));

      withSpots.sort((a, b) => {
        if (a.session_name !== b.session_name) return a.session_name.localeCompare(b.session_name);
        return a.start_time.localeCompare(b.start_time);
      });

      setSessions(withSpots);
      setLoading(false);
    }
    fetchSessions();
  }, [level, ageGroup, sessionLevel]);

  const grouped = sessions.reduce<Record<string, SessionWithSpots[]>>((acc, s) => {
    const key = `${s.session_name}|${s.session_start_date}|${s.session_end_date}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      className="max-w-2xl mx-auto"
    >
      <h3 className="font-display text-2xl font-bold text-foreground mb-1">
        Pick a Session
      </h3>
      <p className="text-muted-foreground text-sm mb-2">
        Choose a <strong>{getGroupName(level, ageGroup)}</strong> ({levelInfo.name}) class · {AGE_GROUP_LABELS[ageGroup]}
      </p>
      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-4">
        <span className="flex items-center gap-1">
          <DollarSign className="w-3.5 h-3.5" />
          ${PRICING.group}/lesson (group)
        </span>
        <span className="flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5" />
          Mon & Wed
        </span>
      </div>
      <div className="flex items-center gap-2 text-sm bg-accent/50 border border-accent rounded-lg p-3 mb-6">
        <ShoppingBag className="w-4 h-4 text-primary shrink-0" />
        <span className="text-foreground">
          <strong>${PRICING.registrationFee} registration fee</strong> — includes swim bag, swim cap & goggles
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : sessions.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">No sessions available for this level and age group right now.</p>
        </Card>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([key, groupSessions]) => {
            const [name, startDate, endDate] = key.split("|");
            return (
              <div key={key}>
                <div className="flex items-center gap-2 mb-3">
                  <h4 className="font-semibold text-foreground">{name}</h4>
                  {startDate && endDate && (
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      {formatDateRange(startDate, endDate)}
                    </span>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {groupSessions.map((session) => {
                    const isFull = session.spots_left <= 0;
                    const isSelected = selectedId === session.id;
                    return (
                      <button
                        key={session.id}
                        disabled={isFull}
                        onClick={() => setSelectedId(session.id)}
                        className={`text-left p-4 rounded-xl border transition-all ${
                          isFull
                            ? "opacity-50 cursor-not-allowed border-border bg-muted"
                            : isSelected
                            ? "border-primary bg-accent shadow-md"
                            : "border-border hover:border-primary/40 bg-card"
                        }`}
                      >
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {formatTime(session.start_time)} – {formatTime(session.end_time)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            {isFull ? (
                              <span className="text-destructive font-medium">Full</span>
                            ) : (
                              <span>{session.spots_left} spot{session.spots_left !== 1 ? "s" : ""} left</span>
                            )}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex justify-between mt-8">
        <Button variant="ghost" onClick={onBack}>
          <ChevronLeft className="mr-1 w-4 h-4" /> Back
        </Button>
        <Button
          disabled={!selectedId}
          onClick={() => selectedId && onSelect(selectedId)}
          className="bg-primary text-primary-foreground"
        >
          Continue <ChevronRight className="ml-1 w-4 h-4" />
        </Button>
      </div>
    </motion.div>
  );
};

export default SessionPicker;

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Clock, Users, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SwimLevel, LEVEL_DISPLAY } from "./types";

interface SessionWithSpots {
  id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  max_students: number;
  enrolled_count: number;
  spots_left: number;
}

interface Props {
  level: SwimLevel;
  onSelect: (sessionId: string) => void;
  onBack: () => void;
}

const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday"];

function formatTime(time: string) {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m} ${ampm}`;
}

function capitalizeDay(day: string) {
  return day.charAt(0).toUpperCase() + day.slice(1);
}

const SessionPicker = ({ level, onSelect, onBack }: Props) => {
  const [sessions, setSessions] = useState<SessionWithSpots[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSessions() {
      setLoading(true);
      // Get sessions for this level
      const { data: sessionData, error } = await supabase
        .from("swim_sessions")
        .select("*")
        .eq("swim_level", level)
        .eq("is_active", true);

      if (error || !sessionData) {
        setLoading(false);
        return;
      }

      // Get enrollment counts per session
      const sessionIds = sessionData.map((s) => s.id);
      const { data: enrollments } = await supabase
        .from("swim_enrollments")
        .select("session_id")
        .in("session_id", sessionIds)
        .in("status", ["pending", "confirmed"]);

      const countMap: Record<string, number> = {};
      enrollments?.forEach((e) => {
        if (e.session_id) {
          countMap[e.session_id] = (countMap[e.session_id] || 0) + 1;
        }
      });

      const withSpots: SessionWithSpots[] = sessionData.map((s) => ({
        id: s.id,
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
        max_students: s.max_students,
        enrolled_count: countMap[s.id] || 0,
        spots_left: s.max_students - (countMap[s.id] || 0),
      }));

      // Sort by day order
      withSpots.sort(
        (a, b) => DAY_ORDER.indexOf(a.day_of_week) - DAY_ORDER.indexOf(b.day_of_week)
      );

      setSessions(withSpots);
      setLoading(false);
    }
    fetchSessions();
  }, [level]);

  const levelInfo = LEVEL_DISPLAY[level];

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      className="max-w-2xl mx-auto"
    >
      <h3 className="font-display text-2xl font-bold text-foreground mb-1">
        Pick a Session
      </h3>
      <p className="text-muted-foreground text-sm mb-6">
        Choose a {levelInfo.name} class that works for your schedule. Max 4 students per class.
      </p>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : sessions.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">No sessions available for this level right now.</p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {sessions.map((session) => {
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
                <p className="font-semibold text-foreground">
                  {capitalizeDay(session.day_of_week)}
                </p>
                <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
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

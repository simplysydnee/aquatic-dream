import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Clock, Users, Loader2, DollarSign, Calendar, ShoppingBag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SwimLevel, LEVEL_DISPLAY, getAgeGroup, getGroupName, AGE_GROUP_LABELS, PRICING } from "./types";

interface SlotInfo {
  assignSessionId: string;
  periodName: string;
  start_time: string;
  end_time: string;
  max_students: number;
  total_enrolled: number;
  spots_left: number;
  session_start_date: string;
  session_end_date: string;
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

function formatClassDate(d: string) {
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const SessionPicker = ({ level, childAge, onSelect, onBack }: Props) => {
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [classDates, setClassDates] = useState<string[]>([]);
  const [loadingDates, setLoadingDates] = useState(false);

  const ageGroup = getAgeGroup(childAge);
  const levelInfo = LEVEL_DISPLAY[level];

  useEffect(() => {
    async function fetchSessions() {
      setLoading(true);

      // Fetch active session periods and matching sessions in parallel
      const [periodsRes, sessionsRes] = await Promise.all([
        supabase.from("session_periods").select("*").eq("is_active", true).order("start_date"),
        supabase.from("swim_sessions").select("*")
          .eq("age_group", ageGroup)
          .eq("swim_level", level)
          .eq("is_active", true)
          .eq("registration_status", "open"),
      ]);

      const periods = periodsRes.data || [];
      const sessions = sessionsRes.data || [];

      if (sessions.length === 0) {
        setSlots([]);
        setLoading(false);
        return;
      }

      // Only show sessions linked to active periods
      const activePeriodIds = new Set(periods.map(p => p.id));
      const activeSessions = sessions.filter(s => s.session_period_id && activePeriodIds.has(s.session_period_id));

      if (activeSessions.length === 0) {
        setSlots([]);
        setLoading(false);
        return;
      }

      const allIds = activeSessions.map(s => s.id);
      const { data: enrollments } = await supabase
        .from("swim_enrollments")
        .select("session_id")
        .in("session_id", allIds)
        .in("status", ["pending", "confirmed"]);

      const countMap: Record<string, number> = {};
      enrollments?.forEach(e => {
        if (e.session_id) countMap[e.session_id] = (countMap[e.session_id] || 0) + 1;
      });

      const periodMap = Object.fromEntries(periods.map(p => [p.id, p]));

      const result: SlotInfo[] = activeSessions.map(s => {
        const totalEnrolled = countMap[s.id] || 0;
        const period = periodMap[s.session_period_id!];
        return {
          assignSessionId: s.id,
          periodName: period?.name || "Session",
          start_time: s.start_time,
          end_time: s.end_time,
          max_students: s.max_students,
          total_enrolled: totalEnrolled,
          spots_left: s.max_students - totalEnrolled,
          session_start_date: s.session_start_date || "",
          session_end_date: s.session_end_date || "",
        };
      });

      result.sort((a, b) => {
        if (a.periodName !== b.periodName) return a.periodName.localeCompare(b.periodName);
        return a.start_time.localeCompare(b.start_time);
      });

      setSlots(result);
      setLoading(false);
    }
    fetchSessions();
  }, [level, ageGroup]);

  // Fetch class dates when a slot is selected
  useEffect(() => {
    if (!selectedId) { setClassDates([]); return; }
    async function fetchDates() {
      setLoadingDates(true);
      const { data } = await supabase
        .from("session_lesson_dates")
        .select("lesson_date, is_cancelled")
        .eq("session_id", selectedId)
        .eq("is_cancelled", false)
        .order("lesson_date");
      setClassDates(data?.map(d => d.lesson_date) || []);
      setLoadingDates(false);
    }
    fetchDates();
  }, [selectedId]);

  // Group by period
  const grouped = slots.reduce<Record<string, SlotInfo[]>>((acc, s) => {
    const key = `${s.periodName}|${s.session_start_date}|${s.session_end_date}`;
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
      ) : slots.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">No sessions available for this level and age group right now.</p>
        </Card>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([key, groupSlots]) => {
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
                  {groupSlots.map((slot) => {
                    const isFull = slot.spots_left <= 0;
                    const isSelected = selectedId === slot.assignSessionId;
                    return (
                      <button
                        key={slot.assignSessionId}
                        disabled={isFull}
                        onClick={() => setSelectedId(slot.assignSessionId)}
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
                            {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            {isFull ? (
                              <span className="text-destructive font-medium">Full</span>
                            ) : (
                              <span>{slot.spots_left} spot{slot.spots_left !== 1 ? "s" : ""} left</span>
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

      {selectedId && classDates.length > 0 && (
        <div className="mt-4 p-4 rounded-xl border border-primary/20 bg-accent/30">
          <p className="text-sm font-medium text-foreground mb-2 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-primary" />
            Class Dates ({classDates.length} classes)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {classDates.map(d => (
              <span key={d} className="text-xs bg-background border border-border rounded-md px-2 py-1 text-muted-foreground">
                {formatClassDate(d)}
              </span>
            ))}
          </div>
        </div>
      )}
      {selectedId && loadingDates && (
        <div className="mt-4 flex justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
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

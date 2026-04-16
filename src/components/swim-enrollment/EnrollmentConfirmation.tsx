import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, ArrowRight, Calendar, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { LEVEL_DISPLAY, LEVEL_BADGE_COLORS, SwimLevel, PRICING, getGroupName, getAgeGroup, getLevelLabel } from "./types";
import { supabase } from "@/integrations/supabase/client";

function formatClassDate(d: string) {
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

interface ChildInfo {
  level: SwimLevel;
  childName: string;
  childAge: number;
  sessionIds: string[];
  isFirstTime: boolean;
}

interface Props {
  level: SwimLevel;
  childName: string;
  childAge: number;
  sessionIds?: string[];
  /** @deprecated use sessionIds instead */
  sessionId?: string | null;
  isFirstTime?: boolean;
  totalDue?: number;
  children?: ChildInfo[];
}

const EnrollmentConfirmation = ({ level, childName, childAge, sessionIds, sessionId, isFirstTime = true, totalDue = 0, children: multiChildren }: Props) => {
  const isMulti = multiChildren && multiChildren.length > 1;
  const displayChildren = multiChildren && multiChildren.length > 0 ? multiChildren : [{ level, childName, childAge, sessionIds: sessionIds || (sessionId ? [sessionId] : []), isFirstTime: isFirstTime ?? true }];
  const firstChild = displayChildren[0];
  const levelInfo = LEVEL_DISPLAY[level];
  const badge = LEVEL_BADGE_COLORS[level];
  const ageGroup = getAgeGroup(childAge);
  const levelLabel = getLevelLabel(level, ageGroup);
  const groupName = getGroupName(level, ageGroup);
  const [classDates, setClassDates] = useState<Record<string, string[]>>({});
  const [sessionNames, setSessionNames] = useState<Record<string, string>>({});
  const [loadingDates, setLoadingDates] = useState(false);

  // Normalize to array
  const ids = sessionIds && sessionIds.length > 0 ? sessionIds : sessionId ? [sessionId] : [];

  useEffect(() => {
    if (ids.length === 0) return;
    async function fetchDates() {
      setLoadingDates(true);
      const [datesRes, sessionsRes] = await Promise.all([
        supabase
          .from("session_lesson_dates")
          .select("session_id, lesson_date")
          .in("session_id", ids)
          .eq("is_cancelled", false)
          .order("lesson_date"),
        supabase
          .from("swim_sessions")
          .select("id, session_period_id, day_of_week, start_time")
          .in("id", ids),
      ]);

      const grouped: Record<string, string[]> = {};
      datesRes.data?.forEach(d => {
        if (!grouped[d.session_id]) grouped[d.session_id] = [];
        grouped[d.session_id].push(d.lesson_date);
      });
      setClassDates(grouped);

      // Fetch period names
      if (sessionsRes.data) {
        const periodIds = sessionsRes.data.map(s => s.session_period_id).filter(Boolean) as string[];
        if (periodIds.length > 0) {
          const { data: periods } = await supabase
            .from("session_periods")
            .select("id, name")
            .in("id", periodIds);
          const periodMap = Object.fromEntries((periods || []).map(p => [p.id, p.name]));
          const names: Record<string, string> = {};
          sessionsRes.data.forEach(s => {
            names[s.id] = s.session_period_id ? (periodMap[s.session_period_id] || "Session") : "Session";
          });
          setSessionNames(names);
        }
      }

      setLoadingDates(false);
    }
    fetchDates();
  }, [ids.join(",")]);

  const allDates = Object.values(classDates).flat().sort();
  const firstClassDate = allDates.length > 0 ? formatClassDate(allDates[0]) : "your first class";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-center max-w-md mx-auto"
    >
      <Card className="border-primary/20 bg-gradient-to-br from-accent to-card">
        <CardContent className="pt-8 pb-6 px-6">
          <CheckCircle className="w-12 h-12 text-primary mx-auto mb-4" />
          <h3 className="font-display text-2xl font-bold text-foreground mb-2">
            You're All Set!
          </h3>
          <p className="text-muted-foreground mb-2">
            <strong>{childName}</strong> has been enrolled in{" "}
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm font-medium ${badge.bg} ${badge.text}`}>
              {groupName} — {levelLabel}
            </span>
            {ids.length > 1 && (
              <span className="text-sm text-muted-foreground"> for {ids.length} sessions</span>
            )}
          </p>

          {/* Payment Summary */}
          {isFirstTime ? (
            <>
              <div className="my-4 p-3 rounded-lg border border-green-300 bg-green-50 text-left">
                <p className="text-sm font-semibold text-green-800 flex items-center gap-1.5 mb-1">
                  <CheckCircle className="w-4 h-4" />
                  Registration Fee Paid
                </p>
                <div className="text-sm text-green-700 space-y-0.5">
                  <p>Registration fee: <strong>${PRICING.registrationFee}</strong> <span className="text-xs">(swim bag, cap & goggles)</span></p>
                </div>
              </div>
              <div className="my-4 p-3 rounded-lg border border-amber-300 bg-amber-50 text-left">
                <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5 mb-1">
                  <Calendar className="w-4 h-4" />
                  Session Fees Due
                </p>
                <div className="text-sm text-amber-700 space-y-0.5">
                  <p>Session fee{ids.length > 1 ? `s (${ids.length} sessions)` : ""}: <strong>${totalDue - PRICING.registrationFee}</strong></p>
                  <p className="text-xs">Due on or before {firstClassDate}</p>
                </div>
              </div>
            </>
          ) : (
            <div className="my-4 p-3 rounded-lg border border-green-300 bg-green-50 text-left">
              <p className="text-sm font-semibold text-green-800 flex items-center gap-1.5 mb-1">
                <CheckCircle className="w-4 h-4" />
                Payment Complete
              </p>
              <div className="text-sm text-green-700 space-y-0.5">
                <p>Session fee{ids.length > 1 ? `s (${ids.length} sessions)` : ""}: <strong>${totalDue}</strong></p>
                <p className="font-semibold border-t border-green-200 pt-1 mt-1">Total paid: ${totalDue}</p>
              </div>
            </div>
          )}

          {/* Class dates */}
          {loadingDates && (
            <div className="flex justify-center my-3">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            </div>
          )}
          {ids.map(id => {
            const dates = classDates[id] || [];
            if (dates.length === 0) return null;
            return (
              <div key={id} className="my-4 p-3 rounded-lg border border-primary/20 bg-background/50 text-left">
                <p className="text-xs font-medium text-foreground mb-2 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-primary" />
                  {ids.length > 1 && sessionNames[id] ? `${sessionNames[id]} — ` : ""}
                  {dates.length} classes
                </p>
                <div className="flex flex-wrap gap-1">
                  {dates.map(d => (
                    <span key={d} className="text-xs bg-muted border border-border rounded px-1.5 py-0.5 text-muted-foreground">
                      {formatClassDate(d)}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}

          <p className="text-muted-foreground mb-4 text-sm">
            We'll send a confirmation email with all the details.
          </p>
          <p className="text-xs text-muted-foreground mb-6">
            Our instructors will confirm the level placement on the first day.
            If adjustments are needed, we'll work with you to find the perfect fit.
          </p>
          <div className="flex gap-3 justify-center">
            <Button asChild variant="outline">
              <Link to="/swim-lessons">Back to Swim Lessons</Link>
            </Button>
            <Button asChild className="bg-primary text-primary-foreground">
              <Link to="/">
                Home <ArrowRight className="ml-1 w-4 h-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default EnrollmentConfirmation;

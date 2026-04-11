import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, ArrowRight, Calendar, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { LEVEL_DISPLAY, LEVEL_BADGE_COLORS, SwimLevel, PRICING, getGroupName, getAgeGroup } from "./types";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  level: SwimLevel;
  childName: string;
  childAge: number;
  sessionId?: string | null;
}

function formatClassDate(d: string) {
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const EnrollmentConfirmation = ({ level, childName, childAge, sessionId }: Props) => {
  const levelInfo = LEVEL_DISPLAY[level];
  const badge = LEVEL_BADGE_COLORS[level];
  const ageGroup = getAgeGroup(childAge);
  const groupName = getGroupName(level, ageGroup);
  const [classDates, setClassDates] = useState<string[]>([]);
  const [loadingDates, setLoadingDates] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    async function fetchDates() {
      setLoadingDates(true);
      const { data } = await supabase
        .from("session_lesson_dates")
        .select("lesson_date")
        .eq("session_id", sessionId!)
        .eq("is_cancelled", false)
        .order("lesson_date");
      setClassDates(data?.map(d => d.lesson_date) || []);
      setLoadingDates(false);
    }
    fetchDates();
  }, [sessionId]);

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
              {groupName}
            </span>
          </p>
          <p className="text-sm text-muted-foreground mb-1">
            ${PRICING.group}/lesson (group) · Mon & Wed
          </p>
          <p className="text-sm text-muted-foreground mb-2">
            + ${PRICING.registrationFee} registration fee (swim bag, cap & goggles)
          </p>

          {/* Class dates */}
          {loadingDates && (
            <div className="flex justify-center my-3">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            </div>
          )}
          {classDates.length > 0 && (
            <div className="my-4 p-3 rounded-lg border border-primary/20 bg-background/50 text-left">
              <p className="text-xs font-medium text-foreground mb-2 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                Your Class Dates ({classDates.length} classes)
              </p>
              <div className="flex flex-wrap gap-1">
                {classDates.map(d => (
                  <span key={d} className="text-xs bg-muted border border-border rounded px-1.5 py-0.5 text-muted-foreground">
                    {formatClassDate(d)}
                  </span>
                ))}
              </div>
            </div>
          )}

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

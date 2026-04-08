import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { LEVEL_DISPLAY, LEVEL_BADGE_COLORS, SwimLevel, PRICING, getGroupName, getDiveStatus, getAgeGroup } from "./types";

interface Props {
  level: SwimLevel;
  childName: string;
  childAge: number;
}

const EnrollmentConfirmation = ({ level, childName }: Props) => {
  const levelInfo = LEVEL_DISPLAY[level];
  const badge = LEVEL_BADGE_COLORS[level];

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
              {levelInfo.name}
            </span>
          </p>
          <p className="text-sm text-muted-foreground mb-1">
            ${PRICING.group}/lesson (group) · Mon & Wed
          </p>
          <p className="text-sm text-muted-foreground mb-2">
            + ${PRICING.registrationFee} registration fee (swim bag, cap & goggles)
          </p>
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

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ChevronRight, ChevronLeft, Sparkles } from "lucide-react";
import { SwimLevel, LEVEL_DISPLAY, LEVEL_BADGE_COLORS, getGroupName, getDiveStatus, getAgeGroup } from "./types";

interface Props {
  onComplete: (level: SwimLevel, age: number) => void;
}

interface DecisionStep {
  key: string;
  title: string;
  subtitle: string;
  yesLabel: string;
  noLabel: string;
}

const DECISION_STEPS: DecisionStep[] = [
  {
    key: "canSubmerge",
    title: "Can your child submerge while relaxed for at least 5 seconds?",
    subtitle: "Putting their face or whole head under water comfortably",
    yesLabel: "Yes, they can",
    noLabel: "Not yet",
  },
  {
    key: "canFloat",
    title: "Can your child float on their front and back without support?",
    subtitle: "Independently, without holding onto anything or anyone",
    yesLabel: "Yes, independently",
    noLabel: "Not yet",
  },
  {
    key: "canTreadWater",
    title: "Can your child tread water for at least 10 seconds?",
    subtitle: "Staying upright in deep water using arms and legs",
    yesLabel: "Yes, for 10+ seconds",
    noLabel: "Not yet",
  },
  {
    key: "canSideRollSide",
    title: "Can your child do a side-roll-side kick drill for 10 meters (about 30 feet)?",
    subtitle: "Kicking on their side, rolling to breathe, then switching sides",
    yesLabel: "Yes, they can",
    noLabel: "Not yet",
  },
];

function determineLevel(answers: Record<string, boolean>, age: number): SwimLevel {
  const isPreschool = age <= 5;
  // Preschool: White or Red only. School-age: Yellow, Blue, or Green only.
  if (!answers.canSubmerge) return isPreschool ? "white" : "yellow";
  if (!answers.canFloat) return isPreschool ? "red" : "yellow";
  if (isPreschool) return "red"; // Preschool caps at Red
  if (!answers.canTreadWater) return "yellow";
  if (!answers.canSideRollSide) return "blue";
  return "green";
}

const SwimAssessment = ({ onComplete }: Props) => {
  const [phase, setPhase] = useState<"age" | "questions" | "result">("age");
  const [age, setAge] = useState<number | undefined>();
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [recommendedLevel, setRecommendedLevel] = useState<SwimLevel | null>(null);

  // Preschool (3-5) only gets White or Red questions
  const maxQuestionIndex = age && age <= 5 ? 1 : DECISION_STEPS.length - 1;

  const handleAgeNext = () => {
    if (!age || age < 3 || age > 12) return;
    setPhase("questions");
    setQuestionIndex(0);
    setAnswers({});
  };

  const handleAnswer = (answer: boolean) => {
    const step = DECISION_STEPS[questionIndex];
    const newAnswers = { ...answers, [step.key]: answer };
    setAnswers(newAnswers);

    if (!answer) {
      const level = determineLevel(newAnswers, age!);
      setRecommendedLevel(level);
      setPhase("result");
    } else if (questionIndex >= maxQuestionIndex) {
      const level = determineLevel(newAnswers, age!);
      setRecommendedLevel(level);
      setPhase("result");
    } else {
      setQuestionIndex(questionIndex + 1);
    }
  };

  const totalSteps = maxQuestionIndex + 2;
  const currentStep = phase === "age" ? 0 : phase === "questions" ? questionIndex + 1 : totalSteps;

  if (phase === "result" && recommendedLevel) {
    const levelInfo = LEVEL_DISPLAY[recommendedLevel];
    const badge = LEVEL_BADGE_COLORS[recommendedLevel];
    const ageGroup = getAgeGroup(age!);
    const groupName = getGroupName(recommendedLevel, ageGroup);
    const diveStatus = getDiveStatus(recommendedLevel, ageGroup);
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center"
      >
        <Card className="border-primary/30 bg-gradient-to-br from-accent to-card max-w-md mx-auto">
          <CardContent className="pt-8 pb-6 px-6">
            <div className="flex justify-center mb-4">
              <Sparkles className="w-6 h-6 text-coral animate-pulse" />
            </div>
            <p className="text-sm font-medium text-primary uppercase tracking-wider mb-2">
              We recommend
            </p>
            <div className={`w-24 h-24 rounded-full ${badge.bg} ring-4 ${badge.ring} shadow-lg mx-auto mb-4 flex items-center justify-center`}>
              <span className={`font-display text-2xl font-bold ${badge.text}`}>
                {levelInfo.name.charAt(0)}
              </span>
            </div>
            <h3 className="font-display text-3xl font-bold text-foreground mb-0.5">
              {groupName}
            </h3>
            <p className="text-sm font-medium text-muted-foreground mb-1">
              {levelInfo.name} Level
            </p>
            <p className={`text-xs font-semibold uppercase tracking-wider ${badge.text} mb-3`}>
              🤿 {diveStatus}
            </p>
            <p className="text-muted-foreground text-sm mb-6">{levelInfo.description}</p>
            <p className="text-xs text-muted-foreground mb-6">
              This is a tentative placement — our instructors will confirm the best fit on day one.
            </p>
            <div className="flex gap-3 justify-center">
              <Button
                variant="outline"
                onClick={() => {
                  setPhase("age");
                  setAge(undefined);
                  setAnswers({});
                  setQuestionIndex(0);
                  setRecommendedLevel(null);
                }}
              >
                Retake Assessment
              </Button>
              <Button
                className="bg-coral hover:bg-coral/90 text-coral-foreground"
                onClick={() => onComplete(recommendedLevel, age!)}
              >
                Continue to Sessions <ChevronRight className="ml-1 w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex gap-1.5 mb-8">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= currentStep ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {phase === "age" && (
          <motion.div
            key="age"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.2 }}
          >
            <h3 className="font-display text-2xl font-bold text-foreground mb-1">
              How old is your child?
            </h3>
            <p className="text-muted-foreground text-sm mb-6">
              This helps us find the right group
            </p>
            <div className="max-w-[200px]">
              <Input
                type="number"
                min={3}
                max={12}
                placeholder="Age"
                value={age ?? ""}
                onChange={(e) => setAge(parseInt(e.target.value) || undefined)}
                className="text-lg h-12"
              />
              <p className="text-xs text-muted-foreground mt-2">Ages 3–12</p>
            </div>
            <div className="flex justify-end mt-8">
              <Button
                disabled={!age || age < 3 || age > 12}
                onClick={handleAgeNext}
                className="bg-primary text-primary-foreground"
              >
                Next <ChevronRight className="ml-1 w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        )}

        {phase === "questions" && (
          <motion.div
            key={`q-${questionIndex}`}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.2 }}
          >
            <h3 className="font-display text-2xl font-bold text-foreground mb-1">
              {DECISION_STEPS[questionIndex].title}
            </h3>
            <p className="text-muted-foreground text-sm mb-8">
              {DECISION_STEPS[questionIndex].subtitle}
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => handleAnswer(true)}
                className="p-4 rounded-xl border border-border hover:border-primary/40 text-left transition-all hover:bg-accent"
              >
                <p className="font-medium text-foreground text-sm">
                  ✓ {DECISION_STEPS[questionIndex].yesLabel}
                </p>
              </button>
              <button
                onClick={() => handleAnswer(false)}
                className="p-4 rounded-xl border border-border hover:border-primary/40 text-left transition-all hover:bg-accent"
              >
                <p className="font-medium text-foreground text-sm">
                  ✗ {DECISION_STEPS[questionIndex].noLabel}
                </p>
              </button>
            </div>

            <div className="flex justify-start mt-8">
              <Button
                variant="ghost"
                onClick={() => {
                  if (questionIndex === 0) {
                    setPhase("age");
                  } else {
                    const prevKey = DECISION_STEPS[questionIndex - 1].key;
                    const newAnswers = { ...answers };
                    delete newAnswers[prevKey];
                    setAnswers(newAnswers);
                    setQuestionIndex(questionIndex - 1);
                  }
                }}
              >
                <ChevronLeft className="mr-1 w-4 h-4" /> Back
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SwimAssessment;

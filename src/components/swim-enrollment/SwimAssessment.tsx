import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ChevronRight, ChevronLeft, Sparkles } from "lucide-react";
import { AssessmentAnswers, SwimLevel, LEVEL_DISPLAY } from "./types";
import badgePearls from "@/assets/badge-pearls.png";
import badgeReefExplorers from "@/assets/badge-reef-explorers.png";
import badgeSharks from "@/assets/badge-sharks.png";
import badgeSeaTurtles from "@/assets/badge-sea-turtles.png";
import badgeOctopusElite from "@/assets/badge-octopus-elite.png";

const BADGES: Record<SwimLevel, string> = {
  pearls: badgePearls,
  "reef-explorers": badgeReefExplorers,
  sharks: badgeSharks,
  "sea-turtles": badgeSeaTurtles,
  "octopus-elite": badgeOctopusElite,
};

function recommendLevel(a: AssessmentAnswers): SwimLevel {
  let score = 0;

  // Age factor
  if (a.age <= 4) score += 0;
  else if (a.age <= 6) score += 1;
  else if (a.age <= 8) score += 2;
  else if (a.age <= 12) score += 3;
  else score += 4;

  // Water comfort
  const comfortScores = { none: 0, some: 1, comfortable: 2, "very-comfortable": 3 };
  score += comfortScores[a.waterComfort];

  // Floating
  const floatScores = { no: 0, "with-help": 1, yes: 2 };
  score += floatScores[a.canFloat];

  // Stroke ability
  const strokeScores = { none: 0, "basic-kick": 1, "one-stroke": 2, "multiple-strokes": 3, "all-four": 4 };
  score += strokeScores[a.strokeAbility];

  // Pool experience
  const expScores = { never: 0, occasional: 1, regular: 2, competitive: 3 };
  score += expScores[a.poolExperience];

  // Map score to level (max possible = 16)
  if (score <= 3) return "pearls";
  if (score <= 6) return "reef-explorers";
  if (score <= 9) return "sea-turtles";
  if (score <= 12) return "octopus-elite";
  return "sharks";
}

interface Props {
  onComplete: (level: SwimLevel, age: number) => void;
}

const questions = [
  {
    key: "age" as const,
    title: "How old is your child?",
    subtitle: "This helps us find the right group",
    type: "number" as const,
  },
  {
    key: "waterComfort" as const,
    title: "How comfortable is your child in the water?",
    subtitle: "Think about baths, pools, or the ocean",
    type: "radio" as const,
    options: [
      { value: "none", label: "Not comfortable yet", desc: "Anxious or avoids water" },
      { value: "some", label: "Getting there", desc: "Okay with shallow water, supervised" },
      { value: "comfortable", label: "Comfortable", desc: "Enjoys the water, can go under briefly" },
      { value: "very-comfortable", label: "Very comfortable", desc: "Loves the water, no fear" },
    ],
  },
  {
    key: "canFloat" as const,
    title: "Can your child float on their back?",
    subtitle: "Even for a few seconds counts",
    type: "radio" as const,
    options: [
      { value: "no", label: "Not yet" },
      { value: "with-help", label: "With some help" },
      { value: "yes", label: "Yes, independently" },
    ],
  },
  {
    key: "strokeAbility" as const,
    title: "What strokes can your child do?",
    subtitle: "Select the best match",
    type: "radio" as const,
    options: [
      { value: "none", label: "None yet" },
      { value: "basic-kick", label: "Basic kicking with a board" },
      { value: "one-stroke", label: "One stroke (e.g., freestyle)" },
      { value: "multiple-strokes", label: "2–3 strokes" },
      { value: "all-four", label: "All four competitive strokes" },
    ],
  },
  {
    key: "poolExperience" as const,
    title: "How often has your child been in a pool?",
    subtitle: "Previous lessons or regular pool visits",
    type: "radio" as const,
    options: [
      { value: "never", label: "Rarely or never" },
      { value: "occasional", label: "A few times" },
      { value: "regular", label: "Regular lessons or visits" },
      { value: "competitive", label: "Swim team or competitive" },
    ],
  },
];

const SwimAssessment = ({ onComplete }: Props) => {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<AssessmentAnswers>>({});
  const [showResult, setShowResult] = useState(false);
  const [recommendedLevel, setRecommendedLevel] = useState<SwimLevel | null>(null);

  const currentQ = questions[step];
  const isLastQuestion = step === questions.length - 1;

  const canProceed = () => {
    if (currentQ.key === "age") return answers.age && answers.age >= 2 && answers.age <= 18;
    return answers[currentQ.key] !== undefined;
  };

  const handleNext = () => {
    if (isLastQuestion) {
      const level = recommendLevel(answers as AssessmentAnswers);
      setRecommendedLevel(level);
      setShowResult(true);
    } else {
      setStep(step + 1);
    }
  };

  if (showResult && recommendedLevel) {
    const levelInfo = LEVEL_DISPLAY[recommendedLevel];
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
            <div className="w-24 h-24 rounded-full bg-card p-2 shadow-lg mx-auto mb-4">
              <img
                src={BADGES[recommendedLevel]}
                alt={levelInfo.name}
                className="w-full h-full object-contain rounded-full"
              />
            </div>
            <h3 className="font-display text-3xl font-bold text-foreground mb-1">
              {levelInfo.name}
            </h3>
            <p className="text-muted-foreground text-sm mb-6">{levelInfo.description}</p>
            <p className="text-xs text-muted-foreground mb-6">
              This is a tentative placement — our instructors will confirm the best fit on day one.
            </p>
            <div className="flex gap-3 justify-center">
              <Button
                variant="outline"
                onClick={() => {
                  setShowResult(false);
                  setStep(0);
                  setAnswers({});
                }}
              >
                Retake Assessment
              </Button>
              <Button
                className="bg-coral hover:bg-coral/90 text-coral-foreground"
                onClick={() => onComplete(recommendedLevel, answers.age!)}
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
      {/* Progress */}
      <div className="flex gap-1.5 mb-8">
        {questions.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= step ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.2 }}
        >
          <h3 className="font-display text-2xl font-bold text-foreground mb-1">
            {currentQ.title}
          </h3>
          <p className="text-muted-foreground text-sm mb-6">{currentQ.subtitle}</p>

          {currentQ.type === "number" ? (
            <div className="max-w-[200px]">
              <Input
                type="number"
                min={2}
                max={18}
                placeholder="Age"
                value={answers.age ?? ""}
                onChange={(e) =>
                  setAnswers({ ...answers, age: parseInt(e.target.value) || undefined } as any)
                }
                className="text-lg h-12"
              />
              <p className="text-xs text-muted-foreground mt-2">Ages 2–18</p>
            </div>
          ) : (
            <RadioGroup
              value={(answers[currentQ.key] as string) ?? ""}
              onValueChange={(val) => setAnswers({ ...answers, [currentQ.key]: val })}
              className="space-y-3"
            >
              {currentQ.options?.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                    answers[currentQ.key] === opt.value
                      ? "border-primary bg-accent"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <RadioGroupItem value={opt.value} />
                  <div>
                    <p className="font-medium text-foreground text-sm">{opt.label}</p>
                    {"desc" in opt && opt.desc && (
                      <p className="text-xs text-muted-foreground">{opt.desc}</p>
                    )}
                  </div>
                </label>
              ))}
            </RadioGroup>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex justify-between mt-8">
        <Button
          variant="ghost"
          disabled={step === 0}
          onClick={() => setStep(step - 1)}
        >
          <ChevronLeft className="mr-1 w-4 h-4" /> Back
        </Button>
        <Button
          disabled={!canProceed()}
          onClick={handleNext}
          className="bg-primary text-primary-foreground"
        >
          {isLastQuestion ? "See Recommendation" : "Next"}{" "}
          <ChevronRight className="ml-1 w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

export default SwimAssessment;

export type SwimLevel = "pearls" | "reef-explorers" | "sharks" | "sea-turtles" | "octopus-elite";

export const LEVEL_DISPLAY: Record<SwimLevel, { name: string; description: string }> = {
  pearls: { name: "Pearls", description: "Water comfort & safety basics" },
  "reef-explorers": { name: "Reef Explorers", description: "Early intermediate skills" },
  "sea-turtles": { name: "Sea Turtles", description: "Intermediate strokes & endurance" },
  "octopus-elite": { name: "Octopus Elite", description: "Advanced multi-stroke" },
  sharks: { name: "Sharks", description: "Competitive-ready & PADI pathway" },
};

export interface AssessmentAnswers {
  age: number;
  waterComfort: "none" | "some" | "comfortable" | "very-comfortable";
  canFloat: "no" | "with-help" | "yes";
  strokeAbility: "none" | "basic-kick" | "one-stroke" | "multiple-strokes" | "all-four";
  poolExperience: "never" | "occasional" | "regular" | "competitive";
}

export interface EnrollmentData {
  recommendedLevel: SwimLevel;
  sessionId: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  childName: string;
  childAge: number;
  notes: string;
}

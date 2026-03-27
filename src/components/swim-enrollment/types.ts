export type SwimLevel = "white" | "red" | "yellow" | "blue" | "green" | "stroke-school";

export type AgeGroup = "preschool-3-5" | "school-5-8" | "advanced-7+";

export const LEVEL_DISPLAY: Record<SwimLevel, { name: string; description: string; color: string }> = {
  white: { name: "White", description: "Water comfort & safety introduction", color: "bg-gray-100 text-gray-700 border-gray-300" },
  red: { name: "Red", description: "Submersion confidence, beginning floating", color: "bg-red-100 text-red-700 border-red-300" },
  yellow: { name: "Yellow", description: "Independent floating, intro to kicks", color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  blue: { name: "Blue", description: "Treading water, developing strokes", color: "bg-blue-100 text-blue-700 border-blue-300" },
  green: { name: "Green", description: "Side-roll-side kick, stroke development", color: "bg-green-100 text-green-700 border-green-300" },
  "stroke-school": { name: "Stroke School", description: "Advanced stroke refinement (requires Green completion)", color: "bg-purple-100 text-purple-700 border-purple-300" },
};

export const LEVEL_BADGE_COLORS: Record<SwimLevel, { bg: string; ring: string; text: string }> = {
  white: { bg: "bg-gray-50", ring: "ring-gray-300", text: "text-gray-600" },
  red: { bg: "bg-red-50", ring: "ring-red-300", text: "text-red-600" },
  yellow: { bg: "bg-yellow-50", ring: "ring-yellow-300", text: "text-yellow-600" },
  blue: { bg: "bg-blue-50", ring: "ring-blue-300", text: "text-blue-600" },
  green: { bg: "bg-green-50", ring: "ring-green-300", text: "text-green-600" },
  "stroke-school": { bg: "bg-purple-50", ring: "ring-purple-300", text: "text-purple-600" },
};

export const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  "preschool-3-5": "Preschool (Ages 3–5)",
  "school-5-8": "School-Age (Ages 5–8)",
  "advanced-7+": "Advanced (Ages 7+)",
};

export function getAgeGroup(age: number, level: SwimLevel): AgeGroup {
  if (level === "yellow" || level === "blue" || level === "green" || level === "stroke-school") {
    return "advanced-7+";
  }
  if (age <= 5) return "preschool-3-5";
  return "school-5-8";
}

export interface AssessmentAnswers {
  age: number;
  canSubmerge: boolean;
  canFloat: boolean;
  canTreadWater: boolean;
  canSideRollSide: boolean;
  completedGreen: boolean;
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

export type SwimLevel = "white" | "red" | "yellow" | "blue" | "green";

export type AgeGroup = "preschool-3-5" | "school-age-6-12";

export interface LevelInfo {
  name: string;
  groupName: string;
  diveStatus: string;
  description: string;
  color: string;
}

export const LEVEL_DISPLAY: Record<SwimLevel, LevelInfo> = {
  white: { name: "White", groupName: "Little Fins", diveStatus: "Beginner", description: "Water comfort & safety introduction", color: "bg-gray-100 text-gray-700 border-gray-300" },
  red: { name: "Red", groupName: "Reef Explorers", diveStatus: "Foundations", description: "Submersion confidence, beginning floating", color: "bg-red-100 text-red-700 border-red-300" },
  yellow: { name: "Yellow", groupName: "Sea Scouts", diveStatus: "Intermediate", description: "Independent floating, intro to kicks", color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  blue: { name: "Blue", groupName: "Deep Sea Divers", diveStatus: "Advanced", description: "Treading water, developing strokes", color: "bg-blue-100 text-blue-700 border-blue-300" },
  green: { name: "Green", groupName: "Ocean Masters", diveStatus: "Expert", description: "Side-roll-side kick, stroke development", color: "bg-green-100 text-green-700 border-green-300" },
};

/**
 * Single source of truth: color → branded swim-group name.
 * Display this everywhere levels are shown to parents or staff.
 * Color remains the underlying stored value.
 */
export const LEVEL_GROUP_NAMES: Record<SwimLevel, string> = {
  white: "Little Fins",
  red: "Reef Explorers",
  yellow: "Sea Scouts",
  blue: "Deep Sea Divers",
  green: "Ocean Masters",
};

export function getBrandedLevelName(level: SwimLevel): string {
  return LEVEL_GROUP_NAMES[level];
}

/** Maps level to its branded group display name (age group ignored — mapping is by color). */
export function getGroupName(level: SwimLevel, _ageGroup?: AgeGroup): string {
  return LEVEL_GROUP_NAMES[level];
}

/** Maps level to its dive status based on age group */
export function getDiveStatus(level: SwimLevel, ageGroup: AgeGroup): string {
  if (ageGroup === "preschool-3-5") {
    if (level === "white") return "Beginner";
    if (level === "red") return "Foundations";
  }
  if (level === "yellow") return "Beginner";
  if (level === "blue") return "Intermediate";
  return "Advanced";
}

/** Returns a user-friendly level label based on age group */
export function getLevelLabel(level: SwimLevel, ageGroup: AgeGroup): string {
  if (ageGroup === "preschool-3-5") {
    return level === "white" ? "Preschool 1" : "Preschool 2";
  }
  if (level === "yellow") return "School Age 1";
  if (level === "blue") return "School Age 2";
  return "School Age 3";
}

export const LEVEL_BADGE_COLORS: Record<SwimLevel, { bg: string; ring: string; text: string }> = {
  white: { bg: "bg-gray-50", ring: "ring-gray-300", text: "text-gray-600" },
  red: { bg: "bg-red-50", ring: "ring-red-300", text: "text-red-600" },
  yellow: { bg: "bg-yellow-50", ring: "ring-yellow-300", text: "text-yellow-600" },
  blue: { bg: "bg-blue-50", ring: "ring-blue-300", text: "text-blue-600" },
  green: { bg: "bg-green-50", ring: "ring-green-300", text: "text-green-600" },
};

export const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  "preschool-3-5": "Preschool (Ages 3–5)",
  "school-age-6-12": "School-Age (Ages 6–12)",
};

export function getAgeGroup(age: number): AgeGroup {
  if (age <= 5) return "preschool-3-5";
  return "school-age-6-12";
}

export interface AssessmentAnswers {
  age: number;
  canSubmerge: boolean;
  canFloat: boolean;
  canTreadWater: boolean;
  canSideRollSide: boolean;
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

export const PRICING = {
  group: 30,
  semiPrivate: 45,
  private: 65,
  registrationFee: 45,
} as const;

export type StaffRole = "instructor" | "supervisor" | "admin";

export interface StaffSession {
  instructorId: string;
  instructorName: string;
  role: StaffRole;
}

export interface StaffInstructorForDate {
  instructor_id: string;
  instructor_name: string;
  lesson_count: number;
  first_lesson: string | null;
}

export interface StaffPinStatusRow {
  instructor_id: string;
  instructor_name: string;
  has_pin: boolean;
  role: string;
  locked: boolean;
}

export interface StaffScheduleRow {
  occurrence_id: string;
  swimmer_id: string | null;
  swimmer_first: string | null;
  swimmer_last: string | null;
  start_time: string;
  end_time: string | null;
  plan_key: string;
  status: string;
  cancel_reason: string | null;
  current_level: string | null;
  has_medical: boolean;
  needs_review: boolean;
}

export type SkillState = "not_started" | "emerging" | "met";

export type SkillKind = "safety_benchmark" | "skill_step" | "swim_benchmark";

export interface SkillDefinition {
  id: string;
  swim_level: string;
  position: number;
  kind: SkillKind;
  name: string;
  success_goal: string | null;
}

export interface StaffSwimmerHeaderRow {
  swimmer_id: string;
  first_name: string | null;
  last_name: string | null;
  dob: string | null;
  current_level: string | null;
  plan_keys: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  has_medical: boolean;
  medical_notes: string | null;
  /** Mastered count for the swimmer's CURRENT level only. */
  mastered: number;
}

export interface StaffSkillStateRow {
  skill_id: string;
  swim_level: string;
  state: SkillState;
  met_at: string | null;
  met_by_instructor_id: string | null;
  met_by_first_name: string | null;
  updated_at: string | null;
}

export interface StaffNoteRow {
  note_id: string;
  audience: string;
  body: string;
  swim_level: string | null;
  instructor_id: string | null;
  instructor_first_name: string | null;
  created_at: string;
}

export const PLAN_LABELS: Record<string, string> = {
  private: "Private",
  kid_group: "Small Group",
  adult_group: "Adult Swim",
};

export const SKILL_KIND_LABELS: Record<SkillKind, string> = {
  safety_benchmark: "Safety Benchmark",
  skill_step: "Skill Step",
  swim_benchmark: "Swim Benchmark",
};

export const SKILL_STATE_LABELS: Record<SkillState, string> = {
  not_started: "Not started",
  emerging: "Emerging",
  met: "Mastered",
};

/** Hard cap on the parent-facing note. */
export const PARENT_NOTE_MAX = 300;

/** True when the error looks like the "not authorized" raise from a staff_* RPC. */
export const isNotAuthorized = (message: string | undefined | null): boolean =>
  !!message && /not authorized/i.test(message);


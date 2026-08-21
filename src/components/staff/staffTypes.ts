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

export const PLAN_LABELS: Record<string, string> = {
  private: "Private",
  kid_group: "Small Group",
  adult_group: "Adult Swim",
};

/** True when the error looks like the "not authorized" raise from a staff_* RPC. */
export const isNotAuthorized = (message: string | undefined | null): boolean =>
  !!message && /not authorized/i.test(message);

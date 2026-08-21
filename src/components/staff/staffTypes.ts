export type StaffRole = "instructor" | "supervisor" | "admin";

export interface StaffSession {
  instructorId: string;
  instructorName: string;
  role: StaffRole;
}

export const isSupervisor = (role: StaffRole): boolean =>
  role === "supervisor" || role === "admin";

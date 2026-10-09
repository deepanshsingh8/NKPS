/**
 * Which `students` column holds each contact's number.
 *
 * Shared by click-to-call and WhatsApp messaging so the two can never
 * disagree about whose number "father" means. Both let the client name only
 * the RELATION, never a number, which is what keeps the school's accounts from
 * being used to reach an arbitrary phone.
 */
export type StudentContactType = "student" | "father" | "mother" | "guardian";

export const STUDENT_CONTACT_COLUMN: Record<StudentContactType, string> = {
  student: "phone",
  father: "father_mobile",
  mother: "mother_mobile",
  guardian: "guardian_mobile",
};

export function isStudentContactType(value: unknown): value is StudentContactType {
  return (
    value === "student" || value === "father" || value === "mother" || value === "guardian"
  );
}

export type UserRole = "teacher" | "student";

export interface ExamSummary {
  id: string;
  title: string;
  subject: string;
  totalMarks: number;
  status: "draft" | "active" | "complete";
}

export interface CriterionResult {
  criterionId: string;
  status: "satisfied" | "partially_satisfied" | "missing" | "incorrect" | "uncertain";
  awardedMarks: number;
  maxMarks: number;
  evidence: string;
  explanation: string;
  confidence: number;
}

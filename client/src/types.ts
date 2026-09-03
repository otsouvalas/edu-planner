export interface AppSettings {
  /** Effective model: DB setting > ANTHROPIC_MODEL env var > built-in default. */
  model: string;
  defaultModel: string;
}

export interface School {
  id: number;
  name: string;
  classes: SchoolClass[];
}

export interface SchoolClass {
  id: number;
  schoolId: number;
  name: string;
  gradeLevel: string | null;
}

export interface CurriculumItem {
  id: number;
  schoolClassId: number;
  title: string;
  description: string | null;
  estimatedHours: number | null;
  position: number;
  scheduled?: boolean;
  covered?: boolean;
}

export interface WeeklyPlanItem {
  id: number;
  weeklyPlanId: number;
  curriculumItemId: number;
  done: boolean;
  notes: string | null;
  title: string;
  description: string | null;
  estimatedHours: number | null;
}

export interface WeeklyPlan {
  id: number;
  schoolClassId: number;
  weekStartDate: string;
  hoursPerWeek: number;
  status: "draft" | "active" | "closed" | string;
  items: WeeklyPlanItem[];
}

export interface ChatMessage {
  id: number;
  schoolClassId: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface ReviewDiffEntry {
  curriculumItemId: number;
  title: string;
}

export interface ReviewResult {
  applied: boolean;
  rationale: string;
  summary: string;
  nextWeekPlanId: number;
  proposedCurriculumItemIds: number[];
  diff: {
    carriedOver: ReviewDiffEntry[];
    added: ReviewDiffEntry[];
    removed: ReviewDiffEntry[];
  };
  plan: WeeklyPlan | null;
}

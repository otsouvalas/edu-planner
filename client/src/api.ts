import type {
  AppSettings,
  ChatMessage,
  CurriculumImportResult,
  CurriculumItem,
  CurriculumTemplate,
  ReviewResult,
  School,
  SchoolClass,
  WeeklyPlan,
} from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const jsonBody = init?.body && !(init.body instanceof FormData);
  const response = await fetch(`/api${path}`, {
    headers: jsonBody ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.error ?? `Σφάλμα ${response.status}`,
    );
  }
  return payload as T;
}

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });

export const api = {
  health: () => request<{ ok: boolean; aiEnabled: boolean; model: string }>("/health"),

  // settings
  getSettings: () => request<AppSettings>("/settings"),
  updateModel: (model: string) =>
    request<AppSettings>("/settings", { method: "PUT", ...json({ model }) }),

  // schools & classes
  listSchools: () => request<School[]>("/schools"),
  createSchool: (name: string) =>
    request<School>("/schools", { method: "POST", ...json({ name }) }),
  deleteSchool: (id: number) => request<void>(`/schools/${id}`, { method: "DELETE" }),

  createClass: (schoolId: number, name: string, gradeLevel: string) =>
    request<SchoolClass>("/classes", {
      method: "POST",
      ...json({ schoolId, name, gradeLevel }),
    }),
  deleteClass: (id: number) => request<void>(`/classes/${id}`, { method: "DELETE" }),

  // curriculum
  listCurriculum: (classId: number) =>
    request<CurriculumItem[]>(`/classes/${classId}/curriculum`),
  createCurriculumItem: (
    classId: number,
    body: { title: string; description?: string; estimatedHours?: number | null },
  ) =>
    request<CurriculumItem>(`/classes/${classId}/curriculum`, {
      method: "POST",
      ...json(body),
    }),
  updateCurriculumItem: (id: number, body: Partial<CurriculumItem>) =>
    request<CurriculumItem>(`/curriculum/${id}`, { method: "PATCH", ...json(body) }),
  deleteCurriculumItem: (id: number) =>
    request<void>(`/curriculum/${id}`, { method: "DELETE" }),

  // curriculum bank
  listCurriculumTemplates: () => request<CurriculumTemplate[]>("/curriculum-templates"),
  importCurriculumPdf: (classId: number, file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<CurriculumImportResult>(`/classes/${classId}/curriculum/import-pdf`, {
      method: "POST",
      body,
    });
  },
  importCurriculumTemplate: (classId: number, templateId: number) =>
    request<CurriculumImportResult>(`/classes/${classId}/curriculum/import-template`, {
      method: "POST",
      ...json({ templateId }),
    }),

  // plans
  weeks: () => request<{ current: string; next: string }>("/weeks"),
  getPlan: (classId: number, week: "current" | "next" | string) =>
    request<WeeklyPlan | null>(`/classes/${classId}/plan?week=${week}`),
  createPlan: (classId: number, week: string, hoursPerWeek?: number) =>
    request<WeeklyPlan>(`/classes/${classId}/plan`, {
      method: "POST",
      ...json({ week, hoursPerWeek }),
    }),
  updatePlan: (planId: number, body: { hoursPerWeek?: number; status?: string }) =>
    request<WeeklyPlan>(`/plans/${planId}`, { method: "PATCH", ...json(body) }),
  setPlanItems: (planId: number, curriculumItemIds: number[]) =>
    request<WeeklyPlan>(`/plans/${planId}/items`, {
      method: "PUT",
      ...json({ curriculumItemIds }),
    }),
  addPlanItem: (planId: number, curriculumItemId: number) =>
    request<unknown>(`/plans/${planId}/items`, {
      method: "POST",
      ...json({ curriculumItemId }),
    }),
  togglePlanItem: (itemId: number, done: boolean) =>
    request<unknown>(`/plan-items/${itemId}`, { method: "PATCH", ...json({ done }) }),
  deletePlanItem: (itemId: number) =>
    request<void>(`/plan-items/${itemId}`, { method: "DELETE" }),

  // AI
  generatePlan: (classId: number, week: "current" | "next" | string = "next") =>
    request<{ plan: WeeklyPlan | null; rationale: string }>(
      `/classes/${classId}/generate-plan`,
      { method: "POST", ...json({ week }) },
    ),
  reviewWeek: (classId: number, apply = false) =>
    request<ReviewResult>(`/classes/${classId}/review-week`, {
      method: "POST",
      ...json({ apply }),
    }),
  listChat: (classId: number) => request<ChatMessage[]>(`/classes/${classId}/chat`),
  sendChat: (classId: number, message: string) =>
    request<{ message: ChatMessage; actions: string[] }>(`/classes/${classId}/chat`, {
      method: "POST",
      ...json({ message }),
    }),
};

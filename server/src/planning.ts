import { prisma } from "./db.js";
import { toIsoDate, weekStart } from "./weeks.js";

/**
 * Everything the AI (and the review logic) needs to know about one class:
 * its syllabus, how much of it is already covered, and the state of the
 * current / next week's plan.
 */

export interface CurriculumSnapshot {
  id: number;
  title: string;
  description: string | null;
  estimatedHours: number | null;
  /** Scheduled at least once in some weekly plan. */
  scheduled: boolean;
  /** Marked done in at least one weekly plan item. */
  covered: boolean;
}

export interface PlanItemSnapshot {
  curriculumItemId: number;
  title: string;
  done: boolean;
  notes: string | null;
}

export interface ClassContext {
  classId: number;
  className: string;
  gradeLevel: string | null;
  schoolName: string;
  hoursPerWeek: number;
  curriculum: CurriculumSnapshot[];
  currentWeek: { weekStartDate: string; items: PlanItemSnapshot[] } | null;
  nextWeek: { weekStartDate: string; items: PlanItemSnapshot[] } | null;
}

const planInclude = {
  items: { include: { curriculumItem: true }, orderBy: { id: "asc" } },
} as const;

/** Default weekly hours for a new plan: reuse the class's most recent plan. */
export async function defaultHoursPerWeek(schoolClassId: number): Promise<number> {
  const latest = await prisma.weeklyPlan.findFirst({
    where: { schoolClassId },
    orderBy: { weekStartDate: "desc" },
  });
  return latest?.hoursPerWeek ?? 2;
}

export async function getOrCreatePlan(
  schoolClassId: number,
  week: Date,
  hoursPerWeek?: number,
) {
  const existing = await prisma.weeklyPlan.findUnique({
    where: { schoolClassId_weekStartDate: { schoolClassId, weekStartDate: week } },
    include: planInclude,
  });
  if (existing) {
    if (hoursPerWeek !== undefined && hoursPerWeek !== existing.hoursPerWeek) {
      return prisma.weeklyPlan.update({
        where: { id: existing.id },
        data: { hoursPerWeek },
        include: planInclude,
      });
    }
    return existing;
  }
  return prisma.weeklyPlan.create({
    data: {
      schoolClassId,
      weekStartDate: week,
      hoursPerWeek: hoursPerWeek ?? (await defaultHoursPerWeek(schoolClassId)),
    },
    include: planInclude,
  });
}

export async function findPlan(schoolClassId: number, week: Date) {
  return prisma.weeklyPlan.findUnique({
    where: { schoolClassId_weekStartDate: { schoolClassId, weekStartDate: week } },
    include: planInclude,
  });
}

function snapshotPlan(
  plan: { weekStartDate: Date; items: { curriculumItemId: number; done: boolean; notes: string | null; curriculumItem: { title: string } }[] } | null,
) {
  if (!plan) return null;
  return {
    weekStartDate: toIsoDate(plan.weekStartDate),
    items: plan.items.map((item) => ({
      curriculumItemId: item.curriculumItemId,
      title: item.curriculumItem.title,
      done: item.done,
      notes: item.notes,
    })),
  };
}

export async function buildClassContext(
  schoolClassId: number,
  currentWeek: Date,
  nextWeek: Date,
): Promise<ClassContext | null> {
  const schoolClass = await prisma.schoolClass.findUnique({
    where: { id: schoolClassId },
    include: {
      school: true,
      curriculumItems: {
        orderBy: [{ position: "asc" }, { id: "asc" }],
        include: { planItems: true },
      },
    },
  });
  if (!schoolClass) return null;

  const [current, next] = await Promise.all([
    findPlan(schoolClassId, currentWeek),
    findPlan(schoolClassId, nextWeek),
  ]);

  return {
    classId: schoolClass.id,
    className: schoolClass.name,
    gradeLevel: schoolClass.gradeLevel,
    schoolName: schoolClass.school.name,
    hoursPerWeek:
      current?.hoursPerWeek ??
      next?.hoursPerWeek ??
      (await defaultHoursPerWeek(schoolClassId)),
    curriculum: schoolClass.curriculumItems.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      estimatedHours: item.estimatedHours,
      scheduled: item.planItems.length > 0,
      covered: item.planItems.some((planItem) => planItem.done),
    })),
    currentWeek: snapshotPlan(current),
    nextWeek: snapshotPlan(next),
  };
}

/** Replace a plan's items with exactly the given curriculum item ids. */
export async function setPlanItems(
  weeklyPlanId: number,
  curriculumItemIds: number[],
  schoolClassId: number,
) {
  const valid = await prisma.curriculumItem.findMany({
    where: { schoolClassId, id: { in: curriculumItemIds } },
    select: { id: true },
  });
  const validIds = new Set(valid.map((v) => v.id));
  const keep = curriculumItemIds.filter((id) => validIds.has(id));

  await prisma.$transaction([
    prisma.weeklyPlanItem.deleteMany({
      where: { weeklyPlanId, curriculumItemId: { notIn: keep.length ? keep : [-1] } },
    }),
    ...keep.map((curriculumItemId) =>
      prisma.weeklyPlanItem.upsert({
        where: { weeklyPlanId_curriculumItemId: { weeklyPlanId, curriculumItemId } },
        create: { weeklyPlanId, curriculumItemId },
        update: {},
      }),
    ),
  ]);

  return prisma.weeklyPlan.findUnique({ where: { id: weeklyPlanId }, include: planInclude });
}

export { planInclude, weekStart };

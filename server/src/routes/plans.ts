import { Router } from "express";
import { prisma } from "../db.js";
import {
  HttpError,
  asyncHandler,
  intParam,
  optionalNumber,
  optionalString,
} from "../http.js";
import { findPlan, getOrCreatePlan, planInclude, setPlanItems } from "../planning.js";
import { currentWeekStart, nextWeekStart, parseWeekParam, toIsoDate } from "../weeks.js";

export const planRouter = Router();

const VALID_STATUS = new Set(["draft", "active", "closed"]);

type PlanWithItems = NonNullable<Awaited<ReturnType<typeof findPlan>>>;

export function serializePlan(plan: PlanWithItems) {
  return {
    id: plan.id,
    schoolClassId: plan.schoolClassId,
    weekStartDate: toIsoDate(plan.weekStartDate),
    hoursPerWeek: plan.hoursPerWeek,
    status: plan.status,
    items: plan.items.map((item) => ({
      id: item.id,
      weeklyPlanId: item.weeklyPlanId,
      curriculumItemId: item.curriculumItemId,
      done: item.done,
      notes: item.notes,
      title: item.curriculumItem.title,
      description: item.curriculumItem.description,
      estimatedHours: item.curriculumItem.estimatedHours,
    })),
  };
}

function weekFromQuery(raw: unknown, fallback: Date): Date {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const parsed = parseWeekParam(raw);
  if (!parsed) throw new HttpError(400, "Μη έγκυρη εβδομάδα.");
  return parsed;
}

/** Weekly plan for a class + week. `week` accepts current | next | YYYY-MM-DD. */
planRouter.get(
  "/classes/:id/plan",
  asyncHandler(async (req, res) => {
    const schoolClassId = intParam(req.params.id, "id");
    const week = weekFromQuery(req.query.week, currentWeekStart());
    const plan = await findPlan(schoolClassId, week);
    res.json(plan ? serializePlan(plan) : null);
  }),
);

planRouter.get(
  "/classes/:id/plans",
  asyncHandler(async (req, res) => {
    const plans = await prisma.weeklyPlan.findMany({
      where: { schoolClassId: intParam(req.params.id, "id") },
      orderBy: { weekStartDate: "desc" },
      include: planInclude,
    });
    res.json(plans.map(serializePlan));
  }),
);

/** Create (or fetch) the plan for a class + week. */
planRouter.post(
  "/classes/:id/plan",
  asyncHandler(async (req, res) => {
    const schoolClassId = intParam(req.params.id, "id");
    const schoolClass = await prisma.schoolClass.findUnique({
      where: { id: schoolClassId },
    });
    if (!schoolClass) throw new HttpError(404, "Το τμήμα δεν βρέθηκε.");
    const week = weekFromQuery(req.body?.week, currentWeekStart());
    const hours = optionalNumber(req.body?.hoursPerWeek, "hoursPerWeek");
    const plan = await getOrCreatePlan(schoolClassId, week, hours ?? undefined);
    res.status(201).json(serializePlan(plan));
  }),
);

planRouter.patch(
  "/plans/:id",
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    if (body.status !== undefined && !VALID_STATUS.has(String(body.status))) {
      throw new HttpError(400, "Μη έγκυρη κατάσταση προγράμματος.");
    }
    const plan = await prisma.weeklyPlan.update({
      where: { id: intParam(req.params.id, "id") },
      data: {
        ...(body.hoursPerWeek !== undefined
          ? { hoursPerWeek: optionalNumber(body.hoursPerWeek, "hoursPerWeek") ?? 0 }
          : {}),
        ...(body.status !== undefined ? { status: String(body.status) } : {}),
      },
      include: planInclude,
    });
    res.json(serializePlan(plan));
  }),
);

planRouter.delete(
  "/plans/:id",
  asyncHandler(async (req, res) => {
    await prisma.weeklyPlan.delete({ where: { id: intParam(req.params.id, "id") } });
    res.status(204).end();
  }),
);

/** Replace the whole item list of a plan. */
planRouter.put(
  "/plans/:id/items",
  asyncHandler(async (req, res) => {
    const planId = intParam(req.params.id, "id");
    const plan = await prisma.weeklyPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new HttpError(404, "Το πρόγραμμα δεν βρέθηκε.");
    const raw = req.body?.curriculumItemIds;
    if (!Array.isArray(raw)) {
      throw new HttpError(400, "Το πεδίο curriculumItemIds πρέπει να είναι πίνακας.");
    }
    const ids = raw.map((value, index) => intParam(value, `curriculumItemIds[${index}]`));
    const updated = await setPlanItems(planId, ids, plan.schoolClassId);
    res.json(updated ? serializePlan(updated) : null);
  }),
);

planRouter.post(
  "/plans/:id/items",
  asyncHandler(async (req, res) => {
    const planId = intParam(req.params.id, "id");
    const plan = await prisma.weeklyPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new HttpError(404, "Το πρόγραμμα δεν βρέθηκε.");
    const curriculumItemId = intParam(req.body?.curriculumItemId, "curriculumItemId");
    const curriculumItem = await prisma.curriculumItem.findUnique({
      where: { id: curriculumItemId },
    });
    if (!curriculumItem || curriculumItem.schoolClassId !== plan.schoolClassId) {
      throw new HttpError(400, "Η ενότητα ύλης δεν ανήκει σε αυτό το τμήμα.");
    }
    const item = await prisma.weeklyPlanItem.upsert({
      where: { weeklyPlanId_curriculumItemId: { weeklyPlanId: planId, curriculumItemId } },
      create: {
        weeklyPlanId: planId,
        curriculumItemId,
        notes: optionalString(req.body?.notes),
      },
      update: { notes: optionalString(req.body?.notes) },
    });
    res.status(201).json(item);
  }),
);

/** Toggle `done` (and/or edit notes) on a single checklist entry. */
planRouter.patch(
  "/plan-items/:id",
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const item = await prisma.weeklyPlanItem.update({
      where: { id: intParam(req.params.id, "id") },
      data: {
        ...(body.done !== undefined ? { done: Boolean(body.done) } : {}),
        ...(body.notes !== undefined ? { notes: optionalString(body.notes) } : {}),
      },
    });
    res.json(item);
  }),
);

planRouter.delete(
  "/plan-items/:id",
  asyncHandler(async (req, res) => {
    await prisma.weeklyPlanItem.delete({
      where: { id: intParam(req.params.id, "id") },
    });
    res.status(204).end();
  }),
);

/** Convenience: which weeks "current" and "next" resolve to on the server. */
planRouter.get("/weeks", (_req, res) => {
  res.json({
    current: toIsoDate(currentWeekStart()),
    next: toIsoDate(nextWeekStart()),
  });
});

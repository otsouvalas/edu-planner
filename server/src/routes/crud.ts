import { Router } from "express";
import { prisma } from "../db.js";
import {
  HttpError,
  asyncHandler,
  intParam,
  optionalNumber,
  optionalString,
  requiredString,
} from "../http.js";

export const crudRouter = Router();

/** Appends items to a class's curriculum, continuing the existing position order. */
export async function insertCurriculumItems(
  schoolClassId: number,
  items: { title: string; description?: string; estimatedHours?: number }[],
) {
  const last = await prisma.curriculumItem.findFirst({
    where: { schoolClassId },
    orderBy: { position: "desc" },
  });
  let position = (last?.position ?? 0) + 1;
  const created = [];
  for (const item of items) {
    created.push(
      await prisma.curriculumItem.create({
        data: {
          schoolClassId,
          title: item.title,
          description: item.description ?? null,
          estimatedHours: item.estimatedHours ?? null,
          position: position++,
        },
      }),
    );
  }
  return created;
}

// -------------------------------------------------------- curriculum bank ---

crudRouter.get(
  "/curriculum-templates",
  asyncHandler(async (_req, res) => {
    const templates = await prisma.curriculumTemplate.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { items: true } } },
    });
    res.json(
      templates.map((t) => ({
        id: t.id,
        name: t.name,
        itemCount: t._count.items,
        createdAt: t.createdAt,
      })),
    );
  }),
);

crudRouter.post(
  "/classes/:id/curriculum/import-template",
  asyncHandler(async (req, res) => {
    const schoolClassId = intParam(req.params.id, "id");
    const schoolClass = await prisma.schoolClass.findUnique({ where: { id: schoolClassId } });
    if (!schoolClass) throw new HttpError(404, "Το τμήμα δεν βρέθηκε.");
    const templateId = intParam(req.body?.templateId, "templateId");
    const template = await prisma.curriculumTemplate.findUnique({
      where: { id: templateId },
      include: { items: { orderBy: { position: "asc" } } },
    });
    if (!template) throw new HttpError(404, "Η τράπεζα ύλης δεν βρέθηκε.");

    const added = await insertCurriculumItems(
      schoolClassId,
      template.items.map((item) => ({
        title: item.title,
        description: item.description ?? undefined,
        estimatedHours: item.estimatedHours ?? undefined,
      })),
    );
    res.json({ templateId: template.id, templateName: template.name, added });
  }),
);

// --------------------------------------------------------------- schools ---

crudRouter.get(
  "/schools",
  asyncHandler(async (_req, res) => {
    const schools = await prisma.school.findMany({
      orderBy: { name: "asc" },
      include: { classes: { orderBy: { name: "asc" } } },
    });
    res.json(schools);
  }),
);

crudRouter.post(
  "/schools",
  asyncHandler(async (req, res) => {
    const school = await prisma.school.create({
      data: { name: requiredString(req.body?.name, "name") },
    });
    res.status(201).json(school);
  }),
);

crudRouter.patch(
  "/schools/:id",
  asyncHandler(async (req, res) => {
    const school = await prisma.school.update({
      where: { id: intParam(req.params.id, "id") },
      data: { name: requiredString(req.body?.name, "name") },
    });
    res.json(school);
  }),
);

crudRouter.delete(
  "/schools/:id",
  asyncHandler(async (req, res) => {
    await prisma.school.delete({ where: { id: intParam(req.params.id, "id") } });
    res.status(204).end();
  }),
);

// --------------------------------------------------------------- classes ---

crudRouter.get(
  "/classes",
  asyncHandler(async (req, res) => {
    const schoolId = req.query.schoolId;
    const classes = await prisma.schoolClass.findMany({
      where: schoolId ? { schoolId: intParam(schoolId, "schoolId") } : undefined,
      orderBy: { name: "asc" },
      include: { school: true },
    });
    res.json(classes);
  }),
);

crudRouter.get(
  "/classes/:id",
  asyncHandler(async (req, res) => {
    const schoolClass = await prisma.schoolClass.findUnique({
      where: { id: intParam(req.params.id, "id") },
      include: { school: true },
    });
    if (!schoolClass) throw new HttpError(404, "Το τμήμα δεν βρέθηκε.");
    res.json(schoolClass);
  }),
);

crudRouter.post(
  "/classes",
  asyncHandler(async (req, res) => {
    const schoolId = intParam(req.body?.schoolId, "schoolId");
    const school = await prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) throw new HttpError(404, "Το σχολείο δεν βρέθηκε.");
    const created = await prisma.schoolClass.create({
      data: {
        schoolId,
        name: requiredString(req.body?.name, "name"),
        gradeLevel: optionalString(req.body?.gradeLevel),
      },
    });
    res.status(201).json(created);
  }),
);

crudRouter.patch(
  "/classes/:id",
  asyncHandler(async (req, res) => {
    const updated = await prisma.schoolClass.update({
      where: { id: intParam(req.params.id, "id") },
      data: {
        ...(req.body?.name !== undefined
          ? { name: requiredString(req.body.name, "name") }
          : {}),
        ...(req.body?.gradeLevel !== undefined
          ? { gradeLevel: optionalString(req.body.gradeLevel) }
          : {}),
      },
    });
    res.json(updated);
  }),
);

crudRouter.delete(
  "/classes/:id",
  asyncHandler(async (req, res) => {
    await prisma.schoolClass.delete({
      where: { id: intParam(req.params.id, "id") },
    });
    res.status(204).end();
  }),
);

// ------------------------------------------------------------ curriculum ---

crudRouter.get(
  "/classes/:id/curriculum",
  asyncHandler(async (req, res) => {
    const items = await prisma.curriculumItem.findMany({
      where: { schoolClassId: intParam(req.params.id, "id") },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      include: { planItems: { select: { done: true } } },
    });
    res.json(
      items.map(({ planItems, ...item }) => ({
        ...item,
        scheduled: planItems.length > 0,
        covered: planItems.some((planItem) => planItem.done),
      })),
    );
  }),
);

crudRouter.post(
  "/classes/:id/curriculum",
  asyncHandler(async (req, res) => {
    const schoolClassId = intParam(req.params.id, "id");
    const schoolClass = await prisma.schoolClass.findUnique({
      where: { id: schoolClassId },
    });
    if (!schoolClass) throw new HttpError(404, "Το τμήμα δεν βρέθηκε.");
    const last = await prisma.curriculumItem.findFirst({
      where: { schoolClassId },
      orderBy: { position: "desc" },
    });
    const created = await prisma.curriculumItem.create({
      data: {
        schoolClassId,
        title: requiredString(req.body?.title, "title"),
        description: optionalString(req.body?.description),
        estimatedHours: optionalNumber(req.body?.estimatedHours, "estimatedHours"),
        position: (last?.position ?? 0) + 1,
      },
    });
    res.status(201).json(created);
  }),
);

crudRouter.patch(
  "/curriculum/:id",
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const updated = await prisma.curriculumItem.update({
      where: { id: intParam(req.params.id, "id") },
      data: {
        ...(body.title !== undefined ? { title: requiredString(body.title, "title") } : {}),
        ...(body.description !== undefined
          ? { description: optionalString(body.description) }
          : {}),
        ...(body.estimatedHours !== undefined
          ? { estimatedHours: optionalNumber(body.estimatedHours, "estimatedHours") }
          : {}),
        ...(body.position !== undefined
          ? { position: intParam(body.position, "position") }
          : {}),
      },
    });
    res.json(updated);
  }),
);

crudRouter.delete(
  "/curriculum/:id",
  asyncHandler(async (req, res) => {
    await prisma.curriculumItem.delete({
      where: { id: intParam(req.params.id, "id") },
    });
    res.status(204).end();
  }),
);

import { Router } from "express";
import { prisma } from "../db.js";
import {
  ClaudeNotConfiguredError,
  isClaudeConfigured,
  proposeWeekPlan,
  proposeWeekRevision,
  runClassChat,
  type ChatToolResult,
} from "../claude.js";
import { HttpError, asyncHandler, intParam, requiredString } from "../http.js";
import { buildClassContext, findPlan, getOrCreatePlan, setPlanItems } from "../planning.js";
import { currentWeekStart, nextWeekStart, parseWeekParam, toIsoDate } from "../weeks.js";
import { serializePlan } from "./plans.js";

export const aiRouter = Router();

/** All AI endpoints refuse early (503) when no API key is configured. */
aiRouter.use((_req, _res, next) => {
  if (!isClaudeConfigured()) {
    next(
      new HttpError(
        503,
        "Λείπει το ANTHROPIC_API_KEY. Ορίστε το στο server/.env για να ενεργοποιηθούν οι λειτουργίες AI.",
      ),
    );
    return;
  }
  next();
});

async function requireClass(id: number) {
  const schoolClass = await prisma.schoolClass.findUnique({ where: { id } });
  if (!schoolClass) throw new HttpError(404, "Το τμήμα δεν βρέθηκε.");
  return schoolClass;
}

// -------------------------------------------------------- generate-plan ---

aiRouter.post(
  "/classes/:id/generate-plan",
  asyncHandler(async (req, res) => {
    const schoolClassId = intParam(req.params.id, "id");
    await requireClass(schoolClassId);

    const target = parseWeekParam(req.body?.week) ?? nextWeekStart();
    const ctx = await buildClassContext(schoolClassId, currentWeekStart(), nextWeekStart());
    if (!ctx) throw new HttpError(404, "Το τμήμα δεν βρέθηκε.");
    if (ctx.curriculum.length === 0) {
      throw new HttpError(400, "Δεν υπάρχει καταχωρημένη ύλη για αυτό το τμήμα.");
    }

    const proposal = await proposeWeekPlan(ctx, toIsoDate(target));
    const plan = await getOrCreatePlan(schoolClassId, target, req.body?.hoursPerWeek);
    const updated = await setPlanItems(plan.id, proposal.curriculumItemIds, schoolClassId);

    const message = `**Πρόγραμμα για την εβδομάδα ${toIsoDate(target)}**\n\n${proposal.rationale}`;
    await prisma.chatMessage.create({
      data: { schoolClassId, role: "assistant", content: message },
    });

    res.json({
      plan: updated ? serializePlan(updated) : null,
      rationale: proposal.rationale,
    });
  }),
);

// ---------------------------------------------------------- review-week ---

aiRouter.post(
  "/classes/:id/review-week",
  asyncHandler(async (req, res) => {
    const schoolClassId = intParam(req.params.id, "id");
    await requireClass(schoolClassId);

    const current = currentWeekStart();
    const next = nextWeekStart();
    const currentPlan = await findPlan(schoolClassId, current);
    if (!currentPlan) {
      throw new HttpError(
        400,
        "Δεν υπάρχει πρόγραμμα για την τρέχουσα εβδομάδα προς αναθεώρηση.",
      );
    }

    const ctx = await buildClassContext(schoolClassId, current, next);
    if (!ctx) throw new HttpError(404, "Το τμήμα δεν βρέθηκε.");

    const carryOver = currentPlan.items.filter((item) => !item.done);
    const proposal = await proposeWeekRevision(
      ctx,
      toIsoDate(next),
      carryOver.map((item) => item.curriculumItemId),
    );

    // Guarantee undone items are carried forward even if the model dropped them.
    const proposedIds = Array.from(
      new Set([
        ...carryOver.map((item) => item.curriculumItemId),
        ...proposal.curriculumItemIds,
      ]),
    );

    const nextPlan = await getOrCreatePlan(schoolClassId, next);
    const before = nextPlan.items.map((item) => item.curriculumItemId);
    const added = proposedIds.filter((id) => !before.includes(id));
    const removed = before.filter((id) => !proposedIds.includes(id));

    const titles = new Map(
      (
        await prisma.curriculumItem.findMany({ where: { schoolClassId } })
      ).map((item) => [item.id, item.title]),
    );

    const apply = req.body?.apply === true;
    const finalPlan = apply
      ? await setPlanItems(nextPlan.id, proposedIds, schoolClassId)
      : nextPlan;

    const summary =
      `**Αναθεώρηση εβδομάδας ${toIsoDate(current)} → ${toIsoDate(next)}**\n\n` +
      `${proposal.rationale}\n\n` +
      `Μεταφέρονται: ${carryOver.map((i) => i.curriculumItem.title).join(", ") || "-"}\n` +
      `Προστίθενται: ${added.map((id) => titles.get(id) ?? id).join(", ") || "-"}\n` +
      `Αφαιρούνται: ${removed.map((id) => titles.get(id) ?? id).join(", ") || "-"}` +
      (apply ? "\n\n(Εφαρμόστηκε.)" : "\n\n(Πρόταση - δεν έχει εφαρμοστεί ακόμα.)");

    await prisma.chatMessage.create({
      data: { schoolClassId, role: "assistant", content: summary },
    });

    res.json({
      applied: apply,
      rationale: proposal.rationale,
      summary,
      nextWeekPlanId: nextPlan.id,
      proposedCurriculumItemIds: proposedIds,
      diff: {
        carriedOver: carryOver.map((item) => ({
          curriculumItemId: item.curriculumItemId,
          title: item.curriculumItem.title,
        })),
        added: added.map((id) => ({ curriculumItemId: id, title: titles.get(id) ?? "" })),
        removed: removed.map((id) => ({ curriculumItemId: id, title: titles.get(id) ?? "" })),
      },
      plan: finalPlan ? serializePlan(finalPlan) : null,
    });
  }),
);

// ------------------------------------------------------------------ chat ---

aiRouter.post(
  "/classes/:id/chat",
  asyncHandler(async (req, res) => {
    const schoolClassId = intParam(req.params.id, "id");
    await requireClass(schoolClassId);
    const userMessage = requiredString(req.body?.message, "message");

    const current = currentWeekStart();
    const next = nextWeekStart();
    const ctx = await buildClassContext(schoolClassId, current, next);
    if (!ctx) throw new HttpError(404, "Το τμήμα δεν βρέθηκε.");

    const history = await prisma.chatMessage.findMany({
      where: { schoolClassId },
      orderBy: { createdAt: "asc" },
      take: 40,
    });

    await prisma.chatMessage.create({
      data: { schoolClassId, role: "user", content: userMessage },
    });

    const titleOf = async (curriculumItemId: number) => {
      const item = await prisma.curriculumItem.findUnique({
        where: { id: curriculumItemId },
      });
      if (!item || item.schoolClassId !== schoolClassId) {
        throw new Error(`Η ενότητα ${curriculumItemId} δεν ανήκει σε αυτό το τμήμα.`);
      }
      return item.title;
    };

    const planFor = async (week: unknown) =>
      getOrCreatePlan(schoolClassId, week === "current" ? current : next);

    const weekLabel = (week: unknown) =>
      week === "current" ? "τρέχουσα εβδομάδα" : "επόμενη εβδομάδα";

    const executeTool = async (name: string, rawInput: unknown): Promise<ChatToolResult> => {
      const input = (rawInput ?? {}) as Record<string, unknown>;
      switch (name) {
        case "add_plan_item": {
          const curriculumItemId = Number(input.curriculum_item_id);
          const title = await titleOf(curriculumItemId);
          const plan = await planFor(input.week);
          await prisma.weeklyPlanItem.upsert({
            where: {
              weeklyPlanId_curriculumItemId: { weeklyPlanId: plan.id, curriculumItemId },
            },
            create: { weeklyPlanId: plan.id, curriculumItemId },
            update: {},
          });
          return {
            summary: `Προστέθηκε «${title}» στην ${weekLabel(input.week)}.`,
            result: "ok",
          };
        }
        case "remove_plan_item": {
          const curriculumItemId = Number(input.curriculum_item_id);
          const title = await titleOf(curriculumItemId);
          const plan = await planFor(input.week);
          await prisma.weeklyPlanItem.deleteMany({
            where: { weeklyPlanId: plan.id, curriculumItemId },
          });
          return {
            summary: `Αφαιρέθηκε «${title}» από την ${weekLabel(input.week)}.`,
            result: "ok",
          };
        }
        case "mark_done": {
          const curriculumItemId = Number(input.curriculum_item_id);
          const done = Boolean(input.done);
          const title = await titleOf(curriculumItemId);
          const plan = await planFor(input.week);
          const result = await prisma.weeklyPlanItem.updateMany({
            where: { weeklyPlanId: plan.id, curriculumItemId },
            data: { done },
          });
          if (result.count === 0) {
            return {
              summary: `Η «${title}» δεν βρέθηκε στην ${weekLabel(input.week)}.`,
              result: "not_found",
              isError: true,
            };
          }
          return {
            summary: `Η «${title}» σημειώθηκε ως ${done ? "ολοκληρωμένη" : "μη ολοκληρωμένη"} (${weekLabel(input.week)}).`,
            result: "ok",
          };
        }
        case "set_next_week_items": {
          const raw = Array.isArray(input.curriculum_item_ids)
            ? input.curriculum_item_ids
            : [];
          const ids = raw.map((value) => Number(value)).filter(Number.isInteger);
          const titles = await Promise.all(ids.map(titleOf));
          const plan = await getOrCreatePlan(schoolClassId, next);
          await setPlanItems(plan.id, ids, schoolClassId);
          return {
            summary: `Το πρόγραμμα της επόμενης εβδομάδας ορίστηκε σε: ${titles.join(", ") || "(κενό)"}.`,
            result: "ok",
          };
        }
        default:
          return {
            summary: `Άγνωστη ενέργεια: ${name}`,
            result: `Unknown tool ${name}`,
            isError: true,
          };
      }
    };

    const turn = await runClassChat({
      ctx,
      history: history.map((message) => ({
        role: message.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: message.content,
      })),
      userMessage,
      executeTool,
    });

    const content =
      turn.actions.length > 0
        ? `${turn.reply}\n\n_Ενέργειες:_\n${turn.actions.map((a) => `- ${a}`).join("\n")}`
        : turn.reply;

    const assistantMessage = await prisma.chatMessage.create({
      data: { schoolClassId, role: "assistant", content },
    });

    res.json({ message: assistantMessage, actions: turn.actions });
  }),
);

/** Chat history is readable without an API key, so it lives outside aiRouter. */
export const chatHistoryRouter = Router();

chatHistoryRouter.get(
  "/classes/:id/chat",
  asyncHandler(async (req, res) => {
    const messages = await prisma.chatMessage.findMany({
      where: { schoolClassId: intParam(req.params.id, "id") },
      orderBy: { createdAt: "asc" },
    });
    res.json(messages);
  }),
);

export { ClaudeNotConfiguredError };

import Anthropic from "@anthropic-ai/sdk";
import type { ClassContext } from "./planning.js";

/**
 * All Claude-facing code lives here so models / prompts / tool schemas can be
 * changed in one place.
 */

export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";
const MAX_TOKENS = 8000;
/** Safety valve for the chat tool-use loop. */
const MAX_TOOL_ITERATIONS = 8;

export class ClaudeNotConfiguredError extends Error {
  constructor() {
    super(
      "Το ANTHROPIC_API_KEY δεν έχει οριστεί. Οι λειτουργίες AI είναι απενεργοποιημένες.",
    );
    this.name = "ClaudeNotConfiguredError";
  }
}

export function isClaudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let cached: Anthropic | null = null;

function client(): Anthropic {
  if (!isClaudeConfigured()) throw new ClaudeNotConfiguredError();
  if (!cached) cached = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return cached;
}

// ---------------------------------------------------------------------------
// Shared prompt material
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Είσαι βοηθός εκπαιδευτικού Πληροφορικής σε ελληνικό Γυμνάσιο/Λύκειο.
Ο χρήστης είναι αναπληρωτής καθηγητής που διδάσκει σε πολλά σχολεία και τμήματα.

Ο ρόλος σου είναι να βοηθάς στον εβδομαδιαίο προγραμματισμό της ύλης ανά τμήμα:
- Επιλέγεις ποιες ενότητες της ύλης πρέπει να διδαχθούν την επόμενη εβδομάδα.
- Σέβεσαι πάντα τις διαθέσιμες ώρες της εβδομάδας για το τμήμα. Μην υπερφορτώνεις.
- Δίνεις προτεραιότητα σε ενότητες που έμειναν ημιτελείς από προηγούμενες εβδομάδες.
- Ακολουθείς τη σειρά της ύλης εκτός αν υπάρχει λόγος να αλλάξει.
- Αν οι εκτιμώμενες ώρες μιας ενότητας λείπουν, υπόθεσε 1 ώρα.

Απαντάς πάντα στα ελληνικά, σύντομα και πρακτικά.`;

function describeContext(ctx: ClassContext): string {
  const lines: string[] = [];
  lines.push(`Σχολείο: ${ctx.schoolName}`);
  lines.push(`Τμήμα: ${ctx.className}${ctx.gradeLevel ? ` (${ctx.gradeLevel})` : ""}`);
  lines.push(`Ώρες διδασκαλίας ανά εβδομάδα: ${ctx.hoursPerWeek}`);
  lines.push("");
  lines.push("ΥΛΗ (id | τίτλος | εκτ. ώρες | κατάσταση):");
  if (ctx.curriculum.length === 0) {
    lines.push("  (κενή)");
  }
  for (const item of ctx.curriculum) {
    const status = item.covered
      ? "ΟΛΟΚΛΗΡΩΜΕΝΗ"
      : item.scheduled
        ? "προγραμματισμένη, όχι ολοκληρωμένη"
        : "δεν έχει προγραμματιστεί";
    lines.push(
      `  ${item.id} | ${item.title} | ${item.estimatedHours ?? "-"} | ${status}` +
        (item.description ? `\n      περιγραφή: ${item.description}` : ""),
    );
  }
  lines.push("");
  lines.push(
    ctx.currentWeek
      ? `ΤΡΕΧΟΥΣΑ ΕΒΔΟΜΑΔΑ (${ctx.currentWeek.weekStartDate}):\n` +
          (ctx.currentWeek.items.length
            ? ctx.currentWeek.items
                .map(
                  (i) =>
                    `  ${i.curriculumItemId} | ${i.title} | ${i.done ? "έγινε" : "ΔΕΝ έγινε"}` +
                    (i.notes ? ` | σημ: ${i.notes}` : ""),
                )
                .join("\n")
            : "  (χωρίς αντικείμενα)")
      : "ΤΡΕΧΟΥΣΑ ΕΒΔΟΜΑΔΑ: δεν υπάρχει πρόγραμμα.",
  );
  lines.push("");
  lines.push(
    ctx.nextWeek
      ? `ΕΠΟΜΕΝΗ ΕΒΔΟΜΑΔΑ (${ctx.nextWeek.weekStartDate}):\n` +
          (ctx.nextWeek.items.length
            ? ctx.nextWeek.items
                .map((i) => `  ${i.curriculumItemId} | ${i.title} | ${i.done ? "έγινε" : "ΔΕΝ έγινε"}`)
                .join("\n")
            : "  (χωρίς αντικείμενα)")
      : "ΕΠΟΜΕΝΗ ΕΒΔΟΜΑΔΑ: δεν υπάρχει πρόγραμμα ακόμα.",
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Plan proposal (generate-plan / review-week)
// ---------------------------------------------------------------------------

export interface PlanProposal {
  curriculumItemIds: number[];
  rationale: string;
}

const proposePlanTool: Anthropic.Tool = {
  name: "propose_week_plan",
  description:
    "Καταθέτει την πρόταση προγράμματος για τη ζητούμενη εβδομάδα. Κάλεσέ το ακριβώς μία φορά.",
  input_schema: {
    type: "object",
    properties: {
      curriculum_item_ids: {
        type: "array",
        items: { type: "integer" },
        description:
          "Τα ids των ενοτήτων ύλης που προγραμματίζονται, με τη σειρά διδασκαλίας.",
      },
      rationale: {
        type: "string",
        description:
          "Σύντομη αιτιολόγηση στα ελληνικά (2-4 προτάσεις): γιατί αυτές οι ενότητες και πώς καλύπτονται οι διαθέσιμες ώρες.",
      },
    },
    required: ["curriculum_item_ids", "rationale"],
    additionalProperties: false,
  },
};

async function requestPlanProposal(prompt: string): Promise<PlanProposal> {
  const response = await client().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    tools: [proposePlanTool],
    tool_choice: { type: "tool", name: "propose_week_plan" },
    messages: [{ role: "user", content: prompt }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error("Το μοντέλο δεν επέστρεψε πρόταση προγράμματος.");
  }
  const input = toolUse.input as {
    curriculum_item_ids?: unknown;
    rationale?: unknown;
  };
  const ids = Array.isArray(input.curriculum_item_ids)
    ? input.curriculum_item_ids
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value))
    : [];
  return {
    curriculumItemIds: ids,
    rationale: typeof input.rationale === "string" ? input.rationale : "",
  };
}

export async function proposeWeekPlan(
  ctx: ClassContext,
  targetWeek: string,
): Promise<PlanProposal> {
  const prompt = `${describeContext(ctx)}

ΖΗΤΟΥΜΕΝΟ: Πρότεινε το πρόγραμμα για την εβδομάδα που ξεκινά ${targetWeek}.
Επίλεξε ενότητες που ΔΕΝ είναι ολοκληρωμένες, με σύνολο εκτιμώμενων ωρών κοντά στις ${ctx.hoursPerWeek} ώρες.
Κάλεσε το εργαλείο propose_week_plan.`;
  return requestPlanProposal(prompt);
}

export async function proposeWeekRevision(
  ctx: ClassContext,
  targetWeek: string,
  carryOverIds: number[],
): Promise<PlanProposal> {
  const carryOverText = carryOverIds.length
    ? carryOverIds.join(", ")
    : "(κανένα)";
  const prompt = `${describeContext(ctx)}

ΖΗΤΟΥΜΕΝΟ: Απολογισμός τρέχουσας εβδομάδας και αναθεώρηση της εβδομάδας που ξεκινά ${targetWeek}.
Ενότητες που έμειναν ανολοκλήρωτες και πρέπει να μεταφερθούν: ${carryOverText}.
Μην στοιβάζεις όλα τα υπόλοιπα μαζί με όλη τη νέα ύλη - σεβάσου τις ${ctx.hoursPerWeek} ώρες της εβδομάδας.
Οι μεταφερόμενες ενότητες έχουν προτεραιότητα. Πρόσθεσε νέα ύλη μόνο αν περισσεύουν ώρες.
Κάλεσε το εργαλείο propose_week_plan με την τελική λίστα για την επόμενη εβδομάδα.`;
  return requestPlanProposal(prompt);
}

// ---------------------------------------------------------------------------
// Chat with plan-mutating tools
// ---------------------------------------------------------------------------

export const chatTools: Anthropic.Tool[] = [
  {
    name: "add_plan_item",
    description:
      "Προσθέτει μια ενότητα ύλης στο πρόγραμμα μιας εβδομάδας του τμήματος.",
    input_schema: {
      type: "object",
      properties: {
        curriculum_item_id: { type: "integer" },
        week: {
          type: "string",
          enum: ["current", "next"],
          description: "Σε ποια εβδομάδα (τρέχουσα ή επόμενη).",
        },
      },
      required: ["curriculum_item_id", "week"],
      additionalProperties: false,
    },
  },
  {
    name: "remove_plan_item",
    description: "Αφαιρεί μια ενότητα ύλης από το πρόγραμμα μιας εβδομάδας.",
    input_schema: {
      type: "object",
      properties: {
        curriculum_item_id: { type: "integer" },
        week: { type: "string", enum: ["current", "next"] },
      },
      required: ["curriculum_item_id", "week"],
      additionalProperties: false,
    },
  },
  {
    name: "mark_done",
    description:
      "Σημειώνει μια ενότητα του προγράμματος ως ολοκληρωμένη ή μη ολοκληρωμένη.",
    input_schema: {
      type: "object",
      properties: {
        curriculum_item_id: { type: "integer" },
        week: { type: "string", enum: ["current", "next"] },
        done: { type: "boolean" },
      },
      required: ["curriculum_item_id", "week", "done"],
      additionalProperties: false,
    },
  },
  {
    name: "set_next_week_items",
    description:
      "Αντικαθιστά ΟΛΟΚΛΗΡΟ το πρόγραμμα της επόμενης εβδομάδας με τη λίστα ενοτήτων που δίνεται.",
    input_schema: {
      type: "object",
      properties: {
        curriculum_item_ids: { type: "array", items: { type: "integer" } },
      },
      required: ["curriculum_item_ids"],
      additionalProperties: false,
    },
  },
];

export interface ChatToolResult {
  /** Human-readable Greek summary stored alongside the assistant message. */
  summary: string;
  /** Text fed back to the model as the tool result. */
  result: string;
  isError?: boolean;
}

export interface ChatTurnResult {
  reply: string;
  actions: string[];
}

export async function runClassChat(options: {
  ctx: ClassContext;
  history: { role: "user" | "assistant"; content: string }[];
  userMessage: string;
  executeTool: (name: string, input: unknown) => Promise<ChatToolResult>;
}): Promise<ChatTurnResult> {
  const { ctx, history, userMessage, executeTool } = options;

  const messages: Anthropic.MessageParam[] = [
    ...history.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    {
      role: "user" as const,
      content: `[ΤΡΕΧΟΥΣΑ ΚΑΤΑΣΤΑΣΗ ΤΜΗΜΑΤΟΣ]\n${describeContext(ctx)}\n\n[ΜΗΝΥΜΑ ΚΑΘΗΓΗΤΗ]\n${userMessage}`,
    },
  ];

  const actions: string[] = [];
  let reply = "";

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
    const response = await client().messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: `${SYSTEM_PROMPT}

Έχεις εργαλεία που τροποποιούν απευθείας το πρόγραμμα. Χρησιμοποίησέ τα όταν ο καθηγητής ζητά αλλαγή,
αντί να περιγράφεις απλώς τι θα έπρεπε να γίνει. Χρησιμοποίησε τα ids της ύλης όπως δίνονται.
Μετά τις αλλαγές, εξήγησε σύντομα τι έκανες.`,
      tools: chatTools,
      messages,
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    if (text) reply = text;

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (toolUses.length === 0) break;

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      let outcome: ChatToolResult;
      try {
        outcome = await executeTool(toolUse.name, toolUse.input);
      } catch (error) {
        outcome = {
          summary: `Αποτυχία ενέργειας ${toolUse.name}`,
          result: error instanceof Error ? error.message : String(error),
          isError: true,
        };
      }
      actions.push(outcome.summary);
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: outcome.result,
        is_error: outcome.isError,
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return { reply: reply || "(κενή απάντηση)", actions };
}

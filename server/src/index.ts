import "dotenv/config";
import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import { HttpError } from "./http.js";
import { crudRouter } from "./routes/crud.js";
import { planRouter } from "./routes/plans.js";
import { aiRouter, chatHistoryRouter } from "./routes/ai.js";
import { settingsRouter } from "./routes/settings.js";
import { ClaudeNotConfiguredError, isClaudeConfigured } from "./claude.js";
import { resolveModel } from "./settings.js";
import { asyncHandler } from "./http.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get(
  "/api/health",
  asyncHandler(async (_req, res) => {
    res.json({ ok: true, aiEnabled: isClaudeConfigured(), model: await resolveModel() });
  }),
);

app.use("/api", settingsRouter);
app.use("/api", crudRouter);
app.use("/api", planRouter);
app.use("/api", chatHistoryRouter);
app.use("/api", aiRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err instanceof ClaudeNotConfiguredError) {
      res.status(503).json({ error: err.message });
      return;
    }
    if (err instanceof Anthropic.APIError) {
      res.status(502).json({ error: `Σφάλμα Claude API: ${err.message}` });
      return;
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        res.status(404).json({ error: "Η εγγραφή δεν βρέθηκε." });
        return;
      }
      if (err.code === "P2002") {
        res.status(409).json({ error: "Η εγγραφή υπάρχει ήδη." });
        return;
      }
    }
    console.error(err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Εσωτερικό σφάλμα διακομιστή.",
    });
  },
);

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`edu-planner API -> http://localhost:${port}`);
  if (!isClaudeConfigured()) {
    console.log("AI ανενεργό: λείπει το ANTHROPIC_API_KEY");
    return;
  }
  void resolveModel().then((model) => console.log(`AI ενεργό (model: ${model})`));
});

import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

/**
 * Single shared username/password gate for the whole app (deployed on the
 * open internet, single user — no need for a real auth system). Disabled
 * automatically when BASIC_AUTH_USER/PASS are not set (e.g. local dev).
 */
function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

const basicAuthUser = process.env.BASIC_AUTH_USER;
const basicAuthPass = process.env.BASIC_AUTH_PASS;

if (basicAuthUser && basicAuthPass) {
  app.use((req, res, next) => {
    const header = req.headers.authorization ?? "";
    const [scheme, encoded] = header.split(" ");
    if (scheme === "Basic" && encoded) {
      const decoded = Buffer.from(encoded, "base64").toString();
      const sep = decoded.indexOf(":");
      const user = sep === -1 ? decoded : decoded.slice(0, sep);
      const pass = sep === -1 ? "" : decoded.slice(sep + 1);
      if (timingSafeEqual(user, basicAuthUser) && timingSafeEqual(pass, basicAuthPass)) {
        next();
        return;
      }
    }
    res.set("WWW-Authenticate", 'Basic realm="edu-planner"');
    res.status(401).send("Authentication required.");
  });
}

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

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Production (Docker): serve the built client from the same process, so one
// container serves both the API and the UI. In dev this directory does not
// exist and Vite serves the client with a proxy to /api, so nothing changes.
const clientDist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../client/dist",
);
const clientIndex = path.join(clientDist, "index.html");

if (fs.existsSync(clientIndex)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(clientIndex);
  });
} else {
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
}

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

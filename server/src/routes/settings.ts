import { Router } from "express";
import { asyncHandler, requiredString } from "../http.js";
import { DEFAULT_MODEL, resolveModel, setModel } from "../settings.js";

export const settingsRouter = Router();

settingsRouter.get(
  "/settings",
  asyncHandler(async (_req, res) => {
    res.json({ model: await resolveModel(), defaultModel: DEFAULT_MODEL });
  }),
);

settingsRouter.put(
  "/settings",
  asyncHandler(async (req, res) => {
    const model = requiredString(req.body?.model, "model");
    await setModel(model);
    res.json({ model: await resolveModel(), defaultModel: DEFAULT_MODEL });
  }),
);

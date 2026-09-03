import { prisma } from "./db.js";

/** Fallback model when neither the DB setting nor ANTHROPIC_MODEL is set. */
export const DEFAULT_MODEL = "claude-sonnet-5";

export const MODEL_SETTING_KEY = "claude.model";

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  const value = row?.value.trim();
  return value ? value : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

/** DB setting > ANTHROPIC_MODEL env var > hardcoded default. */
export async function resolveModel(): Promise<string> {
  const stored = await getSetting(MODEL_SETTING_KEY);
  if (stored) return stored;
  const fromEnv = process.env.ANTHROPIC_MODEL?.trim();
  return fromEnv || DEFAULT_MODEL;
}

export async function setModel(model: string): Promise<string> {
  await setSetting(MODEL_SETTING_KEY, model);
  return model;
}

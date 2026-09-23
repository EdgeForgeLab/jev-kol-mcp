import { readSecret } from "../config.js";
import { isPrimaryNiche, NICHE_QUESTION, type PrimaryNiche } from "./niches.js";
import { JEV_QUESTIONS } from "./questions.js";

const SYSTEMONE_URL = "https://api.typesafe.ai/v1/systemone";
const RETRY_STATUSES = new Set([429, 529]);

export class JevRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JevRequestError";
  }
}

export interface JevScore {
  fit: number;
  niche: number;
  tone: string;
  priceBand: string;
  outreach: number;
  mismatch: string;
  model: string;
}

export async function judgeFit(input: {
  kolHandle: string;
  kolBio: string;
  campaignDescription: string;
}): Promise<JevScore> {
  const apiKey = readSecret("JEV_API_KEY");
  if (!apiKey) {
    throw new JevRequestError("Missing JEV_API_KEY.");
  }

  const model = readModel();
  const payload = await requestSystemOne(apiKey, {
    model,
    state: {
      kolHandle: input.kolHandle,
      kolBio: input.kolBio,
      campaignDescription: input.campaignDescription,
    },
    questions: JEV_QUESTIONS,
  });
  return parseScore(payload, model);
}

export async function classifyPrimaryNiche(input: {
  kolHandle: string;
  displayName: string;
  bio: string;
}): Promise<PrimaryNiche> {
  const apiKey = readSecret("JEV_API_KEY");
  if (!apiKey) {
    throw new JevRequestError("Missing JEV_API_KEY.");
  }
  const payload = await requestSystemOne(apiKey, {
    model: readModel(),
    state: {
      kolHandle: input.kolHandle,
      displayName: input.displayName,
      bio: input.bio,
    },
    questions: NICHE_QUESTION,
  });
  const root = asRecord(payload);
  const choice = stringFrom(asRecord(asRecord(root?.answers)?.primary_niche)?.choice);
  return choice && isPrimaryNiche(choice) ? choice : "Other";
}

async function requestSystemOne(apiKey: string, body: unknown): Promise<unknown> {
  let lastError = "Jev request failed.";

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(SYSTEMONE_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      lastError = `Could not reach Jev: ${redact(errorText(error), apiKey)}`;
      if (attempt < 2) {
        await delay(400 * 2 ** attempt);
        continue;
      }
      throw new JevRequestError(lastError);
    }

    const text = await response.text();
    if (RETRY_STATUSES.has(response.status) && attempt < 2) {
      await delay(400 * 2 ** attempt);
      continue;
    }
    if (response.status === 401) {
      throw new JevRequestError("JEV_API_KEY was rejected. Check the key in .env or mcp.json.");
    }
    if (!response.ok) {
      throw new JevRequestError(
        `Jev judgment failed (HTTP ${response.status}). ${redact(text, apiKey).slice(0, 240)}`,
      );
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new JevRequestError("Jev did not return JSON.");
    }
  }

  throw new JevRequestError(lastError);
}

function readModel(): string {
  return process.env.JEV_MODEL?.trim() || "jev-latest";
}

function parseScore(payload: unknown, fallbackModel: string): JevScore {
  const root = asRecord(payload);
  const answers = asRecord(root?.answers);
  if (!answers) {
    throw new JevRequestError("Jev did not return answers.");
  }
  return {
    fit: numberFrom(asRecord(answers.fit)?.score),
    niche: numberFrom(asRecord(answers.niche)?.noul),
    tone: stringFrom(asRecord(answers.tone)?.choice) ?? "unknown",
    priceBand: stringFrom(asRecord(answers.price_band)?.choice) ?? "unknown",
    outreach: numberFrom(asRecord(answers.outreach)?.noul),
    mismatch: stringFrom(asRecord(answers.mismatch)?.choice) ?? "none",
    model: stringFrom(root?.model) ?? fallbackModel,
  };
}

function numberFrom(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringFrom(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function redact(text: string, secret: string): string {
  return text.split(secret).join("[redacted]");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

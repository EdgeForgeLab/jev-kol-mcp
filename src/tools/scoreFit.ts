import { JevRequestError, judgeFit } from "../jev/client.js";
import {
  MISMATCH_LABELS,
  PRICE_BANDS,
  TONE_LABELS,
} from "../jev/questions.js";
import { missingKeysGuidance } from "../config.js";
import { jsonResult, textResult, type ToolTextResult } from "../result.js";

export interface ScoreFitInput {
  kolHandle: string;
  kolBio: string;
  campaignDescription: string;
}

const FIT_MAX = 3;

export async function scoreFit(input: ScoreFitInput): Promise<ToolTextResult> {
  const guidance = missingKeysGuidance(["JEV_API_KEY"]);
  if (guidance) {
    return textResult(guidance, true);
  }

  try {
    const judged = await judgeFit(input);
    const score = toPercent(judged.fit);
    const tone = TONE_LABELS[judged.tone] ?? TONE_LABELS.unknown;
    const price = PRICE_BANDS[judged.priceBand] ?? null;
    const mismatch = MISMATCH_LABELS[judged.mismatch] ?? judged.mismatch;
    const reason = [
      `Overall fit: ${score} (Jev raw score ${round(judged.fit)} / ${FIT_MAX}). `,
      `Probability the niches match: ${percent(judged.niche)}. `,
      `Tone: ${tone.tone}. ${tone.note} `,
      price
        ? `Fitting price range: USD ${price.min}–${price.max} (${price.category}). `
        : "Price: Jev does not have enough content to judge. ",
      `Probability a first email is worth sending: ${percent(judged.outreach)}. `,
      `Main miss: ${mismatch}.`,
    ].join("");

    return jsonResult({
      kolHandle: input.kolHandle,
      score,
      toneAnalysis: tone,
      suitablePriceRange: price
        ? { currency: "USD", min: price.min, max: price.max, category: price.category }
        : null,
      dimensions: {
        fit: round(judged.fit),
        niche: round(judged.niche),
        tone: judged.tone,
        priceBand: judged.priceBand,
        outreach: round(judged.outreach),
        mismatch: judged.mismatch,
      },
      reason,
      engine: "jev",
      model: judged.model,
    });
  } catch (error) {
    const detail = error instanceof JevRequestError ? error.message : errorText(error);
    return textResult(`Jev did not finish the judgment. The MCP server is still running.\n${detail}`, true);
  }
}

function toPercent(fit: number): number {
  const scaled = fit <= FIT_MAX ? (fit / FIT_MAX) * 100 : fit;
  return Math.round(Math.min(100, Math.max(0, scaled)));
}

function percent(value: number): string {
  return `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

import { missingKeysGuidance } from "../config.js";
import { jsonResult, textResult, type ToolTextResult } from "../result.js";

export interface DraftEmailInput {
  kolHandle: string;
  campaignDescription: string;
  offerDetails: string;
}

function displayHandle(handle: string): string {
  const trimmed = handle.trim();
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

export function draftEmail(input: DraftEmailInput): ToolTextResult {
  const guidance = missingKeysGuidance(["JEV_API_KEY"]);
  if (guidance) {
    return textResult(guidance, true);
  }

  const handle = displayHandle(input.kolHandle);
  const campaign = input.campaignDescription.trim();
  const offer = input.offerDetails.trim();

  const initialBody = [
    `Hi ${handle},`,
    "",
    "I work on brand partnerships. Your recent content is close to how we want this told, so I am writing to you directly rather than from a blast list.",
    "",
    `Campaign: ${campaign}`,
    "",
    `Offer: ${offer}`,
    "",
    "If you are open to it, I can draft a script outline in the shape of your usual videos, and you can cut anything that does not fit your audience. If it is not a fit, just say so. I will not follow up again.",
    "",
    "Looking forward to your reply.",
  ].join("\n");

  const followUpBody = [
    `Hi ${handle},`,
    "",
    "I sent a collaboration note three days ago. In case it was buried, here are the only three points:",
    "",
    `1. The campaign is still: ${campaign}`,
    `2. The offer is unchanged: ${offer}`,
    "3. Timing, script, and whether you appear on camera can follow your usual format.",
    "",
    "If this month does not work, reply \"next time\" and I will take you off this round. If the direction is right, I will send a one-page brief.",
    "",
    "Thank you for reading.",
  ].join("\n");

  return jsonResult({
    kolHandle: handle,
    initialEmail: {
      subject: `Collaboration invite for ${handle}`,
      body: initialBody,
    },
    followUpEmail: {
      sendAfterDays: 3,
      subject: `Following up with ${handle}`,
      body: followUpBody,
    },
    engine: "local-heuristic",
  });
}

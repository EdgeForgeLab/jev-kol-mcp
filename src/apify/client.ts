import { readSecret } from "../config.js";

const APIFY_BASE = "https://api.apify.com/v2/acts";

export class ApifyRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApifyRequestError";
  }
}

export async function runActor(
  actorId: string,
  input: unknown,
  timeoutSecs = 120,
): Promise<unknown[]> {
  const token = readSecret("APIFY_API_TOKEN");
  if (!token) {
    throw new ApifyRequestError("Missing APIFY_API_TOKEN.");
  }

  const url = new URL(`${APIFY_BASE}/${actorId}/run-sync-get-dataset-items`);
  url.searchParams.set("timeout", String(timeoutSecs));
  url.searchParams.set("memory", "512");

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout((timeoutSecs + 15) * 1000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new ApifyRequestError(
        `Apify actor ${actorId} did not return within ${timeoutSecs} seconds. Try the search again.`,
      );
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new ApifyRequestError(`Could not reach Apify: ${redact(detail, token)}`);
  }

  const body = await response.text();
  if (response.status !== 200 && response.status !== 201) {
    throw new ApifyRequestError(explainHttpError(response.status, body, token, actorId));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    throw new ApifyRequestError(`Apify did not return JSON (HTTP ${response.status}).`);
  }

  if (!Array.isArray(parsed)) {
    throw new ApifyRequestError(
      `Apify did not return a dataset. ${redact(body, token).slice(0, 300)}`,
    );
  }

  return parsed;
}

function explainHttpError(
  status: number,
  body: string,
  token: string,
  actorId: string,
): string {
  const detail = redact(extractMessage(body), token);
  if (status === 401 || status === 403) {
    return `Apify rejected APIFY_API_TOKEN (HTTP ${status}). Check the token in .env or .cursor/mcp.json. ${detail}`;
  }
  if (status === 402) {
    return `Apify reported insufficient credit or plan limits (HTTP 402). This search did not finish. ${detail}`;
  }
  return `Apify actor ${actorId} failed (HTTP ${status}). ${detail}`;
}

function extractMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed.error?.message) {
      return parsed.error.message;
    }
  } catch {
    // Non-JSON error page. Keep a short slice of the body.
  }
  return body.slice(0, 300);
}

function redact(text: string, token: string): string {
  return text.split(token).join("[redacted]");
}

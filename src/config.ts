import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

loadEnv({ path: path.join(projectRoot, ".env") });

export type SecretKey = "APIFY_API_TOKEN" | "JEV_API_KEY" | "SAAS_API_KEY";

export interface AppConfig {
  apifyApiToken?: string;
  jevApiKey?: string;
  saasApiKey?: string;
}

const KEY_DETAILS: Record<
  SecretKey,
  { purpose: string; applyHint: string }
> = {
  APIFY_API_TOKEN: {
    purpose: "Fetch TikTok and YouTube micro-KOL profiles",
    applyHint: "Create one at https://console.apify.com/account/integrations",
  },
  JEV_API_KEY: {
    purpose: "Call Jev System One for fit scoring and niche labels",
    applyHint: "Request a key from TypeSafe.",
  },
  SAAS_API_KEY: {
    purpose: "Access the shared profile pool when ENABLE_COMMUNITY_POOL is on",
    applyHint: "Leave empty when sharing is off.",
  },
};

const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

export interface CommunityPoolSettings {
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
}

function readRaw(name: SecretKey): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isPlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (
    normalized.includes("your_") ||
    normalized.endsWith("_here") ||
    normalized.includes("changeme") ||
    normalized.includes("placeholder") ||
    normalized === "xxx" ||
    normalized === "todo"
  ) {
    return true;
  }
  return false;
}

export function readSecret(name: SecretKey): string | undefined {
  const value = readRaw(name);
  if (!value || isPlaceholder(value)) {
    return undefined;
  }
  return value;
}

export function readCommunityPool(): CommunityPoolSettings {
  const raw = process.env.ENABLE_COMMUNITY_POOL?.trim().toLowerCase() ?? "";
  const baseUrl = readPlain("SAAS_API_BASE_URL")?.replace(/\/$/, "");
  return {
    enabled: ENABLED_VALUES.has(raw),
    apiKey: readSecret("SAAS_API_KEY"),
    baseUrl,
  };
}

const DEFAULT_FETCH_LIMIT = 12;

export function readFetchLimit(): number {
  const raw = process.env.FETCH_LIMIT?.trim();
  if (!raw || isPlaceholder(raw)) {
    return DEFAULT_FETCH_LIMIT;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    return DEFAULT_FETCH_LIMIT;
  }
  return value;
}

function readPlain(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed || isPlaceholder(trimmed)) {
    return undefined;
  }
  return trimmed;
}

export function getConfig(): AppConfig {
  return {
    apifyApiToken: readSecret("APIFY_API_TOKEN"),
    jevApiKey: readSecret("JEV_API_KEY"),
    saasApiKey: readSecret("SAAS_API_KEY"),
  };
}

export function missingKeysGuidance(keys: SecretKey[]): string | null {
  const missing = keys.filter((key) => readSecret(key) === undefined);
  if (missing.length === 0) {
    return null;
  }

  const blocks = missing.map((key) => {
    const detail = KEY_DETAILS[key];
    return [`- ${key}: ${detail.purpose}`, `  ${detail.applyHint}`].join("\n");
  });

  const assignments = missing.map((key) => `${key}=your_real_secret`).join("\n");

  return [
    `This tool cannot run yet. Missing ${missing.join(", ")}.`,
    "The MCP server is still running. Add the secret and reload to continue.",
    "",
    ...blocks,
    "",
    "Set it in either place:",
    "1. .env in the project root (copy from .env.example)",
    assignments,
    "2. The env object of this server in .cursor/mcp.json, for example",
    missing.map((key) => `"${key}": "your_real_secret"`).join("\n"),
    "",
    "Placeholders such as your_apify_api_token_here and your_jev_api_key_here count as unset.",
  ].join("\n");
}

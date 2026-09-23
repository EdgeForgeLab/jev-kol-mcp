import { readCommunityPool } from "../config.js";
import type { StoredKol } from "../db/kolStore.js";
import { isPrimaryNiche } from "../jev/niches.js";

export interface PoolSync {
  enabled: boolean;
  uploaded: number;
  pulled: number;
  detail: string;
}

interface Lookup {
  platform: StoredKol["platform"];
  query: string;
  minFollowers: number;
  maxFollowers: number;
  limit: number;
}

const REQUEST_TIMEOUT_MS = 8_000;

export function localOnlySync(readyDetail: string): PoolSync {
  const gate = openPool();
  if (!gate.ok) {
    return gate.sync;
  }
  return { enabled: true, uploaded: 0, pulled: 0, detail: readyDetail };
}

export async function pullCommunityKols(
  lookup: Lookup,
): Promise<{ kols: StoredKol[]; sync: PoolSync }> {
  const gate = openPool();
  if (!gate.ok) {
    return { kols: [], sync: gate.sync };
  }

  const url = new URL(`${gate.baseUrl}/v1/community-pool/kols`);
  url.searchParams.set("platform", lookup.platform);
  url.searchParams.set("query", lookup.query);
  url.searchParams.set("minFollowers", String(lookup.minFollowers));
  url.searchParams.set("maxFollowers", String(lookup.maxFollowers));
  url.searchParams.set("limit", String(lookup.limit));

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${gate.apiKey}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = await response.text();
    if (!response.ok) {
      return {
        kols: [],
        sync: {
          enabled: true,
          uploaded: 0,
          pulled: 0,
          detail: `Community pool read failed (HTTP ${response.status}). Continuing with local data or Apify. ${clip(body, gate.apiKey)}`,
        },
      };
    }
    const kols = parseKols(body);
    return {
      kols,
      sync: {
        enabled: true,
        uploaded: 0,
        pulled: kols.length,
        detail: kols.length > 0 ? `Read ${kols.length} rows from the community pool.` : "The community pool had no rows to add.",
      },
    };
  } catch (error) {
    return {
      kols: [],
      sync: {
        enabled: true,
        uploaded: 0,
        pulled: 0,
        detail: `Community pool read failed. Continuing with local data or Apify. ${errorText(error, gate.apiKey)}`,
      },
    };
  }
}

export async function pushCommunityKols(kols: StoredKol[], query: string): Promise<PoolSync> {
  const gate = openPool();
  if (!gate.ok) {
    return gate.sync;
  }
  if (kols.length === 0) {
    return { enabled: true, uploaded: 0, pulled: 0, detail: "No new profiles to upload." };
  }

  try {
    const response = await fetch(`${gate.baseUrl}/v1/community-pool/kols`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${gate.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        kols: kols.map((kol, rank) => ({ ...kol, rank })),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = await response.text();
    if (!response.ok) {
      return {
        enabled: true,
        uploaded: 0,
        pulled: 0,
        detail: `Saved locally. Community pool upload failed (HTTP ${response.status}). ${clip(body, gate.apiKey)}`,
      };
    }
    return {
      enabled: true,
      uploaded: kols.length,
      pulled: 0,
      detail: `Uploaded ${kols.length} profiles to the community pool.`,
    };
  } catch (error) {
    return {
      enabled: true,
      uploaded: 0,
      pulled: 0,
      detail: `Saved locally. Community pool upload failed. ${errorText(error, gate.apiKey)}`,
    };
  }
}

function openPool():
  | { ok: true; apiKey: string; baseUrl: string }
  | { ok: false; sync: PoolSync } {
  const settings = readCommunityPool();
  if (!settings.enabled) {
    return {
      ok: false,
      sync: {
        enabled: false,
        uploaded: 0,
        pulled: 0,
        detail: "ENABLE_COMMUNITY_POOL is off. Profiles are written only to the local database.",
      },
    };
  }
  const missing = [
    settings.baseUrl ? null : "SAAS_API_BASE_URL",
    settings.apiKey ? null : "SAAS_API_KEY",
  ].filter((item): item is string => item !== null);
  if (missing.length > 0 || !settings.baseUrl || !settings.apiKey) {
    return {
      ok: false,
      sync: {
        enabled: true,
        uploaded: 0,
        pulled: 0,
        detail: `Sharing is on, but ${missing.join(", ")} is missing. This run writes only to the local database.`,
      },
    };
  }
  return { ok: true, apiKey: settings.apiKey, baseUrl: settings.baseUrl };
}

function parseKols(body: string): StoredKol[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    return [];
  }
  const record = asRecord(parsed);
  const list = Array.isArray(parsed) ? parsed : record?.kols;
  if (!Array.isArray(list)) {
    return [];
  }
  return list.flatMap((item) => {
    const kol = parseKol(item);
    return kol ? [kol] : [];
  });
}

function parseKol(value: unknown): StoredKol | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const platform = record.platform;
  const handle = asString(record.handle);
  const followers = asNumber(record.followers);
  const profileUrl = asString(record.profileUrl);
  if ((platform !== "tiktok" && platform !== "youtube") || !handle || followers === null || !profileUrl) {
    return null;
  }
  const emailType = record.emailType;
  return {
    handle,
    displayName: asString(record.displayName) ?? handle,
    platform,
    followers,
    followersRange: asString(record.followersRange) ?? String(followers),
    bio: asString(record.bio) ?? "",
    contactEmail: asString(record.contactEmail),
    emailType: emailType === "personal" || emailType === "agency" ? emailType : null,
    profileUrl,
    verified: record.verified === true ? true : record.verified === false ? false : null,
    videoCount: asNumber(record.videoCount),
    totalLikes: asNumber(record.totalLikes),
    totalViews: asNumber(record.totalViews),
    location: asString(record.location),
    bioLinks: [],
    primaryNiche:
      typeof record.primaryNiche === "string" && isPrimaryNiche(record.primaryNiche)
        ? record.primaryNiche
        : null,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function errorText(error: unknown, secret: string): string {
  const message = error instanceof Error ? error.message : String(error);
  return clip(message, secret);
}

function clip(text: string, secret: string): string {
  return text.split(secret).join("[redacted]").slice(0, 180);
}

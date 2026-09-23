import { ApifyRequestError, runActor } from "../apify/client.js";
import {
  localOnlySync,
  pullCommunityKols,
  pushCommunityKols,
  type PoolSync,
} from "../community/pool.js";
import { missingKeysGuidance, readFetchLimit, readSecret } from "../config.js";
import { classifyPrimaryNiche } from "../jev/client.js";
import {
  CACHE_TTL_DAYS,
  clampLimit,
  databasePath,
  findCachedKols,
  normalizeQuery,
  saveKols,
  type BioLink,
  type StoredKol,
} from "../db/kolStore.js";
import { jsonResult, textResult, type ToolTextResult } from "../result.js";

export interface SearchKolsInput {
  platform: "tiktok" | "youtube";
  niche: string;
  minFollowers: number;
  maxFollowers: number;
  limit?: number;
}

export interface KolRecord {
  handle: string;
  displayName: string;
  platform: "tiktok" | "youtube";
  followers: number;
  followersRange: string;
  bio: string;
  contactEmail: string | null;
  emailType: "personal" | "agency" | null;
  profileUrl: string;
}

interface FoundKol extends KolRecord {
  verified: boolean | null;
  videoCount: number | null;
  totalLikes: number | null;
  totalViews: number | null;
  location: string | null;
  bioLinks: BioLink[];
}

const TIKTOK_ACTOR = "memo23~tiktok-user-search-scraper";
const YOUTUBE_ACTOR = "parsebird~youtube-channel-search-scraper";
const TIKTOK_ACTOR_NAME = "memo23/tiktok-user-search-scraper";
const YOUTUBE_ACTOR_NAME = "parsebird/youtube-channel-search-scraper";

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const AGENCY_PATTERN =
  /(agency|talent|management|mgmt|collab|partner|booking|press|\bpr\b|creator|studio)/i;

export async function searchKols(input: SearchKolsInput): Promise<ToolTextResult> {
  const guidance = missingKeysGuidance(["APIFY_API_TOKEN"]);
  if (guidance) {
    return textResult(guidance, true);
  }

  if (input.minFollowers > input.maxFollowers) {
    return textResult(
      "minFollowers cannot be greater than maxFollowers. Swap the range and search again.",
      true,
    );
  }

  const limit = clampLimit(input.limit);
  const query = normalizeQuery(input.niche);
  const lookup = {
    platform: input.platform,
    query,
    minFollowers: input.minFollowers,
    maxFollowers: input.maxFollowers,
    limit,
  };

  try {
    const cached = findCachedKols(lookup);
    if (cached.length >= limit) {
      return searchResult({
        source: "sqlite",
        input,
        limit,
        kols: cached,
        pool: localOnlySync("The local cache was enough. Apify was not called, and nothing was uploaded."),
        note: `These ${cached.length} rows came from the local database at ${databasePath}. Apify was not called. The same keyword and follower range stay cached for ${CACHE_TTL_DAYS} days.`,
      });
    }

    const pulled = await pullCommunityKols(lookup);
    if (pulled.kols.length > 0) {
      saveKols(pulled.kols, query);
      const merged = findCachedKols(lookup);
      if (merged.length >= limit) {
        return searchResult({
          source: "community-pool",
          input,
          limit,
          kols: merged,
          pool: {
            ...pulled.sync,
            uploaded: 0,
            detail: `The local cache was thin. ${pulled.kols.length} rows were filled from the community pool and saved locally. Apify was not called.`,
          },
          note: `Results came from the community pool and were saved to ${databasePath}. Apify was not called.`,
        });
      }
    }

    const fetchLimit = readFetchLimit();
    const scanned =
      input.platform === "tiktok"
        ? await searchTikTok(input.niche, input.minFollowers, input.maxFollowers, fetchLimit)
        : await searchYouTube(input.niche, input.minFollowers, input.maxFollowers, fetchLimit);
    const matched = scanned.filter(
      (kol) => kol.followers >= input.minFollowers && kol.followers <= input.maxFollowers,
    );
    const tagged = await tagPrimaryNiches(scanned.map(toStored));
    const storedKols = tagged.kols;
    const stored = saveKols(storedKols, query);
    const uploaded = await pushCommunityKols(storedKols, query);
    const kols = findCachedKols(lookup);
    const followerSpan = span(scanned);

    return searchResult({
      source: "apify",
      input,
      limit,
      kols,
      pool: {
        enabled: uploaded.enabled,
        uploaded: uploaded.uploaded,
        pulled: pulled.sync.pulled,
        detail: poolDetail(pulled.sync, uploaded),
      },
      actor: input.platform === "tiktok" ? TIKTOK_ACTOR_NAME : YOUTUBE_ACTOR_NAME,
      scannedProfiles: scanned.length,
      storedProfiles: stored,
      truncated: matched.length > kols.length,
      note: `${buildNote(scanned.length, matched.length, kols.length, stored, followerSpan, input)} ${tagged.detail}`.trim(),
    });
  } catch (error) {
    const detail =
      error instanceof ApifyRequestError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    return textResult(`The search did not finish. The MCP server is still running.\n${detail}`, true);
  }
}

async function searchTikTok(
  niche: string,
  minFollowers: number,
  maxFollowers: number,
  fetchLimit: number,
): Promise<FoundKol[]> {
  const items = await runActor(TIKTOK_ACTOR, {
    keywords: [niche],
    maxResultsPerKeyword: fetchLimit,
    minFollowers,
    maxFollowers,
    verifiedOnly: false,
  });

  const kols: FoundKol[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const record = asRecord(item);
    if (!record || typeof record.error === "string") {
      continue;
    }
    const name = asString(record.username)?.replace(/^@/, "");
    const followers = asNumber(record.followerCount);
    if (!name || followers === null || seen.has(name.toLowerCase())) {
      continue;
    }
    seen.add(name.toLowerCase());
    const bio = asString(record.bio) ?? "";
    const email = extractEmail(bio);
    kols.push({
      handle: `@${name}`,
      displayName: asString(record.nickname) ?? name,
      platform: "tiktok",
      followers,
      followersRange: followersRange(followers),
      bio,
      contactEmail: email,
      emailType: email ? classifyEmail(email) : null,
      profileUrl: asString(record.profileUrl) ?? `https://www.tiktok.com/@${name}`,
      verified: asBoolean(record.isVerified),
      videoCount: asNumber(record.videoCount),
      totalLikes: asNumber(record.likeCount),
      totalViews: null,
      location: asString(record.region),
      bioLinks: [],
    });
  }
  return kols;
}

async function searchYouTube(
  niche: string,
  minFollowers: number,
  maxFollowers: number,
  fetchLimit: number,
): Promise<FoundKol[]> {
  const items = await runActor(
    YOUTUBE_ACTOR,
    {
      searchTerms: [niche],
      discoveryMode: "both",
      maxChannelsPerSearchTerm: fetchLimit,
      maxTotalResults: fetchLimit,
      minSubscribers: minFollowers,
      maxSubscribers: maxFollowers,
    },
    180,
  );

  const kols: FoundKol[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const record = asRecord(item);
    const channel = asRecord(record?.channel);
    const metrics = asRecord(record?.metrics);
    const profile = asRecord(record?.profile);
    if (!record || !channel || typeof record.error === "string") {
      continue;
    }
    const title = asString(channel.title);
    const followers = asNumber(metrics?.subscribers);
    const handle = youtubeHandle(asString(channel.handle), asString(channel.url), title ?? "");
    const key = handle.toLowerCase();
    if (!title || followers === null || seen.has(key)) {
      continue;
    }
    seen.add(key);
    const bio = asString(channel.description) ?? "";
    const bioLinks = asBioLinks(profile?.externalLinks);
    const email = extractEmail(bio, ...bioLinks.map((link) => link.url));
    kols.push({
      handle,
      displayName: title,
      platform: "youtube",
      followers,
      followersRange: followersRange(followers),
      bio,
      contactEmail: email,
      emailType: email ? classifyEmail(email) : null,
      profileUrl: asString(channel.url) ?? "",
      verified: asBoolean(channel.isVerified),
      videoCount: asNumber(metrics?.videos),
      totalLikes: null,
      totalViews: asNumber(metrics?.totalViews),
      location: asString(profile?.country),
      bioLinks,
    });
  }

  return kols;
}

function searchResult(input: {
  source: "sqlite" | "community-pool" | "apify";
  input: SearchKolsInput;
  limit: number;
  kols: StoredKol[];
  pool: PoolSync;
  note: string;
  actor?: string;
  scannedProfiles?: number;
  storedProfiles?: number;
  truncated?: boolean;
}): ToolTextResult {
  return jsonResult({
    source: input.source,
    actor: input.actor,
    query: publicQuery(input.input, input.limit),
    scannedProfiles: input.scannedProfiles,
    storedProfiles: input.storedProfiles,
    count: input.kols.length,
    truncated: input.truncated ?? false,
    communityPool: input.pool,
    kols: input.kols,
    note: `${input.note} ${input.pool.detail}`.trim(),
  });
}

function poolDetail(pulled: PoolSync, uploaded: PoolSync): string {
  if (!uploaded.enabled) {
    return uploaded.detail;
  }
  if (pulled.pulled > 0) {
    return `The community pool filled ${pulled.pulled} rows first. ${uploaded.detail}`;
  }
  if (pulled.detail.startsWith("Community pool read failed")) {
    return `${pulled.detail} ${uploaded.detail}`;
  }
  return uploaded.detail;
}

function publicQuery(input: SearchKolsInput, limit: number) {
  return {
    platform: input.platform,
    niche: input.niche,
    minFollowers: input.minFollowers,
    maxFollowers: input.maxFollowers,
    limit,
  };
}

function toStored(kol: FoundKol): StoredKol {
  return {
    handle: kol.handle,
    displayName: kol.displayName,
    platform: kol.platform,
    followers: kol.followers,
    followersRange: kol.followersRange,
    bio: kol.bio,
    contactEmail: kol.contactEmail,
    emailType: kol.emailType,
    profileUrl: kol.profileUrl,
    verified: kol.verified,
    videoCount: kol.videoCount,
    totalLikes: kol.totalLikes,
    totalViews: kol.totalViews,
    location: kol.location,
    bioLinks: kol.bioLinks,
    primaryNiche: null,
  };
}

async function tagPrimaryNiches(kols: StoredKol[]): Promise<{ kols: StoredKol[]; detail: string }> {
  if (kols.length === 0) {
    return { kols, detail: "" };
  }
  if (!readSecret("JEV_API_KEY")) {
    return { kols, detail: "JEV_API_KEY is not set, so no niche labels were assigned." };
  }

  let tagged = 0;
  let failed = 0;
  const labeled = await mapPool(kols, 4, async (kol) => {
    try {
      const primaryNiche = await classifyPrimaryNiche({
        kolHandle: kol.handle,
        displayName: kol.displayName,
        bio: kol.bio,
      });
      tagged += 1;
      return { ...kol, primaryNiche };
    } catch {
      failed += 1;
      return kol;
    }
  });
  const failedNote = failed > 0 ? `${failed} could not be labeled and were still stored.` : "";
  return {
    kols: labeled,
    detail: `Jev labeled ${tagged} profiles. ${failedNote}`.trim(),
  };
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
  return results;
}

function buildNote(
  scanned: number,
  matched: number,
  returned: number,
  stored: number,
  followerSpan: { min: number; max: number } | null,
  input: SearchKolsInput,
): string {
  if (scanned === 0) {
    return "Apify returned no usable profiles. Try a more specific keyword.";
  }
  if (matched === 0 && followerSpan) {
    return `Apify returned ${scanned} profiles, with followers about ${followerSpan.min.toLocaleString("en-US")}–${followerSpan.max.toLocaleString("en-US")}. None fell inside ${input.minFollowers.toLocaleString("en-US")}–${input.maxFollowers.toLocaleString("en-US")}. Widen the range and search again.`;
  }
  const cap =
    matched > returned
      ? `${matched} profiles matched the range. Only the first ${returned} are returned.`
      : "";
  return `Apify was called, and ${stored} profiles were saved to ${databasePath}. The same keyword and follower range are read from the local database for the next ${CACHE_TTL_DAYS} days. Emails are extracted only from the public bio, and are null when none is published. ${cap}`.trim();
}

function span(kols: FoundKol[]): { min: number; max: number } | null {
  if (kols.length === 0) {
    return null;
  }
  const followers = kols.map((kol) => kol.followers);
  return { min: Math.min(...followers), max: Math.max(...followers) };
}

function followersRange(followers: number): string {
  const step =
    followers < 20_000 ? 5_000 : followers < 100_000 ? 10_000 : followers < 1_000_000 ? 50_000 : 500_000;
  const min = Math.floor(followers / step) * step;
  const max = min + step;
  const format = (value: number) => value.toLocaleString("en-US");
  return `${format(min)}-${format(max)}`;
}

function youtubeHandle(
  handle: string | null,
  channelUrl: string | null,
  channelName: string,
): string {
  const fromUrl = channelUrl?.match(/\/@([^/?#]+)/)?.[1];
  const value = handle ?? (fromUrl ? `@${fromUrl}` : null) ?? channelName;
  return value.startsWith("@") ? value : `@${value}`;
}

function extractEmail(...parts: Array<string | null>): string | null {
  const match = parts.filter((part) => part !== null).join("\n").match(EMAIL_PATTERN);
  return match ? match[0] : null;
}

function classifyEmail(email: string): "personal" | "agency" {
  return AGENCY_PATTERN.test(email) ? "agency" : "personal";
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === 1 || value === 0) {
    return value === 1;
  }
  return null;
}

function asBioLinks(value: unknown): BioLink[] {
  if (typeof value === "string" && value.trim()) {
    return [{ text: null, url: value.trim() }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => asBioLinks(item));
  }
  const record = asRecord(value);
  if (!record) {
    return [];
  }
  const url = asString(record.url) ?? asString(record.link);
  if (!url) {
    return [];
  }
  return [{ text: asString(record.text), url }];
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

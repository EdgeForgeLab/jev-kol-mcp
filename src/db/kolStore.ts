import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isPrimaryNiche, type PrimaryNiche } from "../jev/niches.js";

export interface BioLink {
  text: string | null;
  url: string;
}

export interface StoredKol {
  handle: string;
  displayName: string;
  platform: "tiktok" | "youtube";
  followers: number;
  followersRange: string;
  bio: string;
  contactEmail: string | null;
  emailType: "personal" | "agency" | null;
  profileUrl: string;
  verified: boolean | null;
  videoCount: number | null;
  totalLikes: number | null;
  totalViews: number | null;
  location: string | null;
  bioLinks: BioLink[];
  primaryNiche: PrimaryNiche | null;
}

export const DEFAULT_LIMIT = 5;
export const MAX_LIMIT = 20;
export const CACHE_TTL_DAYS = 7;
const CACHE_TTL_MS = CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;

export const databasePath = path.join(os.homedir(), ".jev-kol-mcp", "kols.sqlite");

let database: Database.Database | null = null;

export function clampLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(value)));
}

export function normalizeQuery(niche: string): string {
  return niche.trim().toLowerCase();
}

export function findCachedKols(input: {
  platform: StoredKol["platform"];
  query: string;
  minFollowers: number;
  maxFollowers: number;
  limit: number;
}): StoredKol[] {
  const freshAfter = new Date(Date.now() - CACHE_TTL_MS).toISOString();
  const rows = getDatabase()
    .prepare(
      `SELECT
         k.handle,
         k.display_name AS displayName,
         k.platform,
         k.followers,
         k.followers_range AS followersRange,
         k.bio,
         k.contact_email AS contactEmail,
         k.email_type AS emailType,
         k.profile_url AS profileUrl,
         k.verified,
         k.video_count AS videoCount,
         k.total_likes AS totalLikes,
         k.total_views AS totalViews,
         k.location,
         k.bio_links AS bioLinks,
         k.primary_niche AS primaryNiche
       FROM kols k
       INNER JOIN kol_queries q
         ON q.platform = k.platform AND q.handle = k.handle
       WHERE k.platform = ?
         AND q.query = ?
         AND k.followers >= ?
         AND k.followers <= ?
         AND k.fetched_at >= ?
       ORDER BY q.rank ASC
       LIMIT ?`,
    )
    .all(
      input.platform,
      input.query,
      input.minFollowers,
      input.maxFollowers,
      freshAfter,
      input.limit,
    );
  return rows.map((row) => toStoredKol(row as RawKolRow));
}

export function saveKols(kols: StoredKol[], query: string): number {
  const db = getDatabase();
  const fetchedAt = new Date().toISOString();
  const upsertKol = db.prepare(
    `INSERT INTO kols (
       platform, handle, display_name, followers, followers_range,
       bio, contact_email, email_type, profile_url, fetched_at,
       verified, video_count, total_likes, total_views, location, bio_links,
       primary_niche
     ) VALUES (
       @platform, @handle, @displayName, @followers, @followersRange,
       @bio, @contactEmail, @emailType, @profileUrl, @fetchedAt,
       @verified, @videoCount, @totalLikes, @totalViews, @location, @bioLinks,
       @primaryNiche
     )
     ON CONFLICT(platform, handle) DO UPDATE SET
       display_name = excluded.display_name,
       followers = excluded.followers,
       followers_range = excluded.followers_range,
       bio = excluded.bio,
       contact_email = excluded.contact_email,
       email_type = excluded.email_type,
       profile_url = excluded.profile_url,
       fetched_at = excluded.fetched_at,
       verified = excluded.verified,
       video_count = excluded.video_count,
       total_likes = excluded.total_likes,
       total_views = excluded.total_views,
       location = excluded.location,
       bio_links = excluded.bio_links,
       primary_niche = COALESCE(excluded.primary_niche, kols.primary_niche)`,
  );
  const upsertQuery = db.prepare(
    `INSERT INTO kol_queries (platform, handle, query, rank)
     VALUES (@platform, @handle, @query, @rank)
     ON CONFLICT(platform, handle, query) DO UPDATE SET
       rank = excluded.rank`,
  );

  const write = db.transaction((rows: StoredKol[]) => {
    rows.forEach((kol, rank) => {
      upsertKol.run({
        ...kol,
        fetchedAt,
        verified: kol.verified === null ? null : kol.verified ? 1 : 0,
        bioLinks: JSON.stringify(kol.bioLinks),
      });
      upsertQuery.run({
        platform: kol.platform,
        handle: kol.handle,
        query,
        rank,
      });
    });
  });
  write(kols);
  return kols.length;
}

function getDatabase(): Database.Database {
  if (database) {
    return database;
  }
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const opened = new Database(databasePath);
  opened.pragma("journal_mode = WAL");
  opened.exec(`
    CREATE TABLE IF NOT EXISTS kols (
      platform TEXT NOT NULL,
      handle TEXT NOT NULL,
      display_name TEXT NOT NULL,
      followers INTEGER NOT NULL,
      followers_range TEXT NOT NULL,
      bio TEXT NOT NULL,
      contact_email TEXT,
      email_type TEXT,
      profile_url TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      verified INTEGER,
      video_count INTEGER,
      total_likes INTEGER,
      total_views INTEGER,
      location TEXT,
      bio_links TEXT,
      primary_niche TEXT,
      PRIMARY KEY (platform, handle)
    );

    CREATE TABLE IF NOT EXISTS kol_queries (
      platform TEXT NOT NULL,
      handle TEXT NOT NULL,
      query TEXT NOT NULL,
      rank INTEGER NOT NULL,
      PRIMARY KEY (platform, handle, query)
    );

    CREATE INDEX IF NOT EXISTS idx_kols_followers
      ON kols (platform, followers, fetched_at);
  `);
  ensureProfileColumns(opened);
  database = opened;
  return opened;
}

interface RawKolRow extends Omit<StoredKol, "verified" | "bioLinks"> {
  verified: number | null;
  bioLinks: string | null;
}

function toStoredKol(row: RawKolRow): StoredKol {
  return {
    ...row,
    verified: row.verified === null ? null : row.verified === 1,
    bioLinks: parseBioLinks(row.bioLinks),
    primaryNiche: row.primaryNiche !== null && isPrimaryNiche(row.primaryNiche) ? row.primaryNiche : null,
  };
}

function parseBioLinks(value: string | null): BioLink[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((item) => {
      if (typeof item !== "object" || item === null) {
        return [];
      }
      const url = "url" in item && typeof item.url === "string" ? item.url : "";
      if (!url) {
        return [];
      }
      const text = "text" in item && typeof item.text === "string" ? item.text : null;
      return [{ text, url }];
    });
  } catch {
    return [];
  }
}

function ensureProfileColumns(opened: Database.Database): void {
  const existing = new Set(
    (opened.prepare("PRAGMA table_info(kols)").all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );
  const additions: Array<[string, string]> = [
    ["verified", "INTEGER"],
    ["video_count", "INTEGER"],
    ["total_likes", "INTEGER"],
    ["total_views", "INTEGER"],
    ["location", "TEXT"],
    ["bio_links", "TEXT"],
    ["primary_niche", "TEXT"],
  ];
  for (const [name, type] of additions) {
    if (!existing.has(name)) {
      opened.exec(`ALTER TABLE kols ADD COLUMN ${name} ${type}`);
    }
  }
}

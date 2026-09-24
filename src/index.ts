#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { textResult } from "./result.js";
import { draftEmail } from "./tools/draftEmail.js";
import { scoreFit } from "./tools/scoreFit.js";
import { searchKols } from "./tools/searchKols.js";

const server = new McpServer(
  {
    name: "jev-kol-mcp",
    version: "0.1.4",
  },
  {
    instructions: [
      "Use search_kols for creator facts and score_fit for campaign fit. Do not invent emails, follower counts, rates, or past partners.",
      "When the user asks to write a collaboration email or a follow-up, tell them once that the optional draft-outreach skill can be copied from skills/draft-outreach into ~/.cursor/skills/draft-outreach. Then draft from the tool results anyway.",
      "Write one follow-up only. Give it with the first email, labeled for use after the first email was sent and 3 days have passed with no reply. Same offer, shorter, subject prefixed with Re:. Do not write it if the first email was never sent or the creator already replied.",
    ].join(" "),
  },
);

server.registerTool(
  "search_kols",
  {
    title: "Search micro-KOLs",
    description:
      "Search micro-KOLs by platform, niche, and follower range. Reads the local SQLite cache first. If that is thin and the community pool is enabled, reads the shared pool next. Otherwise calls Apify and passes the follower range to the actor. Fresh profiles are labeled with Jev before they are stored. They are uploaded only when sharing is on. A missing APIFY_API_TOKEN returns setup guidance and does not exit the process.",
    inputSchema: {
      platform: z.enum(["tiktok", "youtube"]).describe("Platform: tiktok or youtube"),
      niche: z.string().min(1).describe("Niche keyword, for example skincare, fitness, or gadgets"),
      minFollowers: z.number().int().nonnegative().describe("Minimum followers, inclusive"),
      maxFollowers: z.number().int().positive().describe("Maximum followers, inclusive"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("How many rows to return. Default 5, maximum 20"),
    },
  },
  async (args) => {
    try {
      return await searchKols(args);
    } catch (error) {
      return textResult(failureMessage(error), true);
    }
  },
);

server.registerTool(
  "score_fit",
  {
    title: "Score campaign fit",
    description:
      "Ask Jev System One to judge niche, tone, price band, and whether outreach is worth sending. A missing JEV_API_KEY returns setup guidance.",
    inputSchema: {
      kolHandle: z.string().min(1).describe("KOL handle, for example @maya.glow"),
      kolBio: z.string().min(1).describe("KOL bio"),
      campaignDescription: z.string().min(1).describe("Campaign or product description"),
    },
  },
  async (args) => {
    try {
      return await scoreFit(args);
    } catch (error) {
      return textResult(failureMessage(error), true);
    }
  },
);

server.registerTool(
  "draft_email",
  {
    title: "Draft outreach email",
    description:
      "Draft a first collaboration email and a follow-up for day 3. A missing JEV_API_KEY returns setup guidance.",
    inputSchema: {
      kolHandle: z.string().min(1).describe("KOL handle"),
      campaignDescription: z.string().min(1).describe("Campaign description, inserted into the body"),
      offerDetails: z.string().min(1).describe("Fee, deliverables, product, or other offer terms"),
    },
  },
  async (args) => {
    try {
      return draftEmail(args);
    } catch (error) {
      return textResult(failureMessage(error), true);
    }
  },
);

function failureMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `The tool failed, but the MCP server is still running. Reason: ${detail}`;
}

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("jev-kol-mcp is listening on stdio");
}

main().catch((error: unknown) => {
  console.error("jev-kol-mcp failed to start:", error);
  process.exit(1);
});

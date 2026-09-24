---
name: jev-kol-mcp-installer
description: >-
  Install the jev-kol-mcp stdio server into Cursor, Claude Desktop, Cline, or
  Windsurf. Use when the user asks to install, set up, or configure jev-kol-mcp
  or the Jev KOL MCP from a prompt.
---

# Install jev-kol-mcp

Install the published package with `npx`. Do not invent API keys, and do not copy a preset or test key. Never print a key back to the user. Use a local checkout only when the user is changing this repo.

## 1. Check the machine

- `node -v` must be 18 or newer.
- `npx` must be on `PATH`.
- Do not clone the repo for a normal install. `npx -y jev-kol-mcp@latest` downloads the published package.

## 2. Ask for keys

Ask the user for:

1. `APIFY_API_TOKEN`, from https://console.apify.com/account/integrations. Search needs it. Platforms are TikTok and YouTube.
2. `JEV_API_KEY`, from TypeSafe. Niche labels and `score_fit` need it.

If either key is missing, still write the config and leave that value as an empty string. Say which tool will not work until they fill it in. Optional: `FETCH_LIMIT` as a string, default `"12"`.

## 3. Write the client config

Detect the client. Merge into the existing `mcpServers` object. Do not remove other servers. Create the file and parent directories if they are absent. All `env` values are strings.

| Client | File |
| --- | --- |
| Cursor, this project | `.cursor/mcp.json` |
| Cursor, every project | `~/.cursor/mcp.json` |
| Claude Desktop on macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop on Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Cline or Roo Code | the client's `mcpSettings` file the user points to |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |

Server key: `jev-kol`. Set `command` to the absolute path from `command -v npx`. Do not write the bare word `npx`. Cursor's own Node looks for a missing path inside Cursor.app and the process exits.

```json
{
  "mcpServers": {
    "jev-kol": {
      "command": "/absolute/path/from/command -v npx",
      "args": ["-y", "jev-kol-mcp@latest"],
      "env": {
        "APIFY_API_TOKEN": "",
        "JEV_API_KEY": "",
        "FETCH_LIMIT": "12"
      }
    }
  }
}
```

If the user is editing this repo, use `node` with the absolute path to that checkout's `dist/index.js` instead of `npx`. Build with `npm install` and `npm run build` first.

Do not commit `.cursor/mcp.json` or any file that now contains a key.

## 4. Confirm

Tell the user to reload the MCP server. This server has no `ping` or `get_schema` tool. After reload, the mounted tools are `search_kols`, `score_fit`, and `draft_email`. Do not call `search_kols` just to test; that spends Apify credit.

Optional: copy `skills/draft-outreach` to `~/.cursor/skills/draft-outreach` if they want the outreach skill. That copy is not required for the server to start.

Report the client file that was updated, whether each key was set, and that `jev-kol` is ready to reload.

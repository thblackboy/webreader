# Webreader MCP Server — Design Spec

**Date:** 2026-03-15
**Status:** Approved (updated: SearXNG replaces DuckDuckGo scraping)

## Overview

A local MCP server (Node.js + Python) that provides multi-engine web search and JS-aware web reading without API keys or request limits. Integrates with Claude Code as an MCP server.

Two processes run together:
- **SearXNG** — Python web service aggregating Google, Bing, DuckDuckGo and others, accessible at `http://127.0.0.1:8888`
- **MCP server** — Node.js stdio process connecting Claude Code to SearXNG (search) and Playwright (read)

## Tools

### `search(query: string, count?: number)`
- Calls local SearXNG JSON API: `GET http://127.0.0.1:8888/search?q=...&format=json`
- SearXNG aggregates results from Google, Bing, DuckDuckGo, Wikipedia, and others
- Returns array of `{ title, url, snippet }` (snippet maps from SearXNG's `content` field)
- Default count: 10, max: 20 (client-side slice)
- Returns `{ isError: true, ... }` if SearXNG is unreachable

### `read(url: string)`
- Uses a persistent Playwright Chromium instance (launched once at startup, reused across calls)
- Waits for `networkidle` then extracts with `@mozilla/readability`
- Converts to markdown via `turndown`
- Fallback: if Playwright navigation fails, fetches HTML via native `fetch()`, runs same readability + turndown pipeline
- Readability parse failures propagate directly (no fetch fallback)
- Timeout: 30s wall-clock on full tool call, enforced via `Promise.race`
- Returns `{ isError: true, ... }` on failure

## Stack

- **Python**: SearXNG (multi-engine search aggregator, port 8888)
- **Node.js**: `@modelcontextprotocol/sdk`, `zod`, `playwright`, `@mozilla/readability`, `jsdom`, `turndown`, native `fetch`

## File Structure

```
webreader/
├── searxng/
│   ├── settings.yml  # SearXNG config (port 8888, engines, secret key)
│   └── start.sh      # Activates venv and starts SearXNG Python process
├── index.js          # MCP server, tool registration, Playwright lifecycle
├── search.js         # SearXNG JSON API client + parseResults
├── reader.js         # Playwright + Readability + Turndown pipeline
└── package.json
```

## Playwright Lifecycle

- Browser launched once in `index.js` on startup via `chromium.launch()`
- Passed into `reader.js` as argument
- On process `SIGTERM`/`SIGINT`: browser closed before exit

## SearXNG Lifecycle

- Run manually: `./searxng/start.sh` (must be running before using `search` tool)
- Installed in isolated Python venv at `searxng/venv/`
- Source at `searxng/src/` (git-ignored)

## Integration

`~/.claude/settings.json`:

```json
"mcpServers": {
  "webreader": {
    "command": "node",
    "args": ["/Users/alexandralfonso/Pets/webreader/index.js"]
  }
}
```

One-time setup:
- `npx playwright install chromium`
- `pip install -e searxng/src` (in venv)

## Non-Goals

- No caching
- No proxy support
- No multi-page pagination for search
- SearXNG not auto-started by MCP server (run separately)

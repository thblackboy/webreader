# Webreader MCP Server Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Node.js MCP server with `search` (via local SearXNG) and `read` (Playwright) tools — zero API keys, zero limits, multi-engine search + JS-rendered page reading.

**Architecture:** SearXNG runs as a local Python process providing multi-engine search via JSON API. The MCP server has three modules: `search.js` calls SearXNG's JSON API, `reader.js` owns a persistent Playwright browser and extracts markdown via Readability+Turndown, `index.js` wires them into an MCP stdio server.

**Tech Stack:** Python 3.8+ (SearXNG), Node.js 18+, `@modelcontextprotocol/sdk`, `zod`, `playwright`, `@mozilla/readability`, `jsdom`, `turndown`

---

## Chunk 0: SearXNG Python service

### Task 0: Install and run SearXNG locally

**Files:**
- Create: `searxng/settings.yml` (minimal config)
- Create: `searxng/start.sh` (convenience script)

- [ ] **Step 1: Create SearXNG directory and virtual environment**

```bash
cd /Users/alexandralfonso/Pets/webreader
mkdir searxng
python3 -m venv searxng/venv
source searxng/venv/bin/activate
```

- [ ] **Step 2: Clone and install SearXNG**

```bash
git clone https://github.com/searxng/searxng searxng/src
pip install -e searxng/src
```

Expected: installs searxng and all Python dependencies. Takes 1-2 minutes.

- [ ] **Step 3: Create minimal settings.yml**

Create `searxng/settings.yml`:

```yaml
use_default_settings: true

server:
  port: 8888
  bind_address: "127.0.0.1"
  secret_key: "webreader-local-secret-change-me"

search:
  safe_search: 0
  default_lang: "en"

engines:
  - name: google
    engine: google
    disabled: false
  - name: bing
    engine: bing
    disabled: false
  - name: duckduckgo
    engine: duckduckgo
    disabled: false
  - name: wikipedia
    engine: wikipedia
    disabled: false

outgoing:
  request_timeout: 10.0
  max_request_timeout: 30.0
```

Note: port 8888 (not 8080) to avoid conflicts with other local services.

- [ ] **Step 4: Create start script**

Create `searxng/start.sh`:

```bash
#!/bin/bash
source "$(dirname "$0")/venv/bin/activate"
export SEARXNG_SETTINGS_PATH="$(dirname "$0")/settings.yml"
python -m searx.webapp
```

```bash
chmod +x searxng/start.sh
```

- [ ] **Step 5: Start SearXNG and verify**

```bash
# In a separate terminal, start SearXNG:
./searxng/start.sh

# In another terminal, verify it responds:
curl "http://127.0.0.1:8888/search?q=test&format=json" | head -c 200
```

Expected: JSON response with a `results` array. SearXNG must stay running while using the MCP server.

- [ ] **Step 6: Add searxng/src to .gitignore**

Edit `.gitignore`:

```
node_modules/
searxng/src/
searxng/venv/
```

- [ ] **Step 7: Commit SearXNG config**

```bash
git init
git add searxng/settings.yml searxng/start.sh .gitignore
git commit -m "chore: add SearXNG local search service config"
```

---

## Chunk 1: Node.js project scaffold + search module

### Task 1: Init Node.js project

**Files:**
- Create: `package.json`

- [ ] **Step 1: Init npm project**

```bash
cd /Users/alexandralfonso/Pets/webreader
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install @modelcontextprotocol/sdk zod playwright @mozilla/readability jsdom turndown
```

- [ ] **Step 3: Install Playwright Chromium binary**

```bash
npx playwright install chromium
```

- [ ] **Step 4: Set module type in package.json**

Edit `package.json` — set these fields exactly:

```json
{
  "name": "webreader",
  "version": "1.0.0",
  "type": "module",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "test": "node --test"
  }
}
```

(Keep the `dependencies` block that npm generated — just add/update the fields above.)

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: init Node.js project with dependencies"
```

---

### Task 2: SearXNG search module

**Files:**
- Create: `search.js`
- Create: `tests/search.test.js`
- Create: `tests/fixtures/searxng-response.json`

- [ ] **Step 1: Create SearXNG JSON fixture**

Create `tests/fixtures/searxng-response.json` — mimics SearXNG's actual JSON response format:

```json
{
  "query": "test query",
  "results": [
    {
      "title": "Example Result",
      "url": "https://example.com",
      "content": "This is the snippet text for the result.",
      "engine": "google"
    },
    {
      "title": "Second Result",
      "url": "https://example.org",
      "content": "Another snippet here.",
      "engine": "bing"
    },
    {
      "title": "Third Result",
      "url": "https://example.net",
      "content": "Yet another snippet.",
      "engine": "duckduckgo"
    }
  ]
}
```

- [ ] **Step 2: Write failing test**

Create `tests/search.test.js`:

```js
// Tests parseResults() directly with fixture JSON — no network, no fetch mocking.
// search() integration is verified via manual smoke test in Task 5.
import { strict as assert } from 'node:assert';
import { describe, it, before } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/searxng-response.json'), 'utf8')
);

describe('parseResults', () => {
  let parseResults;

  before(async () => {
    const mod = await import('../search.js');
    parseResults = mod.parseResults;
  });

  it('returns array of results with title, url, snippet', () => {
    const results = parseResults(fixture, 10);
    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0);
    assert.ok(results[0].title, 'Expected title');
    assert.ok(results[0].url, 'Expected url');
    assert.strictEqual(typeof results[0].snippet, 'string');
  });

  it('returns at most count results', () => {
    const results = parseResults(fixture, 1);
    assert.equal(results.length, 1);
  });

  it('result urls start with http', () => {
    const results = parseResults(fixture, 10);
    for (const r of results) {
      assert.ok(r.url.startsWith('http'), `Expected URL to start with http, got: ${r.url}`);
    }
  });

  it('snippet maps from content field', () => {
    const results = parseResults(fixture, 10);
    assert.equal(results[0].snippet, 'This is the snippet text for the result.');
  });
});
```

- [ ] **Step 3: Run test — expect failure**

```bash
node --test tests/search.test.js
```

Expected: `ERR_MODULE_NOT_FOUND` — `search.js` doesn't exist yet.

- [ ] **Step 4: Implement search.js**

Create `search.js`:

```js
const SEARXNG_URL = 'http://127.0.0.1:8888/search';

/**
 * Search via local SearXNG instance and return structured results.
 * SearXNG must be running at http://127.0.0.1:8888 (see searxng/start.sh).
 * @param {string} query
 * @param {number} count - max results to return (default 10, max 20)
 * @returns {Promise<Array<{title: string, url: string, snippet: string}>>}
 */
export async function search(query, count = 10) {
  const clampedCount = Math.min(Math.max(1, count), 20);

  const params = new URLSearchParams({ q: query, format: 'json' });
  const response = await fetch(`${SEARXNG_URL}?${params}`, {
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`SearXNG returned ${response.status} — is it running? (./searxng/start.sh)`);
  }

  const data = await response.json();
  return parseResults(data, clampedCount);
}

/**
 * Parse SearXNG JSON response into normalized result objects.
 * Exported for unit testing.
 * @param {{ results: Array<{title:string, url:string, content:string}> }} data
 * @param {number} count
 * @returns {Array<{title: string, url: string, snippet: string}>}
 */
export function parseResults(data, count) {
  return (data.results || [])
    .slice(0, count)
    .map((r) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.content || '',
    }));
}
```

- [ ] **Step 5: Run test — expect pass**

```bash
node --test tests/search.test.js
```

Expected: all 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add search.js tests/
git commit -m "feat: add SearXNG search module with tests"
```

---

## Chunk 2: Reader module

### Task 3: Web reader module

**Files:**
- Create: `reader.js`
- Create: `tests/reader.test.js`

Note: Playwright Chromium must be installed (Task 1, Step 3) before running these tests.

- [ ] **Step 1: Write failing test**

Create `tests/reader.test.js`:

```js
import { strict as assert } from 'node:assert';
import { describe, it, before, after } from 'node:test';
import { chromium } from 'playwright';

describe('reader', () => {
  let browser;
  let read;

  before(async () => {
    browser = await chromium.launch();
    const mod = await import('../reader.js');
    read = (url) => mod.read(browser, url);
  });

  after(async () => {
    await browser.close();
  });

  it('returns title and markdown content for a simple page', async () => {
    // example.com is stable, always available, minimal JS
    const result = await read('https://example.com');
    assert.ok(result.title, 'Expected a title');
    assert.ok(result.markdown.length > 0, 'Expected non-empty markdown');
  });

  it('markdown does not contain raw HTML tags', async () => {
    const result = await read('https://example.com');
    assert.ok(!result.markdown.includes('<div'), 'Should not contain <div>');
    assert.ok(!result.markdown.includes('<p>'), 'Should not contain <p>');
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
node --test tests/reader.test.js
```

Expected: `ERR_MODULE_NOT_FOUND` — `reader.js` doesn't exist.

- [ ] **Step 3: Implement reader.js**

Create `reader.js`:

```js
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';

const turndown = new TurndownService({ headingStyle: 'atx' });

/**
 * Read a URL and return clean markdown content.
 * @param {import('playwright').Browser} browser - shared Playwright browser instance
 * @param {string} url
 * @returns {Promise<{title: string, markdown: string}>}
 */
export async function read(browser, url) {
  return Promise.race([
    readWithPlaywright(browser, url),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('read() timed out after 30s')), 30_000)
    ),
  ]);
}

async function readWithPlaywright(browser, url) {
  let page;
  try {
    page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 25_000 });
    const html = await page.content();
    return extractContent(html, url);
  } catch (err) {
    // Readability parse failures propagate — only navigation errors fall back to fetch
    if (err.message.startsWith('Readability')) throw err;
    return readWithFetch(url);
  } finally {
    if (page) await page.close();
  }
}

async function readWithFetch(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!response.ok) throw new Error(`fetch failed: ${response.status}`);
  const html = await response.text();
  return extractContent(html, url);
}

function extractContent(html, url) {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  if (!article) throw new Error('Readability could not parse page content');
  return {
    title: article.title || '',
    markdown: turndown.turndown(article.content),
  };
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
node --test tests/reader.test.js
```

Expected: both tests pass. Hits real network (example.com). Takes ~3-5s.

- [ ] **Step 5: Commit**

```bash
git add reader.js tests/reader.test.js
git commit -m "feat: add Playwright web reader module with tests"
```

---

## Chunk 3: MCP server wiring + integration

### Task 4: MCP server entry point

**Files:**
- Create: `index.js`

- [ ] **Step 1: Implement index.js**

Create `index.js`:

```js
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { chromium } from 'playwright';
import { search } from './search.js';
import { read } from './reader.js';

const server = new McpServer({
  name: 'webreader',
  version: '1.0.0',
});

let browser;

server.tool(
  'search',
  'Search the web via local SearXNG (aggregates Google, Bing, DuckDuckGo and more). Returns titles, URLs, and snippets.',
  {
    query: z.string().describe('Search query'),
    count: z.number().int().min(1).max(20).default(10).describe('Number of results (1-20)'),
  },
  async ({ query, count }) => {
    try {
      const results = await search(query, count);
      const text = results.length === 0
        ? 'No results found.'
        : results.map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`).join('\n\n');
      return { content: [{ type: 'text', text }] };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Search failed: ${err.message}` }],
      };
    }
  }
);

server.tool(
  'read',
  'Read a web page and return its content as clean markdown. Handles JS-rendered pages (React, SPA, etc).',
  {
    url: z.string().url().describe('URL to read'),
  },
  async ({ url }) => {
    try {
      const { title, markdown } = await read(browser, url);
      const text = title ? `# ${title}\n\n${markdown}` : markdown;
      return { content: [{ type: 'text', text }] };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Read failed: ${err.message}` }],
      };
    }
  }
);

async function main() {
  browser = await chromium.launch();

  const cleanup = async () => {
    await browser.close();
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Smoke test — verify server starts and lists tools**

MCP requires an `initialize` handshake before any other request:

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' | node index.js
```

Expected: JSON lines output — the `tools/list` response should include both `search` and `read` in the tools array. Ctrl+C to stop the process.

- [ ] **Step 3: Commit**

```bash
git add index.js
git commit -m "feat: add MCP stdio server wiring search and read tools"
```

---

### Task 5: Register with Claude Code

**Files:**
- Modify: `~/.claude/settings.json`

- [ ] **Step 1: Start SearXNG** (must be running before Claude Code connects)

```bash
./searxng/start.sh
```

Leave this running in a terminal. SearXNG must be up whenever you use the `search` tool.

- [ ] **Step 2: Add mcpServers entry to ~/.claude/settings.json**

In `~/.claude/settings.json`, add `mcpServers` at the top level alongside existing keys:

```json
{
  "mcpServers": {
    "webreader": {
      "command": "node",
      "args": ["/Users/alexandralfonso/Pets/webreader/index.js"]
    }
  }
}
```

- [ ] **Step 3: Restart Claude Code and verify tools appear**

Open a new Claude Code session. Run:

```
/mcp
```

Expected: `webreader` listed as connected with `search` and `read` tools available.

- [ ] **Step 4: Test search tool**

Ask Claude: "Search for 'nodejs mcp server' using the search tool"

Expected: numbered list of results with titles, URLs, snippets from multiple engines.

- [ ] **Step 5: Test read tool**

Ask Claude: "Read https://example.com"

Expected: clean markdown content of the page.

- [ ] **Step 6: Final commit**

```bash
cd /Users/alexandralfonso/Pets/webreader
git add .
git commit -m "docs: add implementation plan and spec"
```

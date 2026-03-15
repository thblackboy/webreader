# Python Rewrite Plan

> **For agentic workers:** Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Rewrite Node.js MCP server to Python so it distributes via `uvx --from git+https://github.com/user/webreader webreader` with zero manual setup.

**Architecture:** FastMCP Python server. `search.py` uses `duckduckgo-search` (no external service). `reader.py` uses Playwright Python + trafilatura. Browser launched once via FastMCP lifespan, reused across calls. Playwright Chromium auto-installed on first run.

**Tech Stack:** Python 3.10+, `mcp[cli]`, `duckduckgo-search`, `playwright`, `trafilatura`, `httpx`

---

## Task 1: Remove Node.js files, init Python project

- [ ] Delete Node.js files:
```bash
cd /Users/alexandralfonso/Pets/webreader
rm -f index.js search.js reader.js package.json package-lock.json
rm -rf node_modules searxng tests
```

- [ ] Create `pyproject.toml`:
```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "webreader"
version = "0.1.0"
description = "Local MCP server for web search and reading — no API keys, no limits"
requires-python = ">=3.10"
dependencies = [
    "mcp[cli]>=1.0.0",
    "duckduckgo-search>=6.0.0",
    "playwright>=1.40.0",
    "trafilatura>=1.12.0",
    "httpx>=0.27.0",
]

[project.scripts]
webreader = "webreader.__main__:main"

[tool.hatch.build.targets.wheel]
packages = ["src/webreader"]
```

- [ ] Create `src/webreader/` directory structure:
```bash
mkdir -p src/webreader
```

- [ ] Update `.gitignore`:
```
# Python
__pycache__/
*.pyc
.venv/
dist/
*.egg-info/

# Playwright
/playwright/.local-browsers/

# Docs build
docs/superpowers/
```

- [ ] Install with uv:
```bash
uv venv
uv pip install -e ".[dev]" 2>/dev/null || uv pip install -e .
uv pip install hatchling
```

Actually simpler — use uv sync:
```bash
uv init --no-workspace 2>/dev/null || true
uv add mcp[cli] duckduckgo-search playwright trafilatura httpx
```

- [ ] Commit:
```bash
git add pyproject.toml .gitignore src/
git commit -m "chore: init Python project, remove Node.js files"
```

---

## Task 2: search.py

- [ ] Create `src/webreader/search.py`:
```python
from duckduckgo_search import DDGS


def search(query: str, count: int = 10) -> list[dict]:
    """Search via DuckDuckGo. Returns list of {title, url, snippet}."""
    count = max(1, min(count, 20))
    with DDGS() as ddgs:
        results = list(ddgs.text(query, max_results=count))
    return [
        {
            "title": r.get("title", ""),
            "url": r.get("href", ""),
            "snippet": r.get("body", ""),
        }
        for r in results
    ]
```

- [ ] Commit:
```bash
git add src/webreader/search.py
git commit -m "feat: add DuckDuckGo search module"
```

---

## Task 3: reader.py

- [ ] Create `src/webreader/reader.py`:
```python
from __future__ import annotations

import httpx
import trafilatura
from playwright.async_api import Browser, async_playwright


async def read(browser: Browser, url: str) -> dict:
    """Read URL and return {title, markdown}. Uses Playwright, falls back to httpx."""
    html = await _fetch_with_playwright(browser, url)
    return _extract(html, url)


async def _fetch_with_playwright(browser: Browser, url: str) -> str:
    page = await browser.new_page()
    try:
        await page.goto(url, wait_until="networkidle", timeout=25_000)
        return await page.content()
    except Exception:
        return await _fetch_with_httpx(url)
    finally:
        await page.close()


async def _fetch_with_httpx(url: str) -> str:
    async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
        resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
        resp.raise_for_status()
        return resp.text


def _extract(html: str, url: str) -> dict:
    meta = trafilatura.extract_metadata(html, default_url=url)
    title = meta.title if meta and meta.title else ""

    markdown = trafilatura.extract(
        html,
        url=url,
        include_tables=True,
        include_links=False,
        output_format="markdown",
    )
    if not markdown:
        raise ValueError("Could not extract readable content from page")

    return {"title": title, "markdown": markdown}
```

- [ ] Commit:
```bash
git add src/webreader/reader.py
git commit -m "feat: add Playwright + trafilatura reader module"
```

---

## Task 4: server.py + __main__.py + __init__.py

- [ ] Create `src/webreader/__init__.py`:
```python
__version__ = "0.1.0"
```

- [ ] Create `src/webreader/server.py`:
```python
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncIterator

from mcp.server.fastmcp import FastMCP
from playwright.async_api import async_playwright

from webreader.search import search as _search
from webreader.reader import read as _read


@asynccontextmanager
async def lifespan(app: FastMCP) -> AsyncIterator[dict]:
    """Launch persistent Playwright browser for the lifetime of the MCP server."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            yield {"browser": browser}
        finally:
            await browser.close()


mcp = FastMCP("webreader", lifespan=lifespan)


@mcp.tool()
def search_web(query: str, count: int = 10) -> str:
    """Search the web via DuckDuckGo. Returns titles, URLs and snippets.

    Args:
        query: Search query
        count: Number of results (1-20, default 10)
    """
    results = _search(query, count)
    if not results:
        return "No results found."
    lines = [
        f"{i+1}. **{r['title']}**\n   {r['url']}\n   {r['snippet']}"
        for i, r in enumerate(results)
    ]
    return "\n\n".join(lines)


@mcp.tool()
async def read_page(url: str) -> str:
    """Read a web page and return clean markdown. Handles JS-rendered pages.

    Args:
        url: URL to read
    """
    ctx = mcp.get_context()
    browser = ctx.request_context.lifespan_context["browser"]
    result = await _read(browser, url)
    title = result["title"]
    markdown = result["markdown"]
    return f"# {title}\n\n{markdown}" if title else markdown
```

- [ ] Create `src/webreader/__main__.py`:
```python
from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def _ensure_chromium() -> None:
    """Install Playwright Chromium browser on first run (fast no-op if already installed)."""
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            exe = Path(p.chromium.executable_path)
            if exe.exists():
                return  # already installed
    except Exception:
        pass

    print("First run: installing Playwright Chromium (~170MB)...", file=sys.stderr)
    subprocess.run(
        [sys.executable, "-m", "playwright", "install", "chromium"],
        check=True,
    )


def main() -> None:
    _ensure_chromium()
    from webreader.server import mcp
    mcp.run()


if __name__ == "__main__":
    main()
```

- [ ] Commit:
```bash
git add src/webreader/__init__.py src/webreader/server.py src/webreader/__main__.py
git commit -m "feat: add FastMCP server with search and read tools"
```

---

## Task 5: Test + wire into Claude Code

- [ ] Install playwright chromium:
```bash
uv run playwright install chromium
```

- [ ] Smoke test — start server and verify tools respond:
```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' | timeout 8 uv run webreader || true
```

Expected: JSON with `search_web` and `read_page` in tools list.

- [ ] Remove old Node.js MCP server from Claude Code config:
```bash
claude mcp remove webreader 2>/dev/null || true
```

- [ ] Add Python MCP server:
```bash
claude mcp add webreader -- uv --directory /Users/alexandralfonso/Pets/webreader run webreader
```

- [ ] Verify connected:
```bash
claude mcp list
```

Expected: `webreader: uv ... run webreader - ✓ Connected`

- [ ] Final commit:
```bash
git add -A
git commit -m "chore: wire Python MCP server into Claude Code"
```

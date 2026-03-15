from __future__ import annotations

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

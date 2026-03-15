from __future__ import annotations

import httpx
import trafilatura
from playwright.async_api import Browser


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
    from bs4 import BeautifulSoup

    meta = trafilatura.extract_metadata(html, default_url=url)
    title = meta.title if meta and meta.title else ""

    markdown = trafilatura.extract(
        html,
        url=url,
        include_tables=True,
        include_links=False,
        output_format="markdown",
    )

    # Fallback for JS-heavy pages (anime sites, SPAs, etc.)
    # where trafilatura finds no article-like content
    if not markdown:
        soup = BeautifulSoup(html, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "head"]):
            tag.decompose()
        text = soup.get_text(separator="\n", strip=True)
        # Collapse excessive blank lines
        lines = [l for l in text.splitlines() if l.strip()]
        markdown = "\n".join(lines)

    if not markdown:
        raise ValueError("Could not extract readable content from page")

    return {"title": title, "markdown": markdown}

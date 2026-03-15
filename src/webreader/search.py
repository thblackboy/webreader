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

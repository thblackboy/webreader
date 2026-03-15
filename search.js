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

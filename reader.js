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

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

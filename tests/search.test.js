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

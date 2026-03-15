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

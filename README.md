# webreader

Local MCP server for web search and reading — no API keys, no limits.

**Tools:**
- `search_web` — searches via DuckDuckGo, returns titles, URLs and snippets
- `read_page` — reads any web page (including JS-rendered) and returns clean markdown

## Install in Claude Code

```bash
claude mcp add webreader -- uvx --from git+https://github.com/thblackboy/webreader webreader
```

First run downloads Playwright Chromium automatically (~170MB). After that everything works with no additional setup.

## Usage

Once installed, just ask Claude:

> "Search for the latest news about X"
> "Read and summarize https://example.com"

Claude will use `search_web` and `read_page` automatically.

## Manual install (development)

```bash
git clone https://github.com/thblackboy/webreader
cd webreader
uv sync
uv run playwright install chromium
claude mcp add webreader -- uv --directory $PWD run webreader
```

## Requirements

- Python 3.10+
- [uv](https://docs.astral.sh/uv/getting-started/installation/) or [uvx](https://docs.astral.sh/uv/)
- [Claude Code](https://claude.ai/claude-code)

## License

MIT

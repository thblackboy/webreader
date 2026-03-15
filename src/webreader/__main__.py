from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def _ensure_chromium() -> None:
    """Install Playwright Chromium browser on first run."""
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            exe = Path(p.chromium.executable_path)
            if exe.exists():
                return
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

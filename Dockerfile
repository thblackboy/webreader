FROM mcr.microsoft.com/playwright/python:v1.60.0-jammy

RUN pip install --no-cache-dir \
      "webreader @ git+https://github.com/thblackboy/webreader" \
      "tf-playwright-stealth>=1.1.2"

RUN cat > /run.py <<'EOF'
# Apply stealth patches to every page created from any Browser instance.
# Done BEFORE importing webreader.server so monkey-patch is in place when
# its lifespan launches Chromium.
import logging
from playwright.async_api import Browser
from playwright_stealth import stealth_async

_log = logging.getLogger("stealth")
_original_new_page = Browser.new_page

async def _new_page_with_stealth(self, *args, **kwargs):
    page = await _original_new_page(self, *args, **kwargs)
    try:
        await stealth_async(page)
    except Exception as e:
        _log.warning("stealth apply failed (continuing without): %r", e)
    return page

Browser.new_page = _new_page_with_stealth

from webreader.server import mcp
from mcp.server.fastmcp.server import TransportSecuritySettings

mcp.settings.host = "0.0.0.0"
mcp.settings.port = 8000
mcp.settings.streamable_http_path = "/mcp"
mcp.settings.transport_security = TransportSecuritySettings(
    enable_dns_rebinding_protection=False,
)
mcp.run(transport="streamable-http")
EOF

EXPOSE 8000
CMD ["python", "/run.py"]

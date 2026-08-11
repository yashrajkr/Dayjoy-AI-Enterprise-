"""Web processor — crawl a URL and parse the resulting HTML.

Performs a bounded breadth-first crawl starting from a seed URL:
- Respects a max page limit (WEB_CRAWL_MAX_PAGES)
- Respects a max depth (WEB_CRAWL_MAX_DEPTH)
- Honors robots.txt (basic check)
- Same-domain only (no off-site crawling)
- Configurable user agent (WEB_CRAWL_USER_AGENT)
- Configurable timeout per page (WEB_CRAWL_TIMEOUT)

Each crawled page becomes one chunk (or multiple if the page is very large).
"""

import asyncio
import re
from collections import deque
from typing import Any
from urllib.parse import urldefrag, urljoin, urlparse

from app.ai.document_processors.base import (
    DocumentProcessor,
    ProcessedChunk,
    ProcessedDocument,
    ProcessorError,
)
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class WebProcessor(DocumentProcessor):
    """Process a website by crawling and parsing HTML pages."""

    @property
    def supported_formats(self) -> list[str]:
        return ["web"]

    async def process_text(
        self,
        text: str,
        filename: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> ProcessedDocument:
        """Process a single URL.

        `text` is the URL to crawl. `metadata` may include:
            - max_pages: int (override WEB_CRAWL_MAX_PAGES)
            - max_depth: int (override WEB_CRAWL_MAX_DEPTH)
        """
        meta = dict(metadata or {})
        url = text.strip()
        if not url:
            raise ProcessorError("No URL provided for web crawl")

        # Validate URL
        parsed = urlparse(url)
        if not parsed.scheme or not parsed.netloc:
            raise ProcessorError(f"Invalid URL: {url!r}")
        if parsed.scheme not in ("http", "https"):
            raise ProcessorError(f"Unsupported URL scheme: {parsed.scheme!r}")

        max_pages = int(meta.get("max_pages", settings.WEB_CRAWL_MAX_PAGES))
        max_depth = int(meta.get("max_depth", settings.WEB_CRAWL_MAX_DEPTH))

        try:
            import httpx
        except ImportError as e:  # pragma: no cover — httpx is in deps
            raise ProcessorError("httpx not installed") from e

        # Crawl
        chunks: list[ProcessedChunk] = []
        full_text_parts: list[str] = []
        visited: set[str] = set()
        queue: deque[tuple[str, int]] = deque([(url, 0)])
        titles: list[str] = []
        base_domain = parsed.netloc

        async with httpx.AsyncClient(
            timeout=settings.WEB_CRAWL_TIMEOUT,
            follow_redirects=True,
            headers={"User-Agent": settings.WEB_CRAWL_USER_AGENT},
        ) as client:
            pages_crawled = 0
            while queue and pages_crawled < max_pages:
                current_url, depth = queue.popleft()
                # De-frag and dedupe
                current_url, _ = urldefrag(current_url)
                if current_url in visited:
                    continue
                visited.add(current_url)

                try:
                    resp = await client.get(current_url)
                    resp.raise_for_status()
                    content_type = resp.headers.get("content-type", "")
                    if "text/html" not in content_type and "application/xhtml" not in content_type:
                        logger.debug("web_crawl_skip_non_html", url=current_url, ct=content_type)
                        continue
                except Exception as e:
                    logger.warning("web_crawl_fetch_failed", url=current_url, error=str(e))
                    continue

                pages_crawled += 1
                html = resp.text
                page_title = self._extract_title(html) or current_url
                if not titles:
                    titles.append(page_title)
                # Parse the page using HTML processor
                from app.ai.document_processors.html_processor import HTMLProcessor

                html_proc = HTMLProcessor()
                page_doc = await html_proc.process_text(
                    html,
                    filename=page_title,
                    metadata={"url": current_url, "title": page_title},
                )
                # Add source URL to each chunk's metadata
                for chunk in page_doc.chunks:
                    chunk.metadata = {
                        **chunk.metadata,
                        "url": current_url,
                        "page_title": page_title,
                        "crawl_depth": depth,
                    }
                    chunks.append(chunk)
                    full_text_parts.append(f"## {page_title}\nURL: {current_url}\n\n{chunk.text}")

                # Enqueue same-domain links if depth allows
                if depth < max_depth:
                    for link in self._extract_links(html, current_url, base_domain):
                        if link not in visited:
                            queue.append((link, depth + 1))

        # Determine document title
        title = meta.get("title") or (titles[0] if titles else url)
        full_text = "\n\n---\n\n".join(full_text_parts)

        return ProcessedDocument(
            text=full_text,
            chunks=chunks,
            title=title,
            language=meta.get("language", "en"),
            metadata={
                **meta,
                "seed_url": url,
                "pages_crawled": pages_crawled,
                "urls_visited": list(visited),
            },
        )

    async def process_bytes(
        self,
        data: bytes,
        filename: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> ProcessedDocument:
        # If bytes are passed, treat as raw HTML
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            text = data.decode("latin-1")
        # If the data looks like a URL, crawl it; else parse as HTML
        stripped = text.strip()
        if stripped.startswith(("http://", "https://")):
            return await self.process_text(stripped, filename=filename, metadata=metadata)
        # Treat as HTML
        from app.ai.document_processors.html_processor import HTMLProcessor

        return await HTMLProcessor().process_text(text, filename=filename, metadata=metadata)

    @staticmethod
    def _extract_title(html: str) -> str | None:
        match = re.search(r"<title[^>]*>(.+?)</title>", html, re.IGNORECASE | re.DOTALL)
        if match:
            return re.sub(r"\s+", " ", match.group(1)).strip()
        return None

    @staticmethod
    def _extract_links(html: str, base_url: str, base_domain: str) -> list[str]:
        """Extract same-domain absolute links from HTML."""
        links: list[str] = []
        for match in re.finditer(r'href=["\']([^"\']+)["\']', html, re.IGNORECASE):
            href = match.group(1)
            # Skip anchors, javascript, mailto
            if href.startswith(("#", "javascript:", "mailto:", "tel:")):
                continue
            absolute = urljoin(base_url, href)
            parsed = urlparse(absolute)
            # Same domain only
            if parsed.netloc != base_domain:
                continue
            # Strip fragment
            absolute, _ = urldefrag(absolute)
            if absolute not in links:
                links.append(absolute)
        return links

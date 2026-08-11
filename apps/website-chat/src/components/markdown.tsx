import * as React from "react";

/**
 * Minimal, dependency-free Markdown renderer.
 *
 * Supports the subset of Markdown the assistant is most likely to
 * emit in a chat reply:
 *   - **bold**, *italics*, `inline code`
 *   - code blocks (``` lang \n code ```)
 *   - bullet + numbered lists (single-level)
 *   - links [text](url)
 *   - paragraphs + line breaks
 *   - blockquotes
 *
 * All HTML is escaped before being interpreted as Markdown — the
 * renderer is safe to use with untrusted LLM output. URLs in links
 * are validated (http/https/mailto only) to prevent `javascript:`
 * XSS.
 *
 * For complex Markdown, swap this for `react-markdown` — but for
 * chat replies, this tiny parser keeps the bundle small.
 */

/** Escape HTML special characters in a string. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Validate a URL is safe for `href`. */
function isSafeUrl(url: string): boolean {
  const trimmed = url.trim();
  if (/^(https?:|mailto:)/i.test(trimmed)) return true;
  // Relative URLs (start with `/` or `#`) are also safe.
  if (/^[/#]/.test(trimmed)) return true;
  return false;
}

/** Apply inline Markdown formatting to an already-escaped string. */
function applyInline(escaped: string): string {
  let out = escaped;
  // Inline code (`...`) — do first so other syntax inside code is preserved.
  out = out.replace(
    /`([^`]+)`/g,
    (_, code) => `<code>${code}</code>`,
  );
  // Bold (**...** or __...__)
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  // Italics (*...* or _..._)
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/(^|[^_])_([^_]+)_/g, "$1<em>$2</em>");
  // Links [text](url)
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_, text, url) => {
      const safeUrl = url.trim();
      if (!isSafeUrl(safeUrl)) return text;
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
  );
  return out;
}

/** Parse a Markdown string into an array of React nodes. */
export function renderMarkdown(markdown: string): React.ReactNode {
  if (!markdown) return null;
  const input = markdown.replace(/\r\n/g, "\n");
  const lines = input.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    // Code block (``` ... ```)
    const fence = line.match(/^```(\w+)?\s*$/);
    if (fence) {
      const lang = fence[1] || "";
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i] ?? "")) {
        code.push(lines[i] ?? "");
        i++;
      }
      i++; // skip closing ```
      blocks.push(
        <pre key={key++} data-lang={lang}>
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // Blockquote (> ...)
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i] ?? "")) {
        quote.push((lines[i] ?? "").replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote key={key++}>
          <span
            dangerouslySetInnerHTML={{
              __html: applyInline(escapeHtml(quote.join(" "))),
            }}
          />
        </blockquote>,
      );
      continue;
    }

    // Unordered list (- or * at line start)
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={key++}>
          {items.map((it, idx) => (
            <li
              key={idx}
              dangerouslySetInnerHTML={{
                __html: applyInline(escapeHtml(it)),
              }}
            />
          ))}
        </ul>,
      );
      continue;
    }

    // Ordered list (1. 2. ...)
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={key++}>
          {items.map((it, idx) => (
            <li
              key={idx}
              dangerouslySetInnerHTML={{
                __html: applyInline(escapeHtml(it)),
              }}
            />
          ))}
        </ol>,
      );
      continue;
    }

    // Blank line — skip
    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph (consume until blank line / block boundary)
    const para: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() &&
      !/^```/.test(lines[i] ?? "") &&
      !/^>\s?/.test(lines[i] ?? "") &&
      !/^[-*]\s+/.test(lines[i] ?? "") &&
      !/^\d+\.\s+/.test(lines[i] ?? "")
    ) {
      para.push(lines[i] ?? "");
      i++;
    }
    blocks.push(
      <p
        key={key++}
        dangerouslySetInnerHTML={{
          __html: applyInline(escapeHtml(para.join("\n").replace(/\n/g, "<br/>"))),
        }}
      />,
    );
  }

  return <>{blocks}</>;
}

/** Convenience component wrapper. */
export function Markdown({ content }: { content: string }): React.ReactElement {
  return (
    <div className="chat-markdown">{renderMarkdown(content)}</div>
  );
}

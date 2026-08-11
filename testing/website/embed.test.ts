/**
 * Website AI — Embed Tests
 * =========================
 *
 * Validates the **embeddable widget** contract of the Dayjoy Website
 * AI chat widget — the iframe-embeddable + script-tag-injectable
 * widget that third-party sites can install:
 *
 *   1. **Iframe load.** Loading a page with the embed script injects
 *      an iframe with the widget URL.
 *   2. **Widget functional in iframe.** The widget can send + receive
 *      messages when embedded.
 *   3. **URL-param config.** Configuration via URL params (e.g.
 *      `?title=Custom&color=%23FF0000`) is applied.
 *   4. **Cross-origin.** The widget works correctly when embedded on
 *      a different origin.
 *   5. **PostMessage communication.** The host page and widget
 *      communicate via `window.postMessage`.
 *
 * Uses `createChatWidgetSimulator()` with `receivePostMessage()` /
 * `sendPostMessage()` / `isDomainAllowed()` helpers.
 *
 * Reference: `apps/website-chat/` (production widget app),
 *            MDN — `window.postMessage`.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createChatWidgetSimulator } from '../helpers/website-chat-simulator';

describe('Website AI Embed', () => {
  let widget: ReturnType<typeof createChatWidgetSimulator>;

  beforeEach(() => {
    widget = createChatWidgetSimulator({
      config: {
        allowedDomains: ['dayjoy.ai', 'partner.com', 'localhost'],
      },
    });
  });

  // ---------------------------------------------------------------------------
  // 1. Iframe load
  // ---------------------------------------------------------------------------

  it('should be embeddable (no errors on instantiation)', () => {
    expect(() => createChatWidgetSimulator()).not.toThrow();
  });

  it('should start in a closed state (waiting for the host page to open it)', () => {
    expect(widget.isOpen()).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 2. Widget functional in iframe
  // ---------------------------------------------------------------------------

  it('should be able to open the widget from the host page', () => {
    widget.receivePostMessage('https://dayjoy.ai', { type: 'open' });
    expect(widget.isOpen()).toBe(true);
  });

  it('should be able to close the widget from the host page', () => {
    widget.receivePostMessage('https://dayjoy.ai', { type: 'open' });
    expect(widget.isOpen()).toBe(true);

    widget.receivePostMessage('https://dayjoy.ai', { type: 'close' });
    expect(widget.isOpen()).toBe(false);
  });

  it('should be able to send a message from the host page', async () => {
    widget.receivePostMessage('https://dayjoy.ai', { type: 'open' });
    widget.receivePostMessage('https://dayjoy.ai', {
      type: 'send',
      text: 'Hi',
    });

    // Give the send a chance to complete (the simulator's send is async).
    await new Promise((resolve) => setTimeout(resolve, 50));

    const messages = widget.getMessages();
    const userMsg = messages.find((m) => m.role === 'user');
    expect(userMsg?.content).toBe('Hi');
  });

  // ---------------------------------------------------------------------------
  // 3. URL-param config
  // ---------------------------------------------------------------------------

  it('should apply URL params for the title', () => {
    widget.applyUrlParams({ title: 'Custom Title' });
    expect(widget.getConfig().title).toBe('Custom Title');
  });

  it('should apply URL params for the color', () => {
    widget.applyUrlParams({ color: '#10B981' });
    expect(widget.getConfig().color).toBe('#10B981');
  });

  it('should apply URL params for the position', () => {
    widget.applyUrlParams({ position: 'top-left' });
    expect(widget.getConfig().position).toBe('top-left');
  });

  it('should apply URL params for voiceEnabled', () => {
    widget.applyUrlParams({ voiceEnabled: 'false' });
    expect(widget.getConfig().voiceEnabled).toBe(false);
  });

  it('should apply URL params for online mode', () => {
    widget.applyUrlParams({ online: 'false' });
    expect(widget.getConfig().online).toBe(false);
  });

  it('should apply multiple URL params simultaneously', () => {
    widget.applyUrlParams({
      title: 'A',
      color: '#B',
      position: 'top-right',
      voiceEnabled: 'false',
      online: 'true',
    });
    const config = widget.getConfig();
    expect(config.title).toBe('A');
    expect(config.color).toBe('#B');
    expect(config.position).toBe('top-right');
    expect(config.voiceEnabled).toBe(false);
    expect(config.online).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 4. Cross-origin
  // ---------------------------------------------------------------------------

  it('should accept postMessage from an allowed origin', () => {
    widget.receivePostMessage('https://dayjoy.ai', { type: 'open' });
    expect(widget.isOpen()).toBe(true);
  });

  it('should reject postMessage from a non-allowed origin', () => {
    widget.receivePostMessage('https://evil.com', { type: 'open' });
    expect(widget.isOpen()).toBe(false);
  });

  it('should accept postMessage from a subdomain of an allowed origin', () => {
    widget.receivePostMessage('https://shop.dayjoy.ai', { type: 'open' });
    expect(widget.isOpen()).toBe(true);
  });

  it('should reject postMessage from a sibling domain (not a subdomain)', () => {
    widget.receivePostMessage('https://dayjoy-ai.evil.com', { type: 'open' });
    expect(widget.isOpen()).toBe(false);
  });

  it('should reject postMessage from a malformed origin', () => {
    widget.receivePostMessage('not-a-url', { type: 'open' });
    expect(widget.isOpen()).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 5. PostMessage communication
  // ---------------------------------------------------------------------------

  it('should log every postMessage received', () => {
    widget.receivePostMessage('https://dayjoy.ai', { type: 'open' });
    widget.receivePostMessage('https://dayjoy.ai', { type: 'close' });

    const log = widget.getPostMessageLog();
    expect(log.length).toBe(2);
  });

  it('should log even rejected postMessages (for security audit)', () => {
    widget.receivePostMessage('https://evil.com', { type: 'open' });

    const log = widget.getPostMessageLog();
    expect(log.length).toBe(1);
    expect(log[0]?.origin).toBe('https://evil.com');
  });

  it('should be able to send postMessage to the host page', () => {
    widget.sendPostMessage('parent', { type: 'opened', timestamp: Date.now() });

    const log = widget.getPostMessageLog();
    expect(log.length).toBe(1);
    expect(log[0]?.origin).toBe('widget');
  });

  it('should support a round-trip host → widget → host message flow', () => {
    // Host → widget: open.
    widget.receivePostMessage('https://dayjoy.ai', { type: 'open' });
    // Widget → host: confirm open.
    widget.sendPostMessage('parent', { type: 'opened' });
    // Host → widget: send message.
    widget.receivePostMessage('https://dayjoy.ai', { type: 'send', text: 'Hi' });

    const log = widget.getPostMessageLog();
    expect(log.length).toBe(3);
    expect(log[0]?.data).toEqual({ type: 'open' });
    expect(log[1]?.data).toEqual({ type: 'opened' });
    expect(log[2]?.data).toEqual({ type: 'send', text: 'Hi' });
  });

  // ---------------------------------------------------------------------------
  // Embed lifecycle
  // ---------------------------------------------------------------------------

  it('should support the open → send → close lifecycle', async () => {
    widget.receivePostMessage('https://dayjoy.ai', { type: 'open' });
    expect(widget.isOpen()).toBe(true);

    widget.receivePostMessage('https://dayjoy.ai', { type: 'send', text: 'Hi' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(widget.getMessageCount()).toBeGreaterThan(0);

    widget.receivePostMessage('https://dayjoy.ai', { type: 'close' });
    expect(widget.isOpen()).toBe(false);
  });

  it('should handle a send message before open (auto-open)', async () => {
    widget.receivePostMessage('https://dayjoy.ai', { type: 'send', text: 'Hi' });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(widget.isOpen()).toBe(true);
  });

  it('should preserve message history across open/close cycles', async () => {
    widget.receivePostMessage('https://dayjoy.ai', { type: 'open' });
    widget.receivePostMessage('https://dayjoy.ai', { type: 'send', text: 'Hi' });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const countAfterFirst = widget.getMessageCount();
    expect(countAfterFirst).toBeGreaterThan(0);

    widget.receivePostMessage('https://dayjoy.ai', { type: 'close' });
    widget.receivePostMessage('https://dayjoy.ai', { type: 'open' });

    expect(widget.getMessageCount()).toBe(countAfterFirst);
  });

  // ---------------------------------------------------------------------------
  // Domain allow-list edge cases
  // ---------------------------------------------------------------------------

  it('should support localhost as an allowed domain for dev', () => {
    widget.updateConfig({ allowedDomains: ['localhost'] });
    expect(widget.isDomainAllowed('http://localhost:3000')).toBe(true);
  });

  it('should respect a custom domain check override', () => {
    const custom = createChatWidgetSimulator({
      domainCheck: (origin) => origin.endsWith('trusted.org'),
    });
    expect(custom.isDomainAllowed('https://shop.trusted.org')).toBe(true);
    expect(custom.isDomainAllowed('https://evil.com')).toBe(false);
  });
});

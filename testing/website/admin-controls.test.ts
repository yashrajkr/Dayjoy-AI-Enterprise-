/**
 * Website AI — Admin Controls Tests
 * ==================================
 *
 * Validates the **admin widget settings** of the Dayjoy Website AI
 * chat widget — the controls in the admin dashboard that let operators
 * customise the widget's appearance + behaviour:
 *
 *   1. **Title.** Change the widget title → reflected in the widget
 *      header.
 *   2. **Color.** Change the brand color → reflected in the launcher
 *      + header.
 *   3. **Position.** Change the position (bottom-right / bottom-left /
 *      top-right / top-left) → reflected in the widget placement.
 *   4. **Voice toggle.** Enable/disable voice input → reflected in the
 *      mic button visibility.
 *   5. **Online/offline mode.** Toggle online mode → reflected in the
 *      AI response behaviour.
 *   6. **Allowed domains.** Configure the domain allow-list → only
 *      allowed origins can embed the widget.
 *
 * Uses `createChatWidgetSimulator()` with the `updateConfig()` and
 * `applyUrlParams()` helpers.
 *
 * Reference: `apps/admin-dashboard/src/app/(dashboard)/whatsapp/settings/page.tsx`,
 *            `apps/website-chat/` (production widget).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createChatWidgetSimulator, DEFAULT_WIDGET_CONFIG } from '../helpers/website-chat-simulator';

describe('Website AI Admin Controls', () => {
  let widget: ReturnType<typeof createChatWidgetSimulator>;

  beforeEach(() => {
    widget = createChatWidgetSimulator();
  });

  // ---------------------------------------------------------------------------
  // 1. Title
  // ---------------------------------------------------------------------------

  it('should default to the standard widget title', () => {
    expect(widget.getConfig().title).toBe(DEFAULT_WIDGET_CONFIG.title);
  });

  it('should reflect a title change in the config', () => {
    widget.updateConfig({ title: 'Dayjoy Support' });
    expect(widget.getConfig().title).toBe('Dayjoy Support');
  });

  it('should support changing the title multiple times', () => {
    widget.updateConfig({ title: 'First Title' });
    expect(widget.getConfig().title).toBe('First Title');

    widget.updateConfig({ title: 'Second Title' });
    expect(widget.getConfig().title).toBe('Second Title');
  });

  // ---------------------------------------------------------------------------
  // 2. Color
  // ---------------------------------------------------------------------------

  it('should default to the Dayjoy orange brand color', () => {
    expect(widget.getConfig().color).toBe('#F97316');
  });

  it('should reflect a color change in the config', () => {
    widget.updateConfig({ color: '#10B981' }); // green
    expect(widget.getConfig().color).toBe('#10B981');
  });

  it('should accept named CSS colors', () => {
    widget.updateConfig({ color: 'orange' });
    expect(widget.getConfig().color).toBe('orange');
  });

  // ---------------------------------------------------------------------------
  // 3. Position
  // ---------------------------------------------------------------------------

  it('should default to bottom-right position', () => {
    expect(widget.getConfig().position).toBe('bottom-right');
  });

  it('should reflect a position change in the config', () => {
    widget.updateConfig({ position: 'bottom-left' });
    expect(widget.getConfig().position).toBe('bottom-left');
  });

  it('should support all four position options', () => {
    const positions = ['bottom-right', 'bottom-left', 'top-right', 'top-left'] as const;
    positions.forEach((p) => {
      widget.updateConfig({ position: p });
      expect(widget.getConfig().position).toBe(p);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Voice toggle
  // ---------------------------------------------------------------------------

  it('should default to voiceEnabled = true', () => {
    expect(widget.getConfig().voiceEnabled).toBe(true);
  });

  it('should reflect a voiceEnabled change in the config', () => {
    widget.updateConfig({ voiceEnabled: false });
    expect(widget.getConfig().voiceEnabled).toBe(false);
  });

  it('should disable voice recording when voiceEnabled is false', () => {
    widget.updateConfig({ voiceEnabled: false });
    widget.open();

    expect(() => widget.startVoiceRecording()).toThrow(/disabled/i);
  });

  it('should re-enable voice recording when voiceEnabled is toggled back to true', () => {
    widget.updateConfig({ voiceEnabled: false });
    widget.updateConfig({ voiceEnabled: true });
    widget.open();

    expect(() => widget.startVoiceRecording()).not.toThrow();
    expect(widget.isVoiceRecording()).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 5. Online/offline mode
  // ---------------------------------------------------------------------------

  it('should default to online mode', () => {
    expect(widget.getConfig().online).toBe(true);
  });

  it('should reflect an online mode change in the config', () => {
    widget.updateConfig({ online: false });
    expect(widget.getConfig().online).toBe(false);
  });

  it('should respond with an offline message when online=false', async () => {
    widget.updateConfig({ online: false });
    widget.open();
    await widget.sendMessage('Hi');

    const last = widget.getLastMessage();
    expect(last?.content).toMatch(/offline|leave your contact|24 hours/i);
  });

  it('should resume AI responses when online mode is re-enabled', async () => {
    widget.updateConfig({ online: false });
    widget.updateConfig({ online: true });
    widget.open();
    await widget.sendMessage('Hi');

    const last = widget.getLastMessage();
    expect(last?.content).toMatch(/hello|welcome|dayjoy/i);
  });

  // ---------------------------------------------------------------------------
  // 6. Allowed domains
  // ---------------------------------------------------------------------------

  it('should default to the standard allowed domains', () => {
    expect(widget.getConfig().allowedDomains).toContain('dayjoy.ai');
  });

  it('should allow the configured domain', () => {
    widget.updateConfig({ allowedDomains: ['dayjoy.ai', 'partner.com'] });
    expect(widget.isDomainAllowed('https://dayjoy.ai')).toBe(true);
    expect(widget.isDomainAllowed('https://partner.com')).toBe(true);
  });

  it('should block a non-allowed domain', () => {
    widget.updateConfig({ allowedDomains: ['dayjoy.ai'] });
    expect(widget.isDomainAllowed('https://evil.com')).toBe(false);
  });

  it('should allow subdomains of an allowed domain', () => {
    widget.updateConfig({ allowedDomains: ['dayjoy.ai'] });
    expect(widget.isDomainAllowed('https://shop.dayjoy.ai')).toBe(true);
    expect(widget.isDomainAllowed('https://support.dayjoy.ai')).toBe(true);
  });

  it('should reject invalid origin URLs', () => {
    expect(widget.isDomainAllowed('not-a-url')).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // URL-param configuration (used by the embed script)
  // ---------------------------------------------------------------------------

  it('should apply URL params for title', () => {
    widget.applyUrlParams({ title: 'Dayjoy Sales' });
    expect(widget.getConfig().title).toBe('Dayjoy Sales');
  });

  it('should apply URL params for color', () => {
    widget.applyUrlParams({ color: '#FF0000' });
    expect(widget.getConfig().color).toBe('#FF0000');
  });

  it('should apply URL params for position', () => {
    widget.applyUrlParams({ position: 'bottom-left' });
    expect(widget.getConfig().position).toBe('bottom-left');
  });

  it('should apply URL params for voiceEnabled (false)', () => {
    widget.applyUrlParams({ voiceEnabled: 'false' });
    expect(widget.getConfig().voiceEnabled).toBe(false);
  });

  it('should apply URL params for voiceEnabled (true)', () => {
    widget.updateConfig({ voiceEnabled: false });
    widget.applyUrlParams({ voiceEnabled: 'true' });
    expect(widget.getConfig().voiceEnabled).toBe(true);
  });

  it('should apply URL params for online mode', () => {
    widget.applyUrlParams({ online: 'false' });
    expect(widget.getConfig().online).toBe(false);

    widget.applyUrlParams({ online: 'true' });
    expect(widget.getConfig().online).toBe(true);
  });

  it('should apply multiple URL params at once', () => {
    widget.applyUrlParams({
      title: 'Custom',
      color: '#00FF00',
      position: 'top-right',
      voiceEnabled: 'false',
    });
    const config = widget.getConfig();
    expect(config.title).toBe('Custom');
    expect(config.color).toBe('#00FF00');
    expect(config.position).toBe('top-right');
    expect(config.voiceEnabled).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Combined admin control flow
  // ---------------------------------------------------------------------------

  it('should support a full admin reconfiguration flow', () => {
    widget.updateConfig({
      title: 'Dayjoy Partner Support',
      color: '#3B82F6',
      position: 'bottom-left',
      voiceEnabled: false,
      online: true,
      allowedDomains: ['partner.com'],
      welcomeMessage: 'Welcome to Partner Support!',
      placeholder: 'Ask us anything...',
    });

    const config = widget.getConfig();
    expect(config.title).toBe('Dayjoy Partner Support');
    expect(config.color).toBe('#3B82F6');
    expect(config.position).toBe('bottom-left');
    expect(config.voiceEnabled).toBe(false);
    expect(config.online).toBe(true);
    expect(config.allowedDomains).toEqual(['partner.com']);
    expect(config.welcomeMessage).toBe('Welcome to Partner Support!');
    expect(config.placeholder).toBe('Ask us anything...');
  });
});

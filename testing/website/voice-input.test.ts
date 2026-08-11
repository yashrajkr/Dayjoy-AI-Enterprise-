/**
 * Website AI — Voice Input Tests
 * ===============================
 *
 * Validates the **voice input** feature (Web Speech API) of the
 * Dayjoy Website AI chat widget:
 *
 *   1. **Mic toggle.** Clicking the mic button starts recording; clicking
 *      again stops it.
 *   2. **Speech → text.** While recording, partial transcripts appear
 *      in the input box.
 *   3. **Finalize.** Stopping the recording finalises the transcript
 *      and places it in the input box.
 *   4. **Send.** The finalised transcript can be sent as a message.
 *   5. **Disabled state.** When `voiceEnabled` is false, the mic button
 *      is hidden / disabled.
 *
 * The Web Speech API isn't available in Vitest's jsdom environment, so
 * the simulator mocks it via `startVoiceRecording()` /
 * `pushVoiceTranscript()` / `stopVoiceRecording()`.
 *
 * Reference: Web Speech API spec
 *            (https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API),
 *            `apps/website-chat/` (production widget).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createChatWidgetSimulator } from '../helpers/website-chat-simulator';

describe('Website AI Voice Input', () => {
  let widget: ReturnType<typeof createChatWidgetSimulator>;

  beforeEach(() => {
    widget = createChatWidgetSimulator();
  });

  // ---------------------------------------------------------------------------
  // 1. Mic toggle
  // ---------------------------------------------------------------------------

  it('should start recording when the mic is clicked', () => {
    widget.open();
    expect(widget.isVoiceRecording()).toBe(false);

    widget.startVoiceRecording();
    expect(widget.isVoiceRecording()).toBe(true);
  });

  it('should stop recording when the mic is clicked again', () => {
    widget.open();
    widget.startVoiceRecording();
    expect(widget.isVoiceRecording()).toBe(true);

    widget.stopVoiceRecording();
    expect(widget.isVoiceRecording()).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 2. Speech → text (partial transcripts)
  // ---------------------------------------------------------------------------

  it('should accumulate partial transcripts during recording', () => {
    widget.open();
    widget.startVoiceRecording();

    widget.pushVoiceTranscript('Hello');
    expect(widget.getVoiceTranscript()).toBe('Hello');

    widget.pushVoiceTranscript('world');
    expect(widget.getVoiceTranscript()).toBe('Hello world');
  });

  it('should accumulate multi-word partial transcripts', () => {
    widget.open();
    widget.startVoiceRecording();

    widget.pushVoiceTranscript('Tell me');
    widget.pushVoiceTranscript('about');
    widget.pushVoiceTranscript('the products');

    expect(widget.getVoiceTranscript()).toBe('Tell me about the products');
  });

  // ---------------------------------------------------------------------------
  // 3. Finalize
  // ---------------------------------------------------------------------------

  it('should finalize the transcript when recording stops', () => {
    widget.open();
    widget.startVoiceRecording();
    widget.pushVoiceTranscript('Hello');
    widget.pushVoiceTranscript('there');

    const transcript = widget.stopVoiceRecording();
    expect(transcript).toBe('Hello there');
  });

  it('should clear the in-progress transcript after finalizing', () => {
    widget.open();
    widget.startVoiceRecording();
    widget.pushVoiceTranscript('Hi');

    widget.stopVoiceRecording();
    expect(widget.getVoiceTranscript()).toBe('');
  });

  it('should return an empty string if no speech was captured', () => {
    widget.open();
    widget.startVoiceRecording();
    const transcript = widget.stopVoiceRecording();
    expect(transcript).toBe('');
  });

  // ---------------------------------------------------------------------------
  // 4. Send the finalised transcript
  // ---------------------------------------------------------------------------

  it('should send the finalised transcript as a message', async () => {
    widget.open();
    widget.startVoiceRecording();
    widget.pushVoiceTranscript('What');
    widget.pushVoiceTranscript('is the return policy?');
    const transcript = widget.stopVoiceRecording();

    await widget.sendMessage(transcript);

    const messages = widget.getMessages();
    const userMsg = messages.find((m) => m.role === 'user');
    expect(userMsg?.content).toBe('What is the return policy?');
  });

  it('should get an AI response for the voice-originated message', async () => {
    widget.open();
    widget.startVoiceRecording();
    widget.pushVoiceTranscript('What is the return policy?');
    const transcript = widget.stopVoiceRecording();

    await widget.sendMessage(transcript);

    const last = widget.getLastMessage();
    expect(last?.role).toBe('assistant');
    expect(last?.content).toMatch(/return policy|7-day|refund/i);
  });

  // ---------------------------------------------------------------------------
  // 5. Disabled state
  // ---------------------------------------------------------------------------

  it('should throw when startVoiceRecording is called while voice is disabled', () => {
    widget = createChatWidgetSimulator({ config: { voiceEnabled: false } });
    widget.open();

    expect(() => widget.startVoiceRecording()).toThrow(/disabled/i);
  });

  it('should not record when voice is disabled', () => {
    widget = createChatWidgetSimulator({ config: { voiceEnabled: false } });
    widget.open();

    expect(widget.isVoiceRecording()).toBe(false);
  });

  it('should expose the voiceEnabled flag in the config', () => {
    expect(widget.getConfig().voiceEnabled).toBe(true);

    widget.updateConfig({ voiceEnabled: false });
    expect(widget.getConfig().voiceEnabled).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  it('should ignore pushVoiceTranscript calls when not recording', () => {
    widget.open();
    widget.pushVoiceTranscript('Hello'); // ignored
    expect(widget.getVoiceTranscript()).toBe('');
  });

  it('should handle stopVoiceRecording when not recording (no-op)', () => {
    widget.open();
    const transcript = widget.stopVoiceRecording();
    expect(transcript).toBe('');
  });

  it('should support multiple record → stop cycles', () => {
    widget.open();

    widget.startVoiceRecording();
    widget.pushVoiceTranscript('first');
    expect(widget.stopVoiceRecording()).toBe('first');

    widget.startVoiceRecording();
    widget.pushVoiceTranscript('second');
    expect(widget.stopVoiceRecording()).toBe('second');
  });

  it('should not leak transcript state between record cycles', () => {
    widget.open();
    widget.startVoiceRecording();
    widget.pushVoiceTranscript('first');
    widget.stopVoiceRecording();

    widget.startVoiceRecording();
    expect(widget.getVoiceTranscript()).toBe('');
  });
});

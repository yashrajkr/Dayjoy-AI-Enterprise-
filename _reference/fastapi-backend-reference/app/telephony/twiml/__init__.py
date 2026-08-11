"""TwiML generation utilities for the Twilio provider.

TwiML is Twilio's XML-based markup language for controlling calls.
Reference: https://www.twilio.com/docs/voice/twiml

This module builds TwiML strings without requiring the twilio-python SDK
(keeps the dependency tree lean). The TwiML is returned as XML strings
that the FastAPI webhook endpoint sends with Content-Type: text/xml.

Common TwiML verbs:
- <Say>: speak text to the caller (TTS)
- <Play>: play an audio file
- <Dial>: dial another number (transfer / forward)
- <Connect><Stream>: bidirectional audio stream (for AI)
- <Record>: record the caller's voice (voicemail)
- <Hangup>: end the call
- <Pause>: insert silence
- <Gather>: collect DTMF input
- <Redirect>: redirect to another TwiML URL
"""

import xml.sax.saxutils as saxutils
from typing import Any


def _escape(text: str) -> str:
    """XML-escape text content."""
    return saxutils.escape(text, {'"': "&quot;"})


def _attr(name: str, value: Any) -> str:
    """Render an XML attribute, skipping None values."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return f' {name}="{"true" if value else "false"}"'
    return f' {name}="{_escape(str(value))}"'


def _attrs(**kwargs: Any) -> str:
    """Render multiple XML attributes from kwargs, skipping None values."""
    return "".join(_attr(k, v) for k, v in kwargs.items() if v is not None)


def say(
    text: str,
    *,
    voice: str = "Polly.Joanna",
    language: str = "en-US",
) -> str:
    """Generate <Say> TwiML (text-to-speech)."""
    return f"<Say{_attrs(voice=voice, language=language)}>{_escape(text)}</Say>"


def play(
    url: str,
    *,
    loop: int | None = None,
) -> str:
    """Generate <Play> TwiML (play an audio file)."""
    return f"<Play{_attrs(loop=loop)}>{_escape(url)}</Play>"


def pause(length: int = 1) -> str:
    """Generate <Pause> TwiML (silence)."""
    return f"<Pause{_attrs(length=length)}/>"


def hangup() -> str:
    """Generate <Hangup> TwiML."""
    return "<Hangup/>"


def reject(reason: str = "busy") -> str:
    """Generate <Reject> TwiML (reject inbound call)."""
    return f"<Reject{_attrs(reason=reason)}/>"


def dial(
    to_number: str,
    *,
    timeout: int | None = None,
    record: bool | None = None,
    caller_id: str | None = None,
    method: str | None = None,
    action: str | None = None,
) -> str:
    """Generate <Dial> TwiML (transfer / forward to another number)."""
    return (
        f"<Dial{_attrs(timeout=timeout, record=record, callerId=caller_id, method=method, action=action)}>"
        f"{_escape(to_number)}"
        f"</Dial>"
    )


def connect_stream(
    websocket_url: str,
    *,
    name: str | None = None,
    **params: Any,
) -> str:
    """Generate <Connect><Stream> TwiML for bidirectional audio streaming.

    The websocket_url should be a wss:// URL (or ws:// for dev).
    Additional params are sent as <Parameter> children of <Stream>.
    """
    params_xml = "".join(
        f'<Parameter name="{_escape(k)}" value="{_escape(str(v))}"/>'
        for k, v in params.items()
        if v is not None
    )
    return (
        f"<Connect>"
        f'<Stream{_attrs(url=websocket_url, name=name)}>'
        f"{params_xml}"
        f"</Stream>"
        f"</Connect>"
    )


def record(
    *,
    action: str | None = None,
    method: str | None = None,
    timeout: int | None = None,
    max_length: int | None = None,
    transcribe: bool | None = None,
    transcribe_callback: str | None = None,
    play_beep: bool | None = None,
) -> str:
    """Generate <Record> TwiML (voicemail / message recording)."""
    record_attrs = _attrs(
        action=action,
        method=method,
        timeout=timeout,
        maxLength=max_length,
        transcribe=transcribe,
        transcribeCallback=transcribe_callback,
        playBeep=play_beep,
    )
    return f"<Record{record_attrs}/>"


def gather(
    *,
    action: str | None = None,
    method: str | None = None,
    num_digits: int | None = None,
    timeout: int | None = None,
    finish_on_key: str | None = None,
    nested: str = "",
) -> str:
    """Generate <Gather> TwiML (collect DTMF input).

    The `nested` string is placed inside <Gather> (e.g., a <Say> prompt).
    """
    gather_attrs = _attrs(
        action=action,
        method=method,
        numDigits=num_digits,
        timeout=timeout,
        finishOnKey=finish_on_key,
    )
    return f"<Gather{gather_attrs}>{nested}</Gather>"


def redirect(url: str, *, method: str | None = None) -> str:
    """Generate <Redirect> TwiML."""
    return f"<Redirect{_attrs(url=url, method=method)}>{_escape(url)}</Redirect>"


def response(*verbs: str) -> str:
    """Wrap TwiML verbs in a <Response> element and return the full XML document."""
    body = "".join(verbs)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f"<Response>{body}</Response>"
    )


def connect_to_ai(
    ai_websocket_url: str,
    *,
    greeting_text: str | None = None,
    recording_enabled: bool = True,
    recording_status_callback: str | None = None,
    session_id: str | None = None,
    organization_id: str | None = None,
    assistant_id: str | None = None,
) -> str:
    """Generate TwiML that connects the call to the AI media stream.

    Flow:
    1. Optional: <Say> greeting
    2. Optional: <Start> recording (status callback)
    3. <Connect><Stream> to the AI media stream WebSocket

    The WebSocket URL receives the caller's audio (mulaw 8kHz) and sends
    back AI-generated audio for TTS playback to the caller.
    """
    verbs: list[str] = []
    if greeting_text:
        verbs.append(say(greeting_text, voice="Polly.Joanna", language="en-US"))
    if recording_enabled and recording_status_callback:
        # Use <Start><Record> for full-call recording with status callback
        record_attrs = _attrs(
            recordingStatusCallback=recording_status_callback,
            action=recording_status_callback,
        )
        verbs.append(f"<Start><Record{record_attrs}/></Start>")
    # Connect to AI media stream with session context
    verbs.append(
        connect_stream(
            ai_websocket_url,
            name="ai_stream",
            session_id=session_id,
            organization_id=organization_id,
            assistant_id=assistant_id,
        )
    )
    return response(*verbs)


def forward_to_number(
    to_number: str,
    *,
    timeout: int = 30,
    record: bool = False,
    caller_id: str | None = None,
    greeting_text: str | None = None,
) -> str:
    """Generate TwiML that forwards the call to another number."""
    verbs: list[str] = []
    if greeting_text:
        verbs.append(say(greeting_text, voice="Polly.Joanna", language="en-US"))
    verbs.append(dial(to_number, timeout=timeout, record=record, caller_id=caller_id))
    return response(*verbs)


def voicemail(
    *,
    action_url: str,
    max_duration: int = 120,
    greeting: str = "Please leave a message after the tone.",
    transcribe: bool = True,
    transcribe_callback: str | None = None,
) -> str:
    """Generate TwiML for voicemail (record a message)."""
    verbs: list[str] = [
        say(greeting, voice="Polly.Joanna", language="en-US"),
        record(
            action=action_url,
            method="POST",
            timeout=10,
            max_length=max_duration,
            transcribe=transcribe,
            transcribe_callback=transcribe_callback,
            play_beep=True,
        ),
        say("We didn't receive any input. Goodbye.", voice="Polly.Joanna", language="en-US"),
        hangup(),
    ]
    return response(*verbs)


def reject_busy() -> str:
    """Generate TwiML that rejects the call with a busy signal."""
    return response(reject(reason="busy"))


def say_and_hangup(text: str, *, voice: str = "Polly.Joanna", language: str = "en-US") -> str:
    """Generate TwiML that speaks a message then hangs up."""
    return response(say(text, voice=voice, language=language), hangup())


# ===== Top-level convenience functions (used by the Twilio provider adapter) =====


def generate_dial_twiml(
    to_number: str,
    *,
    timeout: int = 30,
    record: bool = False,
    caller_id: str | None = None,
) -> str:
    """Generate TwiML to dial (transfer/forward) a call."""
    return forward_to_number(
        to_number, timeout=timeout, record=record, caller_id=caller_id
    )


def generate_say_twiml(
    text: str,
    *,
    voice: str = "Polly.Joanna",
    language: str = "en-US",
) -> str:
    """Generate TwiML to speak text to the caller (TTS)."""
    return response(say(text, voice=voice, language=language))


def generate_hangup_twiml() -> str:
    """Generate TwiML to hang up the call."""
    return response(hangup())


__all__ = [
    "connect_stream",
    "connect_to_ai",
    "dial",
    "forward_to_number",
    "gather",
    "generate_dial_twiml",
    "generate_hangup_twiml",
    "generate_say_twiml",
    "hangup",
    "pause",
    "play",
    "record",
    "redirect",
    "reject",
    "reject_busy",
    "response",
    "say",
    "say_and_hangup",
    "voicemail",
]

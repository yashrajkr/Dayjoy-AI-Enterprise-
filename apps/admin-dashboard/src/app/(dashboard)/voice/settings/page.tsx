"use client";

import { useEffect, useState } from "react";
import {
  Settings as SettingsIcon,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle,
  Phone,
  Webhook,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { voiceApi, type VoiceSettings } from "@/lib/api";

export default function VoiceSettingsPage() {
  const [settings, setSettings] = useState<VoiceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Editable
  const [provider, setProvider] = useState("vapi");
  const [defaultVoice, setDefaultVoice] = useState("aria");
  const [defaultLanguage, setDefaultLanguage] = useState("en");
  const [defaultStt, setDefaultStt] = useState("deepgram");
  const [defaultTts, setDefaultTts] = useState("11labs");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [outboundPhone, setOutboundPhone] = useState("");
  const [enableRecording, setEnableRecording] = useState(true);
  const [enableTranscription, setEnableTranscription] = useState(true);
  const [enableSentiment, setEnableSentiment] = useState(true);
  const [enableBargeIn, setEnableBargeIn] = useState(true);
  const [maxCallDuration, setMaxCallDuration] = useState(1800);

  useEffect(() => {
    (async () => {
      try {
        const s = await voiceApi.getSettings();
        setSettings(s);
        setProvider(s.provider);
        setDefaultVoice(s.default_voice);
        setDefaultLanguage(s.default_language);
        setDefaultStt(s.default_stt_provider);
        setDefaultTts(s.default_tts_provider);
        setWebhookUrl(s.webhook_url || "");
        setWebhookSecret(""); // never expose existing secret
        setOutboundPhone(s.outbound_phone_number || "");
        setEnableRecording(s.enable_recording);
        setEnableTranscription(s.enable_transcription);
        setEnableSentiment(s.enable_sentiment_analysis);
        setEnableBargeIn(s.enable_barge_in);
        setMaxCallDuration(s.max_call_duration);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);
      const updates: Record<string, unknown> = {
        provider,
        default_voice: defaultVoice,
        default_language: defaultLanguage,
        default_stt_provider: defaultStt,
        default_tts_provider: defaultTts,
        enable_recording: enableRecording,
        enable_transcription: enableTranscription,
        enable_sentiment_analysis: enableSentiment,
        enable_barge_in: enableBargeIn,
        max_call_duration: maxCallDuration,
      };
      if (webhookUrl) updates.webhook_url = webhookUrl;
      if (webhookSecret) updates.webhook_secret = webhookSecret;
      if (outboundPhone) updates.outbound_phone_number = outboundPhone;
      const updated = await voiceApi.updateSettings(updates);
      setSettings(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/70" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Voice Settings</h1>
          <p className="text-sm text-muted-foreground">
            Tenant-wide voice AI configuration
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-success/25 bg-success/10 p-3 text-sm text-success">
          <CheckCircle className="h-4 w-4" />
          Settings saved
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <SettingsIcon className="h-5 w-5" />
            Provider Configuration
          </CardTitle>
          <CardDescription>
            The active voice provider for this tenant
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="provider">Voice Provider</Label>
            <select
              id="provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="vapi">Vapi (recommended, fully implemented)</option>
              <option value="retell">Retell AI (stub)</option>
              <option value="bland">Bland AI (stub)</option>
              <option value="livekit">LiveKit (stub)</option>
              <option value="pipecat">Pipecat (stub)</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Only Vapi is fully implemented. Other providers raise NotImplementedError
              when invoked — they can be activated via config when implemented.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="outphone">Outbound Phone Number</Label>
            <Input
              id="outphone"
              value={outboundPhone}
              onChange={(e) => setOutboundPhone(e.target.value)}
              placeholder="+1234567890 (your Vapi number)"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Phone className="h-5 w-5" />
            Defaults
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dvoice">Default Voice</Label>
              <select
                id="dvoice"
                value={defaultVoice}
                onChange={(e) => setDefaultVoice(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="aria">Aria</option>
                <option value="josh">Josh</option>
                <option value="rachel">Rachel</option>
                <option value="brian">Brian</option>
                <option value="adam">Adam</option>
                <option value="serena">Serena</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dlang">Default Language</Label>
              <select
                id="dlang"
                value={defaultLanguage}
                onChange={(e) => setDefaultLanguage(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="en">English</option>
                <option value="hi">Hindi</option>
                <option value="bn">Bengali</option>
                <option value="ta">Tamil</option>
                <option value="te">Telugu</option>
                <option value="mr">Marathi</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dstt">Default STT Provider</Label>
              <select
                id="dstt"
                value={defaultStt}
                onChange={(e) => setDefaultStt(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="deepgram">Deepgram (recommended)</option>
                <option value="assemblyai">AssemblyAI</option>
                <option value="gladia">Gladia</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dtts">Default TTS Provider</Label>
              <select
                id="dtts"
                value={defaultTts}
                onChange={(e) => setDefaultTts(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="11labs">ElevenLabs (recommended)</option>
                <option value="playtech">PlayTech</option>
                <option value="deepgram">Deepgram</option>
                <option value="openai">OpenAI</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Webhook className="h-5 w-5" />
            Webhook Configuration
          </CardTitle>
          <CardDescription>
            Vapi sends call events to this webhook URL. Configure it in the Vapi dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="whurl">Webhook URL</Label>
            <Input
              id="whurl"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://your-domain.com/api/v1/voice/webhook/vapi"
            />
            <p className="text-xs text-muted-foreground">
              Configure this URL in Vapi dashboard → Server URL
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="whsec">Webhook Secret (Server URL Secret)</Label>
            <Input
              id="whsec"
              type="password"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder="•••••••• (leave empty to keep existing)"
            />
            <p className="text-xs text-muted-foreground">
              Optional shared secret sent in <code>X-Vapi-Server-Secret</code> header
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5" />
            Call Behavior
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between rounded-lg border border-white/[0.06] p-3">
            <div>
              <p className="text-sm font-medium">Enable Recording</p>
              <p className="text-xs text-muted-foreground">Record call audio (stored at provider)</p>
            </div>
            <input
              type="checkbox"
              checked={enableRecording}
              onChange={(e) => setEnableRecording(e.target.checked)}
              className="h-4 w-4"
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-white/[0.06] p-3">
            <div>
              <p className="text-sm font-medium">Enable Transcription</p>
              <p className="text-xs text-muted-foreground">Store real-time transcript</p>
            </div>
            <input
              type="checkbox"
              checked={enableTranscription}
              onChange={(e) => setEnableTranscription(e.target.checked)}
              className="h-4 w-4"
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-white/[0.06] p-3">
            <div>
              <p className="text-sm font-medium">Enable Sentiment Analysis</p>
              <p className="text-xs text-muted-foreground">Analyze caller sentiment (post-call)</p>
            </div>
            <input
              type="checkbox"
              checked={enableSentiment}
              onChange={(e) => setEnableSentiment(e.target.checked)}
              className="h-4 w-4"
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-white/[0.06] p-3">
            <div>
              <p className="text-sm font-medium">Enable Barge-in</p>
              <p className="text-xs text-muted-foreground">Allow callers to interrupt assistant</p>
            </div>
            <input
              type="checkbox"
              checked={enableBargeIn}
              onChange={(e) => setEnableBargeIn(e.target.checked)}
              className="h-4 w-4"
            />
          </label>
          <div className="space-y-2">
            <Label htmlFor="maxdur">Max Call Duration (seconds)</Label>
            <Input
              id="maxdur"
              type="number"
              min={60}
              max={7200}
              value={maxCallDuration}
              onChange={(e) => setMaxCallDuration(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Calls auto-hangup after this duration (default: 1800s = 30 min)
            </p>
          </div>
        </CardContent>
      </Card>

      {settings && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Current Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Provider: {settings.provider}</Badge>
              <Badge variant="outline">Voice: {settings.default_voice}</Badge>
              <Badge variant="outline">Lang: {settings.default_language}</Badge>
              <Badge variant="outline">STT: {settings.default_stt_provider}</Badge>
              <Badge variant="outline">TTS: {settings.default_tts_provider}</Badge>
              {settings.inbound_phone_numbers.map((n, i) => (
                <Badge key={i} variant="secondary">Inbound: {n}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

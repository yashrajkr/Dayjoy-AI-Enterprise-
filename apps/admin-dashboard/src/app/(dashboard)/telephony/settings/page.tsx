"use client";

import { useEffect, useState } from "react";
import {
  Settings as SettingsIcon,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle,
  Phone,
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
import { telephonyApi } from "@/lib/api";

export default function TelephonySettingsPage() {
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [provider, setProvider] = useState("twilio");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [enableRecording, setEnableRecording] = useState(true);
  const [recordingFormat, setRecordingFormat] = useState("mp3");
  const [recordingChannels, setRecordingChannels] = useState("dual");
  const [enableVoicemail, setEnableVoicemail] = useState(false);
  const [maxCallDuration, setMaxCallDuration] = useState(1800);

  useEffect(() => {
    (async () => {
      try {
        const s = await telephonyApi.getSettings();
        setSettings(s);
        setProvider(s.provider as string);
        setWebhookUrl(s.webhook_base_url as string || "");
        setEnableRecording(s.enable_recording as boolean);
        setRecordingFormat(s.recording_format as string);
        setRecordingChannels(s.recording_channels as string);
        setEnableVoicemail(s.enable_voicemail as boolean);
        setMaxCallDuration(s.max_call_duration as number);
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
        enable_recording: enableRecording,
        recording_format: recordingFormat,
        recording_channels: recordingChannels,
        enable_voicemail: enableVoicemail,
        max_call_duration: maxCallDuration,
      };
      if (webhookUrl) updates.webhook_base_url = webhookUrl;
      if (webhookSecret) updates.webhook_secret = webhookSecret;
      await telephonyApi.updateSettings(updates);
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
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Telephony Settings</h1>
          <p className="text-sm text-muted-foreground">Tenant-wide telephony configuration</p>
        </div>
        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
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
            <Phone className="h-5 w-5" />
            Provider Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="provider">Telephony Provider</Label>
            <select
              id="provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="twilio">Twilio (fully implemented)</option>
              <option value="exotel">Exotel (stub)</option>
              <option value="plivo">Plivo (stub)</option>
              <option value="knowlarity">Knowlarity (stub)</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Only Twilio is fully implemented. Other providers raise NotImplementedError.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5" />
            Webhook Configuration
          </CardTitle>
          <CardDescription>
            Configure your public webhook URL for Twilio callbacks
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="whurl">Webhook Base URL</Label>
            <Input
              id="whurl"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://your-domain.com"
            />
            <p className="text-xs text-muted-foreground">
              Webhook paths: /api/v1/telephony/webhook/twilio/voice, /status, /recording
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="whsec">Webhook Secret (optional)</Label>
            <Input
              id="whsec"
              type="password"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder="•••••••• (leave empty to keep existing)"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recording &amp; Call Behavior</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between rounded-lg border border-white/[0.06] p-3">
            <div>
              <p className="text-sm font-medium">Enable Recording</p>
              <p className="text-xs text-muted-foreground">Record all calls by default</p>
            </div>
            <input
              type="checkbox"
              checked={enableRecording}
              onChange={(e) => setEnableRecording(e.target.checked)}
              className="h-4 w-4"
            />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rfmt">Recording Format</Label>
              <select
                id="rfmt"
                value={recordingFormat}
                onChange={(e) => setRecordingFormat(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="mp3">MP3 (smaller)</option>
                <option value="wav">WAV (higher quality)</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rch">Recording Channels</Label>
              <select
                id="rch"
                value={recordingChannels}
                onChange={(e) => setRecordingChannels(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="dual">Dual (separate caller/agent)</option>
                <option value="mono">Mono (mixed)</option>
              </select>
            </div>
          </div>
          <label className="flex items-center justify-between rounded-lg border border-white/[0.06] p-3">
            <div>
              <p className="text-sm font-medium">Enable Voicemail</p>
              <p className="text-xs text-muted-foreground">Allow callers to leave voicemail after hours</p>
            </div>
            <input
              type="checkbox"
              checked={enableVoicemail}
              onChange={(e) => setEnableVoicemail(e.target.checked)}
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
              <Badge variant="outline">Provider: {String(settings.provider)}</Badge>
              <Badge variant="outline">Recording: {String(settings.recording_format)}</Badge>
              <Badge variant="outline">Channels: {String(settings.recording_channels)}</Badge>
              <Badge variant="outline">Max Duration: {String(settings.max_call_duration)}s</Badge>
              <Badge variant="outline">Media Stream: {String(settings.enable_media_stream)}</Badge>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

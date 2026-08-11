"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Star,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { voiceApi, type VoiceAssistant } from "@/lib/api";

export default function AssistantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [assistant, setAssistant] = useState<VoiceAssistant | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Editable fields
  const [name, setName] = useState("");
  const [greeting, setGreeting] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [fallbackMessage, setFallbackMessage] = useState("");
  const [endOfCallMessage, setEndOfCallMessage] = useState("");
  const [voice, setVoice] = useState("aria");
  const [language, setLanguage] = useState("en");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(500);
  const [enableRag, setEnableRag] = useState(true);
  const [enableBargeIn, setEnableBargeIn] = useState(true);
  const [silenceTimeout, setSilenceTimeout] = useState(30);
  const [maxCallDuration, setMaxCallDuration] = useState(1800);
  const [escalationPhone, setEscalationPhone] = useState("");
  const [escalationThreshold, setEscalationThreshold] = useState(0.4);

  useEffect(() => {
    (async () => {
      try {
        const a = await voiceApi.getAssistant(id);
        setAssistant(a);
        setName(a.name);
        setGreeting(a.greeting);
        setSystemPrompt(a.system_prompt);
        setFallbackMessage(a.fallback_message);
        setEndOfCallMessage(a.end_of_call_message);
        setVoice(a.voice);
        setLanguage(a.language);
        setTemperature(a.temperature);
        setMaxTokens(a.max_tokens);
        setEnableRag(a.enable_rag);
        setEnableBargeIn(a.enable_barge_in);
        setSilenceTimeout(a.silence_timeout_seconds);
        setMaxCallDuration(a.max_call_duration);
        setEscalationPhone(a.escalation_phone || "");
        setEscalationThreshold(a.escalation_threshold);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load assistant");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);
      await voiceApi.updateAssistant(id, {
        name,
        greeting,
        system_prompt: systemPrompt,
        fallback_message: fallbackMessage,
        end_of_call_message: endOfCallMessage,
        voice,
        language,
        temperature,
        max_tokens: maxTokens,
        enable_rag: enableRag,
        enable_barge_in: enableBargeIn,
        silence_timeout_seconds: silenceTimeout,
        max_call_duration: maxCallDuration,
        escalation_phone: escalationPhone || null,
        escalation_threshold: escalationThreshold,
      });
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

  if (error || !assistant) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error || "Assistant not found"}
        </div>
        <Link href="/voice/assistants">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Assistants
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/voice/assistants"
            className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Assistants
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{assistant.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline" className="capitalize">{assistant.assistant_type}</Badge>
            <Badge variant="outline">{assistant.provider}</Badge>
            <Badge variant="outline">{assistant.voice} · {assistant.voice_provider}</Badge>
            <Badge variant="outline" className="uppercase">{assistant.language}</Badge>
            {assistant.is_default && (
              <Badge className="border border-warning/25 bg-warning/10 text-warning">
                <Star className="mr-1 h-3 w-3" />
                Default
              </Badge>
            )}
            {assistant.provider_assistant_id ? (
              <Badge className="border border-success/25 bg-success/10 text-success">
                <CheckCircle className="mr-1 h-3 w-3" />
                Synced
              </Badge>
            ) : (
              <Badge className="border border-warning/25 bg-warning/10 text-warning">
                Sync Pending
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await voiceApi.syncAssistant(id);
                location.reload();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Sync failed");
              }
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Sync to Provider
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save
          </Button>
        </div>
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
          Saved successfully
        </div>
      )}

      <Tabs defaultValue="prompt">
        <TabsList>
          <TabsTrigger value="prompt">Prompt &amp; Messages</TabsTrigger>
          <TabsTrigger value="voice">Voice &amp; Language</TabsTrigger>
          <TabsTrigger value="behavior">Behavior</TabsTrigger>
          <TabsTrigger value="escalation">Escalation</TabsTrigger>
        </TabsList>

        {/* Prompt tab */}
        <TabsContent value="prompt" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">System Prompt</CardTitle>
              <CardDescription>
                Jinja2 template — variables are auto-filled from session context
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="min-h-[300px] font-mono text-sm"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Available: <code>{"{{ organization_name }}"}</code>, <code>{"{{ caller_name }}"}</code>, <code>{"{{ caller_phone }}"}</code>, <code>{"{{ language }}"}</code>, <code>{"{{ rag_context }}"}</code>, <code>{"{{ assistant_type }}"}</code>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Greeting &amp; Fallbacks</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="greeting">Greeting (first message)</Label>
                <Textarea
                  id="greeting"
                  value={greeting}
                  onChange={(e) => setGreeting(e.target.value)}
                  className="min-h-[60px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fallback">Fallback message (when STT fails)</Label>
                <Textarea
                  id="fallback"
                  value={fallbackMessage}
                  onChange={(e) => setFallbackMessage(e.target.value)}
                  className="min-h-[60px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endcall">End-of-call message</Label>
                <Textarea
                  id="endcall"
                  value={endOfCallMessage}
                  onChange={(e) => setEndOfCallMessage(e.target.value)}
                  className="min-h-[60px]"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Voice tab */}
        <TabsContent value="voice" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Voice Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="voice">Voice</Label>
                  <select
                    id="voice"
                    value={voice}
                    onChange={(e) => setVoice(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="aria">Aria (female, warm)</option>
                    <option value="josh">Josh (male, deep)</option>
                    <option value="rachel">Rachel (female, calm)</option>
                    <option value="brian">Brian (male, friendly)</option>
                    <option value="adam">Adam (male, deep)</option>
                    <option value="serena">Serena (female, professional)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lang">Language</Label>
                  <select
                    id="lang"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
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
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="temp">Temperature ({temperature.toFixed(1)})</Label>
                  <input
                    id="temp"
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxtok">Max Tokens</Label>
                  <Input
                    id="maxtok"
                    type="number"
                    min={50}
                    max={4000}
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="rounded-lg border border-cyan/20 bg-cyan/[0.06] p-3 text-sm text-cyan">
                <strong>STT:</strong> {assistant.stt_provider} ·{" "}
                <strong>TTS:</strong> {assistant.tts_provider} ·{" "}
                <strong>AI:</strong> {assistant.ai_provider || "default"} /{" "}
                {assistant.ai_model || "default"}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Behavior tab */}
        <TabsContent value="behavior" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Call Behavior</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center justify-between rounded-lg border border-white/[0.06] p-3">
                <div>
                  <p className="text-sm font-medium">Enable RAG</p>
                  <p className="text-xs text-muted-foreground">
                    Search the tenant&apos;s knowledge base before responding
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={enableRag}
                  onChange={(e) => setEnableRag(e.target.checked)}
                  className="h-4 w-4"
                />
              </label>
              <label className="flex items-center justify-between rounded-lg border border-white/[0.06] p-3">
                <div>
                  <p className="text-sm font-medium">Enable Barge-in</p>
                  <p className="text-xs text-muted-foreground">
                    Allow callers to interrupt the assistant mid-speech
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={enableBargeIn}
                  onChange={(e) => setEnableBargeIn(e.target.checked)}
                  className="h-4 w-4"
                />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="silence">Silence Timeout (seconds)</Label>
                  <Input
                    id="silence"
                    type="number"
                    value={silenceTimeout}
                    onChange={(e) => setSilenceTimeout(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxdur">Max Call Duration (seconds)</Label>
                  <Input
                    id="maxdur"
                    type="number"
                    value={maxCallDuration}
                    onChange={(e) => setMaxCallDuration(Number(e.target.value))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Escalation tab */}
        <TabsContent value="escalation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Escalation Policy</CardTitle>
              <CardDescription>
                Automatically transfer to a human when confidence is consistently low
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="escphone">Escalation Phone Number</Label>
                <Input
                  id="escphone"
                  value={escalationPhone}
                  onChange={(e) => setEscalationPhone(e.target.value)}
                  placeholder="+1234567890 (leave empty to disable)"
                />
                <p className="text-xs text-muted-foreground">
                  If set, calls will transfer here after 3 consecutive low-confidence turns
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="escthresh">Escalation Threshold ({escalationThreshold.toFixed(2)})</Label>
                <input
                  id="escthresh"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={escalationThreshold}
                  onChange={(e) => setEscalationThreshold(Number(e.target.value))}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Turns with AI confidence below this are considered &quot;low confidence&quot;
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

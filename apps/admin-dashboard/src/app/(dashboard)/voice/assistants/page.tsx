"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Bot,
  Plus,
  Trash2,
  Edit,
  Star,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { voiceApi, type VoiceAssistant } from "@/lib/api";

const assistantTypes = [
  { value: "support", label: "Support" },
  { value: "sales", label: "Sales" },
  { value: "welcome_ivr", label: "Welcome IVR" },
  { value: "callback", label: "Callback" },
  { value: "outbound", label: "Outbound" },
  { value: "survey", label: "Survey" },
];

const voices = [
  { value: "aria", label: "Aria (11labs, female, warm)" },
  { value: "josh", label: "Josh (11labs, male, deep)" },
  { value: "rachel", label: "Rachel (11labs, female, calm)" },
  { value: "brian", label: "Brian (11labs, male, friendly)" },
  { value: "adam", label: "Adam (11labs, male, deep)" },
  { value: "serena", label: "Serena (11labs, female, professional)" },
];

export default function VoiceAssistantsPage() {
  const [assistants, setAssistants] = useState<VoiceAssistant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VoiceAssistant | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);

  // Create form
  const [name, setName] = useState("");
  const [assistantType, setAssistantType] = useState("support");
  const [greeting, setGreeting] = useState("Hello, thank you for calling. How can I help you today?");
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a helpful voice assistant for {{ organization_name }}. Be concise and friendly. Use the knowledge base (rag_context) to answer questions accurately. If you don't know, offer to transfer to a human agent."
  );
  const [voice, setVoice] = useState("aria");
  const [language, setLanguage] = useState("en");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await voiceApi.listAssistants();
      setAssistants(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load assistants");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    try {
      setCreating(true);
      await voiceApi.createAssistant({
        name,
        assistant_type: assistantType,
        greeting,
        system_prompt: systemPrompt,
        voice,
        language,
        sync_to_provider: true,
      });
      setCreateOpen(false);
      setName("");
      setGreeting("Hello, thank you for calling. How can I help you today?");
      setSystemPrompt("You are a helpful voice assistant...");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create assistant");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await voiceApi.deleteAssistant(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleSync = async (assistant: VoiceAssistant) => {
    try {
      setSyncing(assistant.id);
      await voiceApi.syncAssistant(assistant.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Voice Assistants</h1>
          <p className="text-sm text-muted-foreground">
            Configure AI personas for voice calls — each with its own voice, prompt, and escalation policy
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              New Assistant
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Voice Assistant</DialogTitle>
              <DialogDescription>
                The assistant will be synced to Vapi (or the configured provider) on creation.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="name">Assistant Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Support Agent"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="type">Assistant Type</Label>
                  <select
                    id="type"
                    value={assistantType}
                    onChange={(e) => setAssistantType(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {assistantTypes.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
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
              <div className="space-y-2">
                <Label htmlFor="voice">Voice</Label>
                <select
                  id="voice"
                  value={voice}
                  onChange={(e) => setVoice(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {voices.map((v) => (
                    <option key={v.value} value={v.value}>{v.label}</option>
                  ))}
                </select>
              </div>
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
                <Label htmlFor="prompt">System Prompt (Jinja2 template)</Label>
                <Textarea
                  id="prompt"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  className="min-h-[120px] font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Variables: <code>{"{{ organization_name }}"}</code>, <code>{"{{ caller_name }}"}</code>, <code>{"{{ rag_context }}"}</code>
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button
                onClick={handleCreate}
                disabled={creating || !name.trim() || !systemPrompt.trim()}
              >
                {creating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Assistant"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/70" />
        </div>
      ) : assistants.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bot className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">No assistants yet</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Create your first assistant to start handling voice calls
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {assistants.map((a) => (
            <Card key={a.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan/[0.06]">
                      <Bot className="h-5 w-5 text-cyan" />
                    </div>
                    <div>
                      <p className="font-medium">{a.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{a.assistant_type}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {a.is_default && (
                      <Star className="h-4 w-4 text-warning" />
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleSync(a)}
                      disabled={syncing === a.id}
                    >
                      <RefreshCw className={`h-4 w-4 ${syncing === a.id ? "animate-spin" : ""}`} />
                    </Button>
                    <Link href={`/voice/assistants/${a.id}`}>
                      <Button variant="ghost" size="sm">
                        <Edit className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(a)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                  {a.greeting}
                </p>

                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Voice</p>
                    <p className="font-medium">{a.voice}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Language</p>
                    <p className="font-medium uppercase">{a.language}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">RAG</p>
                    <p className="font-medium">{a.enable_rag ? "Enabled" : "Disabled"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Provider Sync</p>
                    <p className="font-medium flex items-center gap-1">
                      {a.provider_assistant_id ? (
                        <>
                          <CheckCircle className="h-3 w-3 text-success" />
                          Synced
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3 w-3 text-warning" />
                          Pending
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-1">
                  <Badge variant="outline">{a.provider}</Badge>
                  <Badge variant="outline">{a.stt_provider}</Badge>
                  <Badge variant="outline">{a.tts_provider}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Assistant</DialogTitle>
            <DialogDescription>
              Delete &quot;{deleteTarget?.name}&quot;? This will also remove it from the provider.
              Existing sessions are retained for audit.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

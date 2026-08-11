"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Bot, Plus, Archive, Copy, Globe, Play, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

interface Agent {
  id: string; name: string; agent_type: string; description: string | null;
  model: string; llm_provider: string; temperature: number;
  is_active: boolean; is_archived: boolean; is_published: boolean;
  version: number; enable_rag: boolean; enable_memory: boolean;
  enable_tool_calling: boolean; created_at: string;
}

export default function AgentsPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("custom");
  const [newDesc, setNewDesc] = useState("");
  const [newModel, setNewModel] = useState("gpt-4o-mini");
  const [newPrompt, setNewPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function loadAgents() {
    setIsLoading(true);
    try {
      const resp = await api.get<{ data: Agent[] }>("/agents-platform/agents");
      setAgents(resp.data);
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || "Could not load agents.");
    } finally { setIsLoading(false); }
  }

  useEffect(() => { loadAgents(); }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault(); setError(null);
    try {
      await api.post("/agents-platform/agents", {
        name: newName, agent_type: newType, description: newDesc || undefined,
        model: newModel, system_prompt: newPrompt || undefined,
      });
      setNewName(""); setNewDesc(""); setNewPrompt(""); setShowCreate(false);
      await loadAgents();
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || "Could not create agent.");
    }
  }

  async function handleArchive(id: string) {
    if (!confirm("Archive this agent?")) return;
    try { await api.post(`/agents-platform/agents/${id}/archive`, {}); await loadAgents(); }
    catch (err: unknown) { setError((err as { message?: string })?.message || "Archive failed."); }
  }

  async function handleClone(id: string) {
    const name = prompt("Name for the cloned agent:");
    if (!name) return;
    try { await api.post(`/agents-platform/agents/${id}/clone`, { new_name: name }); await loadAgents(); }
    catch (err: unknown) { setError((err as { message?: string })?.message || "Clone failed."); }
  }

  const typeColors: Record<string, string> = {
    support: "bg-indigo/15 text-indigo", sales: "bg-success/15 text-success",
    knowledge: "bg-indigo/15 text-indigo", custom: "bg-white/[0.04] text-foreground/80",
    supervisor: "bg-warning/15 text-warning", planner: "bg-warning/15 text-warning",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI Agents</h1>
          <p className="text-sm text-muted-foreground">Create, configure, and manage AI agents</p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)}>
          <Plus className="mr-2 h-4 w-4" /> New Agent
        </Button>
      </div>
      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {showCreate && (
        <Card>
          <CardHeader><CardTitle>Create new agent</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={newName} onChange={(e) => setNewName(e.target.value)} required autoFocus />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Agent type</Label>
                  <select id="type" value={newType} onChange={(e) => setNewType(e.target.value)}
                    className="w-full rounded-md border border-border p-2">
                    <option value="custom">Custom</option>
                    <option value="support">Support</option>
                    <option value="sales">Sales</option>
                    <option value="knowledge">Knowledge</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="planner">Planner</option>
                    <option value="researcher">Researcher</option>
                    <option value="writer">Writer</option>
                    <option value="reviewer">Reviewer</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="desc">Description</Label>
                <Input id="desc" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="What does this agent do?" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                <select id="model" value={newModel} onChange={(e) => setNewModel(e.target.value)}
                  className="w-full rounded-md border border-border p-2">
                  <option value="gpt-4o-mini">GPT-4o Mini (fast, cheap)</option>
                  <option value="gpt-4o">GPT-4o (powerful)</option>
                  <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
                  <option value="claude-3-haiku">Claude 3 Haiku (fast)</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="prompt">System prompt (optional)</Label>
                <textarea id="prompt" value={newPrompt} onChange={(e) => setNewPrompt(e.target.value)}
                  placeholder="You are a helpful assistant that..." className="min-h-[100px] w-full rounded-md border border-border p-2 text-sm" />
              </div>
              <div className="flex gap-2">
                <Button type="submit">Create agent</Button>
                <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : agents.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <Bot className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No agents yet.</p>
          <p className="text-xs text-muted-foreground">Create one to get started.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <Card key={agent.id} className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => router.push(`/agents/${agent.id}`)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Bot className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{agent.name}</p>
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${typeColors[agent.agent_type] || typeColors.custom}`}>
                        {agent.agent_type}
                      </span>
                    </div>
                  </div>
                  {agent.is_published && <Globe className="h-4 w-4 text-success" title="Published" />}
                </div>
                {agent.description && <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{agent.description}</p>}
                <div className="mt-3 flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span>{agent.llm_provider}/{agent.model}</span>
                  <span>v{agent.version}</span>
                  {agent.enable_rag && <span title="RAG">📚</span>}
                  {agent.enable_memory && <span title="Memory">🧠</span>}
                  {agent.enable_tool_calling && <span title="Tools">🔧</span>}
                </div>
                <div className="mt-3 flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="outline" onClick={() => router.push(`/agents/${agent.id}?action=run`)} className="h-7 px-2 text-xs">
                    <Play className="mr-1 h-3 w-3" /> Run
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleClone(agent.id)} className="h-7 px-2 text-xs">
                    <Copy className="mr-1 h-3 w-3" /> Clone
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleArchive(agent.id)} className="h-7 px-2 text-xs text-warning">
                    <Archive className="mr-1 h-3 w-3" /> Archive
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

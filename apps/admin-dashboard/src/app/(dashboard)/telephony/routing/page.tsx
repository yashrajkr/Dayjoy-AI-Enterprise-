"use client";

import { useEffect, useState, useCallback } from "react";
import {
  PhoneForwarded,
  Plus,
  Trash2,
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
import { telephonyApi, type RoutingRule } from "@/lib/api";

export default function RoutingRulesPage() {
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RoutingRule | null>(null);

  const [name, setName] = useState("");
  const [action, setAction] = useState("forward");
  const [priority, setPriority] = useState(100);
  const [conditionsJson, setConditionsJson] = useState('{\n  "caller_phone_prefix": "+1999"\n}');
  const [actionConfigJson, setActionConfigJson] = useState('{\n  "forward_to": "+18889990000"\n}');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await telephonyApi.listRoutingRules();
      setRules(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load routing rules");
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
      let conditions: Record<string, unknown> = {};
      let actionConfig: Record<string, unknown> = {};
      try {
        conditions = JSON.parse(conditionsJson);
      } catch {
        setError("Conditions JSON is invalid");
        return;
      }
      try {
        actionConfig = JSON.parse(actionConfigJson);
      } catch {
        setError("Action config JSON is invalid");
        return;
      }
      await telephonyApi.createRoutingRule({
        name,
        action,
        priority,
        conditions,
        action_config: actionConfig,
      });
      setCreateOpen(false);
      setName("");
      setAction("forward");
      setPriority(100);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create rule");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await telephonyApi.deleteRoutingRule(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const actionColors: Record<string, string> = {
    ai: "border border-cyan/25 bg-cyan/10 text-cyan",
    forward: "bg-warning/15 text-warning",
    voicemail: "border border-indigo/25 bg-indigo/10 text-indigo",
    reject: "border border-destructive/25 bg-destructive/10 text-destructive",
    queue: "bg-cyan-100 text-cyan-800",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Routing Rules</h1>
          <p className="text-sm text-muted-foreground">
            Define how calls are routed based on conditions (lower priority = evaluated first)
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
              New Rule
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Routing Rule</DialogTitle>
              <DialogDescription>
                Rules are evaluated in priority order. First match wins.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="name">Rule Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. VIP Forward" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="action">Action</Label>
                  <select
                    id="action"
                    value={action}
                    onChange={(e) => setAction(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="ai">AI (route to Voice AI)</option>
                    <option value="forward">Forward (dial another number)</option>
                    <option value="voicemail">Voicemail (record message)</option>
                    <option value="reject">Reject (busy signal)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="priority">Priority (lower = higher)</Label>
                  <Input
                    id="priority"
                    type="number"
                    value={priority}
                    onChange={(e) => setPriority(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="conditions">Conditions (JSON)</Label>
                <Textarea
                  id="conditions"
                  value={conditionsJson}
                  onChange={(e) => setConditionsJson(e.target.value)}
                  className="min-h-[100px] font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Keys: caller_phone_prefix, caller_phone_in, business_hours_open, day_of_week, time_of_day, caller_customer_tier
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="config">Action Config (JSON)</Label>
                <Textarea
                  id="config"
                  value={actionConfigJson}
                  onChange={(e) => setActionConfigJson(e.target.value)}
                  className="min-h-[80px] font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  For forward: {`{"forward_to": "+..."}`}. For voicemail: {`{"max_duration": 120}`}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating || !name.trim()}>
                {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create Rule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/70" />
        </div>
      ) : rules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <PhoneForwarded className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">No routing rules configured</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Without rules, calls use the phone number&apos;s default routing strategy
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rules.map((r) => (
            <Card key={r.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">P{r.priority}</Badge>
                      <p className="font-medium">{r.name}</p>
                      <Badge className={actionColors[r.action] || "bg-white/[0.06]"}>
                        {r.action}
                      </Badge>
                    </div>
                    {r.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
                    )}
                    <div className="mt-3 grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <p className="text-muted-foreground">Conditions:</p>
                        <pre className="mt-1 overflow-auto rounded bg-white/[0.03] p-2 text-xs">
                          {JSON.stringify(r.conditions, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Action Config:</p>
                        <pre className="mt-1 overflow-auto rounded bg-white/[0.03] p-2 text-xs">
                          {JSON.stringify(r.action_config, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(r)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Routing Rule</DialogTitle>
            <DialogDescription>
              Delete &quot;{deleteTarget?.name}&quot;? This cannot be undone.
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

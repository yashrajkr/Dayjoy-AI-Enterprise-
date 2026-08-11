"use client";

import { useEffect, useState, useCallback } from "react";
import {
  PhoneIncoming,
  Plus,
  Trash2,
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
import { telephonyApi, type PhoneNumber } from "@/lib/api";

export default function PhoneNumbersPage() {
  const [phones, setPhones] = useState<PhoneNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PhoneNumber | null>(null);

  const [number, setNumber] = useState("");
  const [displayName, setDisplayName] = useState("Main Line");
  const [routingStrategy, setRoutingStrategy] = useState("ai");
  const [forwardTo, setForwardTo] = useState("");
  const [recordingEnabled, setRecordingEnabled] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await telephonyApi.listPhoneNumbers();
      setPhones(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load phone numbers");
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
      await telephonyApi.registerPhoneNumber({
        number,
        display_name: displayName,
        routing_strategy: routingStrategy,
        forward_to_number: forwardTo || null,
        recording_enabled: recordingEnabled,
      });
      setCreateOpen(false);
      setNumber("");
      setDisplayName("Main Line");
      setRoutingStrategy("ai");
      setForwardTo("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register phone number");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await telephonyApi.deletePhoneNumber(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Phone Numbers</h1>
          <p className="text-sm text-muted-foreground">Manage business phone numbers</p>
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
              Register Number
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Register Phone Number</DialogTitle>
              <DialogDescription>
                Enter the E.164 number (e.g. +1234567890). The number must be purchased at your telephony provider first.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="number">Phone Number (E.164)</Label>
                <Input
                  id="number"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  placeholder="+1234567890"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Display Name</Label>
                <Input
                  id="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="routing">Routing Strategy</Label>
                <select
                  id="routing"
                  value={routingStrategy}
                  onChange={(e) => setRoutingStrategy(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="ai">AI (Voice AI handles call)</option>
                  <option value="forward">Forward to another number</option>
                  <option value="voicemail">Voicemail</option>
                  <option value="reject">Reject (busy signal)</option>
                </select>
              </div>
              {routingStrategy === "forward" && (
                <div className="space-y-2">
                  <Label htmlFor="fwd">Forward To</Label>
                  <Input
                    id="fwd"
                    value={forwardTo}
                    onChange={(e) => setForwardTo(e.target.value)}
                    placeholder="+1987654321"
                  />
                </div>
              )}
              <label className="flex items-center justify-between rounded-lg border border-white/[0.06] p-3">
                <div>
                  <p className="text-sm font-medium">Enable Recording</p>
                  <p className="text-xs text-muted-foreground">Record all calls to this number</p>
                </div>
                <input
                  type="checkbox"
                  checked={recordingEnabled}
                  onChange={(e) => setRecordingEnabled(e.target.checked)}
                  className="h-4 w-4"
                />
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating || !number.trim()}>
                {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Register
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/70" />
        </div>
      ) : phones.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <PhoneIncoming className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">No phone numbers registered</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {phones.map((p) => (
            <Card key={p.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-lg font-bold">{p.number}</p>
                    <p className="text-xs text-muted-foreground">{p.display_name}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteTarget(p)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Routing</p>
                    <Badge variant="secondary">{p.routing_strategy}</Badge>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Provider</p>
                    <p className="font-medium capitalize">{p.provider_type}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Recording</p>
                    <p className="font-medium">{p.recording_enabled ? "On" : "Off"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <p className="font-medium flex items-center gap-1">
                      {p.is_verified ? (
                        <><CheckCircle className="h-3 w-3 text-success" /> Verified</>
                      ) : (
                        <><XCircle className="h-3 w-3 text-warning" /> Pending</>
                      )}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  <Badge variant="outline">{p.country_code}</Badge>
                  <Badge variant="outline">{p.number_type}</Badge>
                  {p.forward_to_number && (
                    <Badge variant="outline">→ {p.forward_to_number}</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Phone Number</DialogTitle>
            <DialogDescription>
              Delete &quot;{deleteTarget?.number}&quot;? This soft-deletes the number. Existing call records are retained.
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

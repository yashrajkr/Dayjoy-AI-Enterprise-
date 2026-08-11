"use client";

import { useEffect, useState, useCallback } from "react";
import {
  MessageCircle,
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
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
import {
  whatsappApi,
  type WhatsAppAccount,
  type WhatsAppNumber,
} from "@/lib/api";

export default function WhatsAppAccountsPage() {
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [numbers, setNumbers] = useState<WhatsAppNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [numberModal, setNumberModal] = useState<WhatsAppAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WhatsAppAccount | null>(null);

  // Create form
  const [name, setName] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful WhatsApp assistant. Be concise and friendly.");
  const [greeting, setGreeting] = useState("Hello! 👋 Thanks for reaching out. How can I help you today?");
  const [enableRag, setEnableRag] = useState(true);
  const [autoReply, setAutoReply] = useState(true);
  const [creating, setCreating] = useState(false);

  // Number form
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [displayPhone, setDisplayPhone] = useState("");
  const [displayName, setDisplayName] = useState("WhatsApp Line");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [accts, nums] = await Promise.all([
        whatsappApi.listAccounts(),
        whatsappApi.listNumbers(),
      ]);
      setAccounts(accts);
      setNumbers(nums);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load accounts");
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
      await whatsappApi.connectAccount({
        name,
        business_account_id: businessAccountId,
        access_token: accessToken,
        verify_token: verifyToken,
        app_secret: appSecret || undefined,
        system_prompt: systemPrompt,
        greeting_message: greeting,
        enable_rag: enableRag,
        auto_reply_enabled: autoReply,
      });
      setCreateOpen(false);
      setName(""); setBusinessAccountId(""); setAccessToken("");
      setVerifyToken(""); setAppSecret("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect account");
    } finally {
      setCreating(false);
    }
  };

  const handleRegisterNumber = async () => {
    if (!numberModal) return;
    try {
      await whatsappApi.registerNumber({
        account_id: numberModal.id,
        phone_number_id: phoneNumberId,
        display_phone_number: displayPhone,
        display_name: displayName,
      });
      setNumberModal(null);
      setPhoneNumberId(""); setDisplayPhone(""); setDisplayName("WhatsApp Line");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register number");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await whatsappApi.deleteAccount(deleteTarget.id);
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
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">WhatsApp Accounts</h1>
          <p className="text-sm text-muted-foreground">Connect Meta WhatsApp Business accounts</p>
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
              Connect Account
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Connect WhatsApp Business Account</DialogTitle>
              <DialogDescription>
                Enter your Meta WhatsApp Business Cloud API credentials.
                Get them from developers.facebook.com → your app → WhatsApp.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="name">Account Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sales WhatsApp" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="waba">WhatsApp Business Account ID</Label>
                  <Input id="waba" value={businessAccountId} onChange={(e) => setBusinessAccountId(e.target.value)} placeholder="123456789012345" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="verify">Verify Token (your choice)</Label>
                  <Input id="verify" value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} placeholder="my_verify_token_123" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="token">Access Token (System User)</Label>
                <Input id="token" type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="EAAG..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="secret">App Secret (for webhook verification)</Label>
                <Input id="secret" type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} placeholder="Optional but recommended" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prompt">System Prompt</Label>
                <Textarea id="prompt" value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} className="min-h-[80px]" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="greeting">Greeting Message</Label>
                <Textarea id="greeting" value={greeting} onChange={(e) => setGreeting(e.target.value)} className="min-h-[60px]" />
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={enableRag} onChange={(e) => setEnableRag(e.target.checked)} className="h-4 w-4" />
                  Enable RAG (knowledge base)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={autoReply} onChange={(e) => setAutoReply(e.target.checked)} className="h-4 w-4" />
                  Auto-reply with greeting
                </label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating || !name || !businessAccountId || !accessToken || !verifyToken}>
                {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Connect
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/70" />
        </div>
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageCircle className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">No WhatsApp accounts connected</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {accounts.map((a) => {
            const accountNumbers = numbers.filter((n) => n.account_id === a.id);
            return (
              <Card key={a.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
                        <MessageCircle className="h-5 w-5 text-success" />
                      </div>
                      <div>
                        <p className="font-medium">{a.name}</p>
                        <p className="text-xs text-muted-foreground">WABA: {a.business_account_id}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setNumberModal(a)}>
                        <Phone className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(a)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Status</p>
                      <p className="font-medium flex items-center gap-1">
                        {a.is_verified ? (
                          <><CheckCircle className="h-3 w-3 text-success" /> Verified</>
                        ) : (
                          <><XCircle className="h-3 w-3 text-warning" /> Pending</>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Numbers</p>
                      <p className="font-medium">{accountNumbers.length}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">RAG</p>
                      <p className="font-medium">{a.enable_rag ? "Enabled" : "Disabled"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Auto-reply</p>
                      <p className="font-medium">{a.auto_reply_enabled ? "On" : "Off"}</p>
                    </div>
                  </div>
                  {accountNumbers.length > 0 && (
                    <div className="mt-3 border-t pt-3">
                      <p className="text-xs text-muted-foreground mb-1">Phone Numbers:</p>
                      <div className="space-y-1">
                        {accountNumbers.map((n) => (
                          <div key={n.id} className="flex items-center justify-between text-xs">
                            <span className="font-medium">{n.display_phone_number}</span>
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground">{n.display_name}</span>
                              {n.is_verified && <CheckCircle className="h-3 w-3 text-success" />}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Register number dialog */}
      <Dialog open={!!numberModal} onOpenChange={(open) => !open && setNumberModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register Phone Number</DialogTitle>
            <DialogDescription>
              Enter the phone number ID from Meta. Get it from developers.facebook.com →
              your app → WhatsApp → Phone Numbers.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="pnid">Phone Number ID</Label>
              <Input id="pnid" value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} placeholder="123456789012345" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dpn">Display Phone Number (E.164)</Label>
              <Input id="dpn" value={displayPhone} onChange={(e) => setDisplayPhone(e.target.value)} placeholder="+1234567890" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dn">Display Name</Label>
              <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNumberModal(null)}>Cancel</Button>
            <Button onClick={handleRegisterNumber} disabled={!phoneNumberId || !displayPhone}>
              Register
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Account</DialogTitle>
            <DialogDescription>
              Delete &quot;{deleteTarget?.name}&quot;? This deactivates the account. Messages are retained.
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

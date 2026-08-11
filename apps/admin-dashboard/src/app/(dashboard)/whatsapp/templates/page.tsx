"use client";

import { useEffect, useState, useCallback } from "react";
import {
  FileText,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  RefreshCw,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { whatsappApi, type WhatsAppAccount, type WhatsAppTemplate } from "@/lib/api";

const statusColors: Record<string, string> = {
  approved: "border border-success/25 bg-success/10 text-success",
  pending: "border border-warning/25 bg-warning/10 text-warning",
  rejected: "border border-destructive/25 bg-destructive/10 text-destructive",
  draft: "border border-white/10 bg-white/[0.06] text-muted-foreground",
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WhatsAppTemplate | null>(null);

  const [accountId, setAccountId] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("MARKETING");
  const [bodyText, setBodyText] = useState("");
  const [language, setLanguage] = useState("en");
  const [footerText, setFooterText] = useState("");
  const [submitToMeta, setSubmitToMeta] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [tmpls, accts] = await Promise.all([
        whatsappApi.listTemplates(),
        whatsappApi.listAccounts(),
      ]);
      setTemplates(tmpls);
      setAccounts(accts);
      if (accts.length > 0 && !accountId) setAccountId(accts[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    try {
      setCreating(true);
      await whatsappApi.createTemplate({
        account_id: accountId,
        name,
        category,
        body_text: bodyText,
        language,
        footer_text: footerText || undefined,
        submit_to_meta: submitToMeta,
      });
      setCreateOpen(false);
      setName(""); setBodyText(""); setFooterText(""); setSubmitToMeta(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create template");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await whatsappApi.deleteTemplate(deleteTarget.id);
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
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Templates</h1>
          <p className="text-sm text-muted-foreground">Meta-approved message templates for proactive messaging</p>
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
            <Button size="sm" disabled={accounts.length === 0}>
              <Plus className="mr-2 h-4 w-4" />
              New Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="account">Account</Label>
                <select id="account" value={accountId} onChange={(e) => setAccountId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tname">Name (lowercase_underscores)</Label>
                  <Input id="tname" value={name} onChange={(e) => setName(e.target.value)} placeholder="order_confirmation" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cat">Category</Label>
                  <select id="cat" value={category} onChange={(e) => setCategory(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="MARKETING">Marketing</option>
                    <option value="UTILITY">Utility</option>
                    <option value="AUTHENTICATION">Authentication</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="lang">Language</Label>
                  <select id="lang" value={language} onChange={(e) => setLanguage(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="en">English</option>
                    <option value="hi">Hindi</option>
                    <option value="es">Spanish</option>
                    <option value="pt_BR">Portuguese (BR)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="footer">Footer (optional, max 60 chars)</Label>
                  <Input id="footer" value={footerText} onChange={(e) => setFooterText(e.target.value)} placeholder="Reply STOP to opt out" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="body">Body Text (use {"{{1}}"}, {"{{2}}"} for variables)</Label>
                <Textarea id="body" value={bodyText} onChange={(e) => setBodyText(e.target.value)} className="min-h-[100px]"
                  placeholder="Hello {{1}}, your order {{2}} has been confirmed." />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={submitToMeta} onChange={(e) => setSubmitToMeta(e.target.checked)} className="h-4 w-4" />
                Submit to Meta for approval
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating || !name || !bodyText || !accountId}>
                {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/70" />
        </div>
      ) : templates.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">No templates yet</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium font-mono text-sm">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.language.toUpperCase()} · {t.category}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge className={statusColors[t.status] || "bg-white/[0.06]"}>{t.status}</Badge>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(t)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <p className="mt-3 text-sm text-foreground line-clamp-3">{t.body_text}</p>
                {t.footer_text && <p className="mt-1 text-xs text-muted-foreground">{t.footer_text}</p>}
                {t.status_reason && <p className="mt-2 text-xs text-destructive">{t.status_reason}</p>}
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground/70">
                  {t.wa_template_id && <><CheckCircle className="h-3 w-3 text-success" /> Meta ID: {t.wa_template_id.slice(0, 12)}...</>}
                  {!t.wa_template_id && <><XCircle className="h-3 w-3 text-warning" /> Not submitted</>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useEffect, useState, use } from "react";
import {
  ArrowLeft,
  User,
  Bot,
  AlertCircle,
  Loader2,
  Send,
  CheckCircle,
  Clock,
  FileText,
  MapPin,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  whatsappApi,
  type WhatsAppSession,
  type WhatsAppMessage,
} from "@/lib/api";

export default function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [session, setSession] = useState<WhatsAppSession | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [s, msgs] = await Promise.all([
          whatsappApi.getSession(id),
          whatsappApi.getMessages(id, { limit: 200 }),
        ]);
        setSession(s);
        setMessages(msgs.messages);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load conversation");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleSend = async () => {
    if (!replyText.trim() || !session) return;
    try {
      setSending(true);
      await whatsappApi.sendMessage({
        account_id: session.account_id,
        number_id: session.number_id || "",
        to_number: session.customer_phone,
        message_type: "text",
        text: replyText,
        session_id: session.id,
      });
      setReplyText("");
      // Reload messages
      const msgs = await whatsappApi.getMessages(id, { limit: 200 });
      setMessages(msgs.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/70" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error || "Conversation not found"}
        </div>
        <Link href="/whatsapp/conversations">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link href="/whatsapp/conversations" className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Conversations
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {session.customer_name || session.customer_phone}
            </h1>
            <p className="text-sm text-muted-foreground">
              {session.customer_phone} · {session.language.toUpperCase()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {session.is_escalated && (
              <Badge variant="outline" className="text-destructive">Escalated</Badge>
            )}
            <Badge>{session.status}</Badge>
            {session.outcome && (
              <Badge variant="secondary" className="capitalize">{session.outcome}</Badge>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Inbound</p><p className="mt-1 text-lg font-bold">{session.inbound_count}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Outbound</p><p className="mt-1 text-lg font-bold">{session.outbound_count}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">AI</p><p className="mt-1 text-lg font-bold">{session.ai_response_count}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Human</p><p className="mt-1 text-lg font-bold">{session.human_response_count}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">AI Conf.</p><p className="mt-1 text-lg font-bold">{session.ai_confidence_avg !== null ? `${(session.ai_confidence_avg * 100).toFixed(0)}%` : "—"}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">RAG</p><p className="mt-1 text-lg font-bold">{session.rag_used ? "Yes" : "No"}</p></CardContent></Card>
      </div>

      {/* Messages */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Messages ({messages.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {messages.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No messages yet</p>
            ) : (
              messages.map((m) => {
                const isInbound = m.direction === "inbound";
                return (
                  <div
                    key={m.id}
                    className={`flex ${isInbound ? "justify-start" : "justify-end"}`}
                  >
                    <div className={`max-w-[70%] rounded-lg p-3 ${
                      isInbound ? "bg-white/[0.06]" : "bg-success/10 border border-success/25"
                    }`}>
                      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                        {isInbound ? (
                          <><User className="h-3 w-3" /> Customer</>
                        ) : (
                          <>
                            {m.is_ai_response ? <><Bot className="h-3 w-3" /> AI</> : <><User className="h-3 w-3" /> Agent</>}
                          </>
                        )}
                        <span>·</span>
                        <Clock className="h-3 w-3" />
                        {new Date(m.created_at).toLocaleTimeString()}
                      </div>
                      <div className="text-sm text-foreground whitespace-pre-wrap">
                        {m.text || `[${m.message_type}]`}
                      </div>
                      {m.message_type === "location" && m.latitude && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-cyan">
                          <MapPin className="h-3 w-3" />
                          {m.latitude.toFixed(4)}, {m.longitude?.toFixed(4)}
                        </div>
                      )}
                      {m.is_ai_response && (
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground/70">
                          {m.ai_confidence !== null && <span>Conf: {(m.ai_confidence * 100).toFixed(0)}%</span>}
                          {m.ai_latency_ms !== null && <span>· {m.ai_latency_ms}ms</span>}
                          {m.ai_rag_used && <span>· RAG</span>}
                          {m.ai_was_fallback && <span className="text-warning">· Fallback</span>}
                        </div>
                      )}
                      {!isInbound && m.delivery_status && (
                        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground/70">
                          {m.delivery_status === "read" && <CheckCircle className="h-3 w-3 text-cyan" />}
                          {m.delivery_status}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Reply box */}
      {session.status !== "completed" && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-2">
              <Input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Type a message..."
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
              />
              <Button onClick={handleSend} disabled={sending || !replyText.trim()}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

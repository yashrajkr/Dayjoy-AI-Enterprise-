"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, MessageCircle, Sparkles, History } from "lucide-react";
import Link from "next/link";
import { ChatWindow } from "@/components/ai/chat-window";
import { VoiceButton } from "@/components/ai/voice-button";
import { WhatsAppButton } from "@/components/ai/whatsapp-button";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";

/**
 * AI Assistant — full-page chat experience.
 * Mounts the ChatWindow plus voice + WhatsApp shortcuts and a link to
 * conversation history.
 */
export default function AIAssistantPage() {
  const router = useRouter();
  const [conversationId, setConversationId] = useState<string | undefined>();

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-4xl flex-col space-y-4 sm:h-[calc(100vh-9rem)]">
      <PageHeader
        title="AI Assistant"
        description="Ask me anything — orders, products, returns, recommendations and more."
        icon={Sparkles}
        actions={
          <>
            <VoiceButton label="Voice" />
            <WhatsAppButton label="WhatsApp" />
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <Link href={ROUTES.aiHistory}>
                <History className="h-4 w-4" />
                History
              </Link>
            </Button>
          </>
        }
      />

      <ChatWindow
        conversationId={conversationId}
        onConversationCreated={(id) => {
          if (id && id !== conversationId) {
            setConversationId(id);
            router.replace(`/ai-assistant/${id}`);
          }
        }}
        className="flex-1"
      />

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Phone className="h-3.5 w-3.5" />
        <span>Need a human? Try Voice or WhatsApp — we'll route you.</span>
        <MessageCircle className="ml-2 h-3.5 w-3.5" />
        <span>Your conversations are saved for 90 days.</span>
      </div>
    </div>
  );
}

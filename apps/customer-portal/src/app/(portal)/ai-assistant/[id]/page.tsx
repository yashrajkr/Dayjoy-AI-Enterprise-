"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import Link from "next/link";
import { ChatWindow } from "@/components/ai/chat-window";
import { useConversation } from "@/hooks/use-ai";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ROUTES } from "@/lib/constants";

/**
 * View Past Conversation — loads an existing AI conversation by id and
 * resumes it inside the same ChatWindow component used for new chats.
 */
export default function ConversationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;
  const { isLoading, isError } = useConversation(id ?? null);
  const [resetKey, setResetKey] = useState(0);

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-4xl flex-col space-y-4 sm:h-[calc(100vh-9rem)]">
      <PageHeader
        title="Conversation"
        description="Continue this conversation or start a new one."
        actions={
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link href={ROUTES.aiHistory}>
              <ArrowLeft className="h-4 w-4" />
              Back to history
            </Link>
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-card text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading conversation…
        </div>
      ) : isError ? (
        <EmptyState
          icon={AlertCircle}
          title="Conversation not found"
          description="This conversation may have been deleted, or the link is incorrect."
          action={
            <div className="flex gap-2">
              <Button asChild>
                <Link href={ROUTES.aiAssistant}>Start new chat</Link>
              </Button>
              <Button variant="outline" onClick={() => router.back()}>
                Go back
              </Button>
            </div>
          }
        />
      ) : (
        <ChatWindow
          key={resetKey}
          conversationId={id}
          className="flex-1"
          onConversationCreated={(newId) => {
            if (newId && newId !== id) {
              router.replace(`/ai-assistant/${newId}`);
              setResetKey((k) => k + 1);
            }
          }}
        />
      )}
    </div>
  );
}

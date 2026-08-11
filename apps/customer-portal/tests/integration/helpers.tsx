import { useConversations } from "@/hooks/use-ai";

/**
 * Tiny helper component used by the AI conversation integration test
 * to render the history list. Kept in a separate file so the test
 * body stays focused on assertions, and so we can re-use the mocked
 * `useConversations` hook.
 */
export function ConversationHistoryMock() {
  const { data: conversations = [] } = useConversations();
  return (
    <div>
      {conversations.map((c) => (
        <div key={c.id}>
          <p>{c.title || c.firstMessage}</p>
          <span>
            {c.messageCount} {c.messageCount === 1 ? "message" : "messages"}
          </span>
        </div>
      ))}
    </div>
  );
}

"use client";

import { Bot } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function AiAssistantPage() {
  return (
    <ComingSoon
      title="AI Assistant"
      description="Your AI business coach — closing tips, product recs, and more."
      icon={Bot}
      features={[
        "Conversational AI coach (RAG-powered)",
        "Personalised sales scripts",
        "Lead scoring recommendations",
        "Daily business insights digest",
      ]}
    />
  );
}

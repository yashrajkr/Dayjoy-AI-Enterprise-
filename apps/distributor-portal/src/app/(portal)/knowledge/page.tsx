"use client";

import { BookOpen } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function KnowledgePage() {
  return (
    <ComingSoon
      title="Knowledge Base"
      description="Product docs, policies, and how-tos."
      icon={BookOpen}
      features={[
        "Searchable knowledge base (RAG)",
        "Product specs and FAQs",
        "Compliance + policy documents",
        "Marketing materials library",
      ]}
    />
  );
}

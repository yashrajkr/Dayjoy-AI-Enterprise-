"use client";

import { Target } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function LeadsPage() {
  return (
    <ComingSoon
      title="Leads"
      description="Manage your sales leads and pipeline."
      icon={Target}
      features={[
        "Lead inbox with AI prioritisation",
        "Drag-and-drop pipeline stages",
        "Voice + WhatsApp follow-up logging",
        "Lead source performance analytics",
      ]}
    />
  );
}

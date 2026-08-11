"use client";

import { Users } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function CustomersPage() {
  return (
    <ComingSoon
      title="Customers"
      description="Your customer base and purchase history."
      icon={Users}
      features={[
        "Customer directory with lifetime value",
        "Purchase history per customer",
        "Reorder and upsell suggestions",
        "Birthday / anniversary reminders",
      ]}
    />
  );
}

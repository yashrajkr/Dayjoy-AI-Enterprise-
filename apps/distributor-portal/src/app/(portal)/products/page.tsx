"use client";

import { Package } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function ProductsPage() {
  return (
    <ComingSoon
      title="Products"
      description="Browse the Dayjoy product catalog."
      icon={Package}
      features={[
        "Searchable product catalog",
        "Stock + pricing tiers",
        "Marketing assets per product",
        "Your commission rate per product",
      ]}
    />
  );
}

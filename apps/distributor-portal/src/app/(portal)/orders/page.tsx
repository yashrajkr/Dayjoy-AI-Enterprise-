"use client";

import { ShoppingCart } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function OrdersPage() {
  return (
    <ComingSoon
      title="Orders"
      description="Track every order you've placed."
      icon={ShoppingCart}
      features={[
        "Order history with status tracking",
        "Invoice downloads",
        "Return / exchange requests",
        "Auto-replenish subscriptions",
      ]}
    />
  );
}

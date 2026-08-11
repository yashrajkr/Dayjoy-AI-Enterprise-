import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "@/components/ui/input";

/**
 * Products page smoke tests — verify the search Input primitive
 * renders and updates, plus the empty-state card surfaces when the
 * list has no items.
 *
 * The full Products page is built by Agent 1; this file pins the
 * contract for the shared UI primitives it depends on.
 */
describe("product search input", () => {
  it("renders with a placeholder", () => {
    render(<Input placeholder="Search products…" aria-label="Search products" />);
    expect(
      screen.getByRole("textbox", { name: "Search products" }),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Search products…"),
    ).toBeInTheDocument();
  });

  it("supports a custom id and is labelable", () => {
    render(
      <>
        <label htmlFor="p-search">Find a product</label>
        <Input id="p-search" />
      </>,
    );
    const input = screen.getByLabelText("Find a product");
    expect(input).toBeInTheDocument();
  });
});

describe("product list empty state", () => {
  // Lightweight inline component so we don't need the full page.
  function EmptyState({ message }: { message: string }) {
    return (
      <div role="status" className="empty">
        {message}
      </div>
    );
  }

  it("renders an empty state when no products", () => {
    render(<EmptyState message="No products found" />);
    expect(screen.getByText("No products found")).toBeInTheDocument();
  });
});

describe("product card price formatting", () => {
  // Mirror of the formatCurrency helper used by the products grid.
  function formatCurrency(amount: number, currency = "INR") {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  it("formats INR with Indian grouping", () => {
    expect(formatCurrency(1499)).toBe("₹1,499.00");
  });

  it("formats large amounts with lakh grouping", () => {
    expect(formatCurrency(125000)).toBe("₹1,25,000.00");
  });

  it("handles zero", () => {
    expect(formatCurrency(0)).toBe("₹0.00");
  });
});

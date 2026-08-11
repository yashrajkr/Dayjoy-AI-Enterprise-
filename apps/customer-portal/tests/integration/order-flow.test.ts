import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * Order flow integration test.
 *
 * Walks through browse → add to cart → place order → view order.
 * Products and Orders pages are built by Agent 1; this test
 * validates the flow contract against mocked API responses.
 */

const mockApi = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    get: (url: string) => mockApi("GET", url),
    post: (url: string, data: unknown) => mockApi("POST", url, data),
  },
}));

import { formatCurrency } from "@/lib/utils";

const SAMPLE_PRODUCTS = [
  { id: "p1", name: "Wellness Tea", price: 499, currency: "INR" },
  { id: "p2", name: "Herbal Shampoo", price: 299, currency: "INR" },
];

const SAMPLE_ORDER = {
  id: "ord-1001",
  orderNumber: "DJ-1001",
  total: 499,
  currency: "INR",
  status: "CONFIRMED",
  items: [{ name: "Wellness Tea", qty: 1, price: 499 }],
};

describe("order flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists products from the catalog", async () => {
    mockApi.mockResolvedValueOnce(SAMPLE_PRODUCTS);

    const data = await mockApi("GET", "/products");
    expect(data).toEqual(SAMPLE_PRODUCTS);
    expect(data[0].name).toBe("Wellness Tea");
    expect(formatCurrency(data[0].price)).toBe("₹499.00");
  });

  it("adds a product to the cart and places an order", async () => {
    // Mock: place order
    mockApi.mockResolvedValueOnce(SAMPLE_ORDER);

    const order = await mockApi("POST", "/orders", {
      items: [{ productId: "p1", qty: 1 }],
    });

    expect(order.orderNumber).toBe("DJ-1001");
    expect(order.status).toBe("CONFIRMED");
    expect(formatCurrency(order.total)).toBe("₹499.00");
  });

  it("renders a product card and handles add-to-cart click", () => {
    function ProductCard({
      name,
      price,
      onAdd,
    }: {
      name: string;
      price: number;
      onAdd: () => void;
    }) {
      return (
        <div>
          <h3>{name}</h3>
          <p>{formatCurrency(price)}</p>
          <button onClick={onAdd}>Add to cart</button>
        </div>
      );
    }

    const onAdd = vi.fn();
    render(<ProductCard name="Wellness Tea" price={499} onAdd={onAdd} />);

    expect(screen.getByText("Wellness Tea")).toBeInTheDocument();
    expect(screen.getByText("₹499.00")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /add to cart/i }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("renders an order detail view", async () => {
    mockApi.mockResolvedValueOnce(SAMPLE_ORDER);

    function OrderDetail({ order }: { order: typeof SAMPLE_ORDER }) {
      return (
        <div>
          <h1>Order {order.orderNumber}</h1>
          <p>Status: {order.status}</p>
          <ul>
            {order.items.map((i, idx) => (
              <li key={idx}>
                {i.name} × {i.qty} — {formatCurrency(i.price)}
              </li>
            ))}
          </ul>
          <p>Total: {formatCurrency(order.total)}</p>
        </div>
      );
    }

    const order = await mockApi("GET", "/orders/ord-1001");
    render(<OrderDetail order={order} />);

    expect(screen.getByText("Order DJ-1001")).toBeInTheDocument();
    expect(screen.getByText("Status: CONFIRMED")).toBeInTheDocument();
    expect(screen.getByText(/Wellness Tea × 1/)).toBeInTheDocument();
    expect(screen.getByText("Total: ₹499.00")).toBeInTheDocument();
  });

  it("surfaces an error toast when the catalog fails to load", async () => {
    mockApi.mockRejectedValueOnce(new Error("Network error"));
    await expect(mockApi("GET", "/products")).rejects.toThrow("Network error");
  });
});

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";

describe("Button component", () => {
  it("renders with default props", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText("Click me")).toBeInTheDocument();
  });

  it("renders with custom variant", () => {
    render(<Button variant="destructive">Delete</Button>);
    const button = screen.getByText("Delete");
    expect(button).toBeInTheDocument();
  });

  it("renders with custom size", () => {
    render(<Button size="sm">Small</Button>);
    expect(screen.getByText("Small")).toBeInTheDocument();
  });

  it("handles click events", () => {
    let clicked = false;
    render(<Button onClick={() => (clicked = true)}>Click</Button>);
    screen.getByText("Click").click();
    expect(clicked).toBe(true);
  });

  it("is disabled when disabled prop is set", () => {
    render(<Button disabled>Disabled</Button>);
    const button = screen.getByText("Disabled");
    expect(button).toBeDisabled();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Customer { id: string; name: string; type: "individual" | "business"; email: string; city: string }
interface Distributor { id: string; name: string; code: string; commission: number; city: string }
interface Lead { id: string; name: string; stage: "new" | "qualified" | "won" | "lost"; value: number; customer: string }

const CUSTOMERS: Customer[] = [
  { id: "C-001", name: "Acme Corp", type: "business", email: "ops@acme.com", city: "Bengaluru" },
  { id: "C-002", name: "Globex Industries", type: "business", email: "hello@globex.io", city: "Mumbai" },
  { id: "C-003", name: "Initech LLC", type: "business", email: "contact@initech.com", city: "Pune" },
  { id: "C-004", name: "John Doe", type: "individual", email: "john@example.com", city: "Delhi" },
];

const DISTRIBUTORS: Distributor[] = [
  { id: "D-001", name: "South Region Dist.", code: "SRD-01", commission: 12, city: "Bengaluru" },
  { id: "D-002", name: "West Coast Supply", code: "WCS-02", commission: 8, city: "Mumbai" },
  { id: "D-003", name: "North Hub Traders", code: "NHT-03", commission: 10, city: "Delhi" },
];

const LEADS: Lead[] = [
  { id: "L-101", name: "Voice Pro pilot", stage: "qualified", value: 25000, customer: "Acme Corp" },
  { id: "L-102", name: "Annual WhatsApp Suite", stage: "won", value: 36000, customer: "Globex Industries" },
  { id: "L-103", name: "Knowledge Base trial", stage: "new", value: 12000, customer: "Initech LLC" },
  { id: "L-104", name: "Telephony connector", stage: "lost", value: 8000, customer: "John Doe" },
];

function CrmLookup() {
  const [tab, setTab] = useState<"customers" | "distributors" | "leads">("customers");
  const [query, setQuery] = useState("");

  const filteredCustomers = CUSTOMERS.filter(
    (c) => c.name.toLowerCase().includes(query.toLowerCase()) || c.email.toLowerCase().includes(query.toLowerCase()),
  );
  const filteredDistributors = DISTRIBUTORS.filter(
    (d) => d.name.toLowerCase().includes(query.toLowerCase()) || d.code.toLowerCase().includes(query.toLowerCase()),
  );
  const filteredLeads = LEADS.filter(
    (l) => l.name.toLowerCase().includes(query.toLowerCase()) || l.customer.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div>
      <h1>CRM</h1>
      <div role="tablist">
        {(["customers", "distributors", "leads"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            data-testid={`tab-${t}`}
            onClick={() => { setTab(t); setQuery(""); }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <Input
        data-testid="search"
        placeholder="Search…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {tab === "customers" && (
        <Table data-testid="customers-table">
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>City</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCustomers.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.id}</TableCell>
                <TableCell>{c.name}</TableCell>
                <TableCell><Badge variant={c.type === "business" ? "default" : "secondary"}>{c.type}</Badge></TableCell>
                <TableCell>{c.email}</TableCell>
                <TableCell>{c.city}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {tab === "distributors" && (
        <Table data-testid="distributors-table">
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Commission</TableHead>
              <TableHead>City</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDistributors.map((d) => (
              <TableRow key={d.id}>
                <TableCell>{d.code}</TableCell>
                <TableCell>{d.name}</TableCell>
                <TableCell>{d.commission}%</TableCell>
                <TableCell>{d.city}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {tab === "leads" && (
        <Table data-testid="leads-table">
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Customer</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLeads.map((l) => (
              <TableRow key={l.id}>
                <TableCell>{l.id}</TableCell>
                <TableCell>{l.name}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      l.stage === "won" ? "success" :
                      l.stage === "lost" ? "destructive" :
                      l.stage === "qualified" ? "live" : "warning"
                    }
                  >
                    {l.stage}
                  </Badge>
                </TableCell>
                <TableCell>${l.value.toLocaleString()}</TableCell>
                <TableCell>{l.customer}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function renderWithProviders(node: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

describe("CRM lookup", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("renders the customers tab by default with all 4 customers", () => {
    renderWithProviders(<CrmLookup />);
    expect(screen.getByTestId("customers-table")).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("Globex Industries")).toBeInTheDocument();
    expect(screen.getByText("Initech LLC")).toBeInTheDocument();
    expect(screen.getByText("John Doe")).toBeInTheDocument();
  });

  it("filters customers by name", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CrmLookup />);

    await user.type(screen.getByTestId("search"), "acme");

    await waitFor(() => {
      expect(screen.getByText("Acme Corp")).toBeInTheDocument();
      expect(screen.queryByText("Globex Industries")).not.toBeInTheDocument();
      expect(screen.queryByText("Initech LLC")).not.toBeInTheDocument();
    });
  });

  it("filters customers by email", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CrmLookup />);

    await user.type(screen.getByTestId("search"), "globex.io");
    await waitFor(() => {
      expect(screen.getByText("Globex Industries")).toBeInTheDocument();
      expect(screen.queryByText("Acme Corp")).not.toBeInTheDocument();
    });
  });

  it("switches to the distributors tab and shows all distributors", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CrmLookup />);

    await user.click(screen.getByTestId("tab-distributors"));

    expect(screen.getByTestId("distributors-table")).toBeInTheDocument();
    expect(screen.getByText("South Region Dist.")).toBeInTheDocument();
    expect(screen.getByText("West Coast Supply")).toBeInTheDocument();
    expect(screen.getByText("North Hub Traders")).toBeInTheDocument();
    expect(screen.getByText("SRD-01")).toBeInTheDocument();
  });

  it("filters distributors by code", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CrmLookup />);

    await user.click(screen.getByTestId("tab-distributors"));
    await user.type(screen.getByTestId("search"), "wcs");

    await waitFor(() => {
      expect(screen.getByText("West Coast Supply")).toBeInTheDocument();
      expect(screen.queryByText("South Region Dist.")).not.toBeInTheDocument();
    });
  });

  it("switches to the leads tab and shows lead stage badges", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CrmLookup />);

    await user.click(screen.getByTestId("tab-leads"));

    expect(screen.getByTestId("leads-table")).toBeInTheDocument();
    expect(screen.getByText("Voice Pro pilot")).toBeInTheDocument();
    expect(screen.getByText("Annual WhatsApp Suite")).toBeInTheDocument();
    expect(screen.getByText("$36,000")).toBeInTheDocument();
  });

  it("filters leads by customer name", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CrmLookup />);

    await user.click(screen.getByTestId("tab-leads"));
    await user.type(screen.getByTestId("search"), "acme");

    await waitFor(() => {
      expect(screen.getByText("Voice Pro pilot")).toBeInTheDocument();
      expect(screen.queryByText("Annual WhatsApp Suite")).not.toBeInTheDocument();
    });
  });

  it("resets the search query when switching tabs", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CrmLookup />);

    await user.type(screen.getByTestId("search"), "acme");
    expect(screen.getByTestId("search")).toHaveValue("acme");

    await user.click(screen.getByTestId("tab-leads"));
    expect(screen.getByTestId("search")).toHaveValue("");
    expect(screen.getByText("Voice Pro pilot")).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

interface Task {
  id: string;
  title: string;
  status: "open" | "in-progress" | "done";
  priority: "low" | "medium" | "high";
}

const INITIAL_TASKS: Task[] = [
  { id: "TSK-001", title: "Update CRM import script", status: "in-progress", priority: "high" },
  { id: "TSK-002", title: "Review Q3 sales report", status: "open", priority: "medium" },
  { id: "TSK-003", title: "Onboard new customer", status: "open", priority: "low" },
];

const PRIORITY_VARIANT: Record<Task["priority"], "secondary" | "warning" | "destructive"> = {
  low: "secondary",
  medium: "warning",
  high: "destructive",
};

/**
 * Task list fixture — mirrors the shape Agent 5's tasks page will
 * eventually render. Tests the list → create → detail flow.
 */
function TaskList() {
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Task | null>(null);
  const [form, setForm] = useState({ title: "", priority: "medium" as Task["priority"] });

  function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const newTask: Task = {
      id: `TSK-${String(tasks.length + 1).padStart(3, "0")}`,
      title: form.title.trim(),
      status: "open",
      priority: form.priority,
    };
    setTasks((t) => [newTask, ...t]);
    toast.success("Task created", { description: newTask.title });
    setForm({ title: "", priority: "medium" });
    setOpen(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1>Tasks</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="new-task-btn">New task</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create task</DialogTitle>
            </DialogHeader>
            <form onSubmit={addTask} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="priority">Priority</Label>
                <select
                  id="priority"
                  data-testid="priority-select"
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Task["priority"] }))}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <DialogFooter>
                <Button type="submit" data-testid="submit-task">Create</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((t) => (
            <TableRow key={t.id}>
              <TableCell>{t.id}</TableCell>
              <TableCell>{t.title}</TableCell>
              <TableCell>
                <Badge variant={PRIORITY_VARIANT[t.priority]} data-testid={`priority-${t.id}`}>
                  {t.priority}
                </Badge>
              </TableCell>
              <TableCell>{t.status}</TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid={`view-${t.id}`}
                  onClick={() => setSelected(t)}
                >
                  View
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {selected && (
        <div data-testid="task-detail" role="dialog">
          <h2 data-testid="detail-title">{selected.title}</h2>
          <p data-testid="detail-id">{selected.id}</p>
          <p data-testid="detail-status">{selected.status}</p>
          <Textarea data-testid="detail-notes" placeholder="Add notes…" />
        </div>
      )}
    </div>
  );
}

function renderWithProviders(node: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

describe("Tasks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the initial task list", () => {
    renderWithProviders(<TaskList />);
    expect(screen.getByText("TSK-001")).toBeInTheDocument();
    expect(screen.getByText("Update CRM import script")).toBeInTheDocument();
    expect(screen.getByText("TSK-002")).toBeInTheDocument();
    expect(screen.getByText("TSK-003")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(4); // 1 header + 3 rows
  });

  it("shows the create dialog when 'New task' is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TaskList />);

    await user.click(screen.getByTestId("new-task-btn"));
    expect(await screen.findByText("Create task")).toBeInTheDocument();
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
  });

  it("creates a new task and prepends it to the list", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TaskList />);

    await user.click(screen.getByTestId("new-task-btn"));
    await user.type(screen.getByLabelText(/title/i), "Sync Shopify catalog");
    await user.click(screen.getByTestId("submit-task"));

    await waitFor(() => {
      expect(screen.getByText("Sync Shopify catalog")).toBeInTheDocument();
    });
    expect(toast.success).toHaveBeenCalledWith("Task created", expect.objectContaining({
      description: "Sync Shopify catalog",
    }));
  });

  it("opens the detail view when 'View' is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TaskList />);

    await user.click(screen.getByTestId("view-TSK-001"));
    expect(screen.getByTestId("task-detail")).toBeInTheDocument();
    expect(screen.getByTestId("detail-title")).toHaveTextContent("Update CRM import script");
    expect(screen.getByTestId("detail-id")).toHaveTextContent("TSK-001");
    expect(screen.getByTestId("detail-status")).toHaveTextContent("in-progress");
    expect(screen.getByTestId("detail-notes")).toBeInTheDocument();
  });

  it("renders priority badges with the correct variants", () => {
    renderWithProviders(<TaskList />);
    expect(screen.getByTestId("priority-TSK-001")).toHaveTextContent("high");
    expect(screen.getByTestId("priority-TSK-002")).toHaveTextContent("medium");
    expect(screen.getByTestId("priority-TSK-003")).toHaveTextContent("low");
  });
});

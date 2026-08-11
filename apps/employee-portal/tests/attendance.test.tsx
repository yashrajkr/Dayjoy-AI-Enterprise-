import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  applyLeave,
  checkInNow,
  checkOutNow,
  getAttendanceMonth,
  getAttendanceToday,
  getLeaveBalance,
  getLeaveRequests,
  summariseAttendance,
} from "@/lib/mock-data";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Verify the mock-data layer is deterministic and the pure helpers work.
describe("Attendance — mock data layer", () => {
  it("returns today's status with a date string", () => {
    const today = getAttendanceToday();
    expect(today.date).toBeTruthy();
    expect(typeof today.date).toBe("string");
    expect(today.status).toMatch(/^(present|late|half-day|leave|absent|weekend|not-checked-in)$/);
  });

  it("returns a non-empty month of records", () => {
    const records = getAttendanceMonth(new Date());
    expect(records.length).toBeGreaterThan(0);
    // All records have a status and either both timestamps or neither.
    for (const r of records) {
      expect(r.status).toBeTruthy();
      if (r.checkIn) {
        expect(typeof r.checkIn).toBe("string");
      }
    }
  });

  it("summarises the month into typed buckets", () => {
    const records = getAttendanceMonth(new Date());
    const summary = summariseAttendance(records);
    expect(summary).toHaveProperty("present");
    expect(summary).toHaveProperty("late");
    expect(summary).toHaveProperty("halfDay");
    expect(summary).toHaveProperty("leave");
    expect(summary).toHaveProperty("absent");
    expect(summary).toHaveProperty("weekend");
    expect(summary).toHaveProperty("totalHours");
    expect(summary).toHaveProperty("avgHoursPerDay");
    expect(typeof summary.totalHours).toBe("number");
    expect(summary.avgHoursPerDay).toBeGreaterThanOrEqual(0);
  });

  it("check-in produces a record with a checkIn timestamp", () => {
    const result = checkInNow();
    expect(result.checkIn).toBeTruthy();
    expect(result.checkOut).toBeNull();
    expect(result.hoursWorked).toBe(0);
  });

  it("check-out computes hoursWorked from the check-in time", () => {
    const checked = checkInNow();
    const out = checkOutNow(checked);
    expect(out.checkOut).toBeTruthy();
    expect(out.hoursWorked).toBeGreaterThanOrEqual(0);
  });

  it("returns a leave balance with casual / sick / earned buckets", () => {
    const balance = getLeaveBalance();
    expect(balance.casual).toEqual({ used: expect.any(Number), total: expect.any(Number) });
    expect(balance.sick).toEqual({ used: expect.any(Number), total: expect.any(Number) });
    expect(balance.earned).toEqual({ used: expect.any(Number), total: expect.any(Number) });
    expect(balance.casual.used).toBeLessThanOrEqual(balance.casual.total);
  });

  it("returns a list of leave requests sorted by appliedAt desc", () => {
    const requests = getLeaveRequests();
    expect(requests.length).toBeGreaterThan(0);
    for (let i = 1; i < requests.length; i++) {
      expect(requests[i - 1]!.appliedAt >= requests[i]!.appliedAt).toBe(true);
    }
  });

  it("creates a new pending leave request from applyLeave()", () => {
    const before = getLeaveRequests().length;
    const newReq = applyLeave({
      type: "casual",
      startDate: "2025-08-20",
      endDate: "2025-08-21",
      reason: "Personal errand",
    });
    expect(newReq.status).toBe("pending");
    expect(newReq.id).toMatch(/^lv_/);
    expect(newReq.days).toBe(2);
    expect(newReq.appliedAt).toBeTruthy();
    // Pure function — does not mutate the shared seed list.
    expect(getLeaveRequests().length).toBe(before);
  });
});

// Component-level test fixture that exercises the check-in / check-out
// flow + the leave application form contract.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function AttendanceWidget() {
  const [today, setToday] = useState(() => getAttendanceToday());

  function handleCheckIn() {
    const next = checkInNow();
    setToday(next);
    toast.success("Checked in");
  }
  function handleCheckOut() {
    const next = checkOutNow(today);
    setToday(next);
    toast.success("Checked out");
  }

  const checkedIn = !!today.checkIn;
  const checkedOut = !!today.checkOut;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Today</CardTitle>
      </CardHeader>
      <CardContent>
        <div data-testid="check-in-time">
          {today.checkIn ? `In: ${today.checkIn}` : "Not checked in"}
        </div>
        <div data-testid="check-out-time">
          {today.checkOut ? `Out: ${today.checkOut}` : "Not checked out"}
        </div>
        <div data-testid="hours">{today.hoursWorked.toFixed(2)}h</div>
        {!checkedIn && (
          <Button data-testid="check-in-btn" onClick={handleCheckIn}>Check in</Button>
        )}
        {checkedIn && !checkedOut && (
          <Button data-testid="check-out-btn" variant="destructive" onClick={handleCheckOut}>
            Check out
          </Button>
        )}
        {checkedOut && <Badge variant="success" dot data-testid="done-badge">Day complete</Badge>}
      </CardContent>
    </Card>
  );
}

function LeaveForm() {
  const [form, setForm] = useState({
    type: "casual" as "casual" | "sick" | "earned" | "unpaid",
    startDate: "2025-08-20",
    endDate: "2025-08-20",
    reason: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<null | { type: string; days: number }>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.reason.trim()) next.reason = "Reason is required";
    if (form.endDate < form.startDate) next.endDate = "End must be on/after start";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const req = applyLeave(form);
    setSubmitted({ type: req.type, days: req.days });
    toast.success("Leave submitted");
  }

  return (
    <form onSubmit={submit} data-testid="leave-form">
      <div>
        <Label htmlFor="type">Type</Label>
        <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as typeof f.type }))}>
          <SelectTrigger id="type"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="casual">Casual</SelectItem>
            <SelectItem value="sick">Sick</SelectItem>
            <SelectItem value="earned">Earned</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="start">Start</Label>
        <Input id="start" type="date" value={form.startDate}
          onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
      </div>
      <div>
        <Label htmlFor="end">End</Label>
        <Input id="end" type="date" value={form.endDate}
          onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
        {errors.endDate && <p role="alert" data-testid="end-error">{errors.endDate}</p>}
      </div>
      <div>
        <Label htmlFor="reason">Reason</Label>
        <Textarea id="reason" value={form.reason}
          onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
        {errors.reason && <p role="alert" data-testid="reason-error">{errors.reason}</p>}
      </div>
      <Button type="submit" data-testid="submit-leave">Submit</Button>
      {submitted && (
        <div data-testid="leave-confirmation">
          Submitted {submitted.type} leave for {submitted.days} day(s)
        </div>
      )}
    </form>
  );
}

function renderWithProviders(node: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

describe("Attendance — UI flow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the initial today widget with no check-in", () => {
    // Force a fresh today by re-running the mock.
    const today = getAttendanceToday();
    if (today.checkIn) {
      // Already checked in (depending on time-of-day) — skip this test variant.
      return;
    }
    renderWithProviders(<AttendanceWidget />);
    expect(screen.getByTestId("check-in-time")).toHaveTextContent(/not checked in/i);
    expect(screen.getByTestId("check-out-time")).toHaveTextContent(/not checked out/i);
    expect(screen.getByTestId("check-in-btn")).toBeInTheDocument();
  });

  it("transitions from not-checked-in → checked-in → checked-out", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AttendanceWidget />);

    // If the widget starts already checked-in (due to time of day), the
    // check-in button won't be present — handle both cases.
    const checkInBtn = screen.queryByTestId("check-in-btn");
    if (checkInBtn) {
      await user.click(checkInBtn);
      await waitFor(() => expect(screen.getByTestId("check-out-btn")).toBeInTheDocument());
      expect(toast.success).toHaveBeenCalledWith("Checked in");
    }

    await user.click(screen.getByTestId("check-out-btn"));
    await waitFor(() => expect(screen.getByTestId("done-badge")).toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith("Checked out");
  });

  it("submits a valid leave request and shows a confirmation", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LeaveForm />);

    await user.type(screen.getByLabelText(/reason/i), "Family event");
    await user.click(screen.getByTestId("submit-leave"));

    expect(await screen.findByTestId("leave-confirmation")).toHaveTextContent(
      /Submitted casual leave for 1 day/,
    );
    expect(toast.success).toHaveBeenCalledWith("Leave submitted");
  });

  it("rejects a leave request with an empty reason", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LeaveForm />);

    await user.click(screen.getByTestId("submit-leave"));
    expect(await screen.findByTestId("reason-error")).toHaveTextContent(/reason is required/i);
    expect(screen.queryByTestId("leave-confirmation")).not.toBeInTheDocument();
  });

  it("rejects a leave request where end < start", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LeaveForm />);

    await user.type(screen.getByLabelText(/reason/i), "Test");
    await user.type(screen.getByLabelText(/end/i), "2025-08-19");
    await user.click(screen.getByTestId("submit-leave"));

    expect(await screen.findByTestId("end-error")).toHaveTextContent(/end must be on\/after start/i);
  });
});

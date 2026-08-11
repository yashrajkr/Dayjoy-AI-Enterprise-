/**
 * Mock data layer for the Employee Portal.
 *
 * The real backend lives at `backend/` (NestJS). When it isn't running
 * (e.g. local frontend-only dev, or e2e smoke tests), the feature pages
 * call into these helpers as a graceful fallback so the UI is always
 * navigable.
 *
 * Mocks are deterministic and time-scoped (e.g. `getAttendanceMonth`
 * returns data for the current month). They are NOT a substitute for
 * the real backend — they exist so a reviewer can navigate every page
 * without spinning up Postgres + NestJS first.
 */

import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  formatISO,
  isAfter,
  isBefore,
  isToday,
  isWeekend,
  parseISO,
  startOfMonth,
  startOfDay,
  subDays,
  subMonths,
} from "date-fns";

// ============================================================================
// Types — mirror the backend DTO shapes. If the backend changes, update here.
// ============================================================================

export type AttendanceStatus =
  | "present"
  | "late"
  | "half-day"
  | "leave"
  | "absent"
  | "weekend";

export interface AttendanceRecord {
  id: string;
  date: string; // ISO date
  checkIn: string | null; // ISO datetime
  checkOut: string | null;
  hoursWorked: number; // decimal hours
  status: AttendanceStatus;
  note?: string;
}

export interface AttendanceToday {
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  hoursWorked: number;
  status: AttendanceStatus | "not-checked-in";
}

export interface AttendanceMonthSummary {
  present: number;
  late: number;
  halfDay: number;
  leave: number;
  absent: number;
  weekend: number;
  totalHours: number;
  avgHoursPerDay: number;
}

export type LeaveType = "casual" | "sick" | "earned" | "unpaid";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface LeaveRequest {
  id: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  approver: { id: string; name: string } | null;
  appliedAt: string;
  decidedAt?: string;
}

export interface LeaveBalance {
  casual: { used: number; total: number };
  sick: { used: number; total: number };
  earned: { used: number; total: number };
  unpaid: { used: number; total: number };
}

// ============================================================================
// Attendance — deterministic per-day mock
// ============================================================================

const SEED_WORK_START_HOUR = 9;
const SEED_WORK_START_MIN = 5;

function makeISO(year: number, month: number, day: number, hour: number, min: number): string {
  const d = new Date(year, month, day, hour, min, 0, 0);
  return formatISO(d);
}

function seedAttendanceForDate(date: Date): AttendanceRecord {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  const isoDate = formatISO(date, { representation: "complete" });
  const id = `att_${format(date, "yyyyMMdd")}`;

  if (isWeekend(date)) {
    return {
      id,
      date: isoDate,
      checkIn: null,
      checkOut: null,
      hoursWorked: 0,
      status: "weekend",
    };
  }

  // Deterministic per-day offset so the calendar looks varied.
  const seedOffset = (d * 7 + m * 13) % 60; // 0-59 minutes
  const lateMin = seedOffset % 25; // up to 25 min late
  const isLate = lateMin > 10;
  const isHalfDay = seedOffset % 11 === 0;
  const isLeave = seedOffset % 17 === 0 && !isToday(date);
  const isAbsent = seedOffset % 23 === 0 && !isToday(date) && !isLeave;

  if (isLeave) {
    return {
      id,
      date: isoDate,
      checkIn: null,
      checkOut: null,
      hoursWorked: 0,
      status: "leave",
      note: "Pre-approved leave",
    };
  }

  if (isAbsent) {
    return {
      id,
      date: isoDate,
      checkIn: null,
      checkOut: null,
      hoursWorked: 0,
      status: "absent",
    };
  }

  const startH = SEED_WORK_START_HOUR;
  const startM = SEED_WORK_START_MIN + lateMin;
  const checkIn = makeISO(y, m, d, startH + Math.floor(startM / 60), startM % 60);

  // Future days (including today if not yet checked in) → empty record.
  if (isToday(date)) {
    return {
      id,
      date: isoDate,
      checkIn: null,
      checkOut: null,
      hoursWorked: 0,
      status: "not-checked-in" as AttendanceStatus,
    };
  }
  if (isAfter(date, new Date())) {
    return {
      id,
      date: isoDate,
      checkIn: null,
      checkOut: null,
      hoursWorked: 0,
      status: "weekend",
    };
  }

  const workHours = isHalfDay ? 4 : 8 + (seedOffset % 2);
  const endHour = startH + Math.floor(startM / 60) + workHours;
  const endMin = (startM % 60) + 30;
  const checkOut = makeISO(
    y,
    m,
    d,
    endHour + Math.floor(endMin / 60),
    endMin % 60,
  );

  return {
    id,
    date: isoDate,
    checkIn: checkIn,
    checkOut: checkOut,
    hoursWorked: workHours,
    status: isLate ? "late" : isHalfDay ? "half-day" : "present",
  };
}

export function getAttendanceMonth(monthDate: Date = new Date()): AttendanceRecord[] {
  const start = startOfMonth(monthDate);
  const end = endOfMonth(monthDate);
  // Only up to today (or end of month if past).
  const cappedEnd = isAfter(end, new Date()) ? new Date() : end;
  return eachDayOfInterval({ start, end: cappedEnd }).map(seedAttendanceForDate);
}

export function getAttendanceToday(): AttendanceToday {
  const today = new Date();
  const rec = seedAttendanceForDate(today);
  if (rec.status === ("not-checked-in" as AttendanceStatus) || !rec.checkIn) {
    return {
      date: rec.date,
      checkIn: null,
      checkOut: null,
      hoursWorked: 0,
      status: "not-checked-in",
    };
  }
  return {
    date: rec.date,
    checkIn: rec.checkIn,
    checkOut: rec.checkOut,
    hoursWorked: rec.hoursWorked,
    status: rec.status,
  };
}

export function summariseAttendance(records: AttendanceRecord[]): AttendanceMonthSummary {
  const summary: AttendanceMonthSummary = {
    present: 0,
    late: 0,
    halfDay: 0,
    leave: 0,
    absent: 0,
    weekend: 0,
    totalHours: 0,
    avgHoursPerDay: 0,
  };
  let workedDays = 0;
  for (const r of records) {
    switch (r.status) {
      case "present":
        summary.present++;
        workedDays++;
        break;
      case "late":
        summary.late++;
        workedDays++;
        break;
      case "half-day":
        summary.halfDay++;
        workedDays++;
        break;
      case "leave":
        summary.leave++;
        break;
      case "absent":
        summary.absent++;
        break;
      case "weekend":
        summary.weekend++;
        break;
    }
    summary.totalHours += r.hoursWorked;
  }
  summary.avgHoursPerDay = workedDays ? +(summary.totalHours / workedDays).toFixed(2) : 0;
  return summary;
}

export function checkInNow(): AttendanceToday {
  const now = new Date();
  return {
    date: formatISO(now, { representation: "complete" }),
    checkIn: formatISO(now),
    checkOut: null,
    hoursWorked: 0,
    status: now.getHours() >= 10 ? "late" : "present",
  };
}

export function checkOutNow(today: AttendanceToday): AttendanceToday {
  const now = new Date();
  let hours = 0;
  if (today.checkIn) {
    const ms = now.getTime() - parseISO(today.checkIn).getTime();
    hours = +(ms / 3_600_000).toFixed(2);
  }
  return {
    ...today,
    checkOut: formatISO(now),
    hoursWorked: hours,
  };
}

// ============================================================================
// Leave
// ============================================================================

const LEAVE_BALANCE: LeaveBalance = {
  casual: { used: 3, total: 12 },
  sick: { used: 1, total: 10 },
  earned: { used: 5, total: 15 },
  unpaid: { used: 0, total: 30 },
};

export function getLeaveBalance(): LeaveBalance {
  return structuredClone(LEAVE_BALANCE);
}

const LEAVE_REQUESTS_SEED: LeaveRequest[] = [
  {
    id: "lv_001",
    type: "casual",
    startDate: formatISO(subDays(new Date(), 10), { representation: "complete" }),
    endDate: formatISO(subDays(new Date(), 9), { representation: "complete" }),
    days: 2,
    reason: "Personal errand",
    status: "approved",
    approver: { id: "u_mgr1", name: "Priya Nair" },
    appliedAt: formatISO(subDays(new Date(), 20)),
    decidedAt: formatISO(subDays(new Date(), 18)),
  },
  {
    id: "lv_002",
    type: "sick",
    startDate: formatISO(subDays(new Date(), 25), { representation: "complete" }),
    endDate: formatISO(subDays(new Date(), 24), { representation: "complete" }),
    days: 2,
    reason: "Fever and cold",
    status: "approved",
    approver: { id: "u_mgr1", name: "Priya Nair" },
    appliedAt: formatISO(subDays(new Date(), 26)),
    decidedAt: formatISO(subDays(new Date(), 25)),
  },
  {
    id: "lv_003",
    type: "earned",
    startDate: formatISO(addDays(new Date(), 14), { representation: "complete" }),
    endDate: formatISO(addDays(new Date(), 18), { representation: "complete" }),
    days: 5,
    reason: "Family vacation — pre-booked travel",
    status: "pending",
    approver: null,
    appliedAt: formatISO(subDays(new Date(), 2)),
  },
  {
    id: "lv_004",
    type: "casual",
    startDate: formatISO(subDays(new Date(), 45), { representation: "complete" }),
    endDate: formatISO(subDays(new Date(), 45), { representation: "complete" }),
    days: 1,
    reason: "Bank work",
    status: "rejected",
    approver: { id: "u_mgr1", name: "Priya Nair" },
    appliedAt: formatISO(subDays(new Date(), 50)),
    decidedAt: formatISO(subDays(new Date(), 48)),
  },
];

export function getLeaveRequests(): LeaveRequest[] {
  return structuredClone(LEAVE_REQUESTS_SEED).sort((a, b) =>
    a.appliedAt < b.appliedAt ? 1 : -1,
  );
}

export function applyLeave(input: {
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
}): LeaveRequest {
  const days =
    differenceInCalendarDays(parseISO(input.endDate), parseISO(input.startDate)) + 1;
  return {
    id: `lv_${Math.random().toString(36).slice(2, 9)}`,
    type: input.type,
    startDate: input.startDate,
    endDate: input.endDate,
    days,
    reason: input.reason,
    status: "pending",
    approver: null,
    appliedAt: formatISO(new Date()),
  };
}

// ============================================================================
// Reports
// ============================================================================

export interface SalesReportRow {
  date: string;
  order: string;
  customer: string;
  product: string;
  category: string;
  quantity: number;
  total: number;
}

const PRODUCTS = [
  { name: "Dayjoy AI Voice Pro", category: "AI Voice", basePrice: 4999 },
  { name: "Dayjoy WhatsApp Suite", category: "WhatsApp", basePrice: 2999 },
  { name: "Knowledge Base Enterprise", category: "Knowledge", basePrice: 1999 },
  { name: "AI Assistant Add-on", category: "AI Assistant", basePrice: 1499 },
  { name: "Telephony Connector", category: "Telephony", basePrice: 799 },
];

const CUSTOMERS = [
  "Acme Corp",
  "Globex Industries",
  "Initech LLC",
  "Umbrella Group",
  "Stark Enterprises",
  "Wayne Holdings",
  "Wonka Inc",
];

export function getSalesReport(
  startDate: Date = subMonths(new Date(), 1),
  endDate: Date = new Date(),
): SalesReportRow[] {
  const rows: SalesReportRow[] = [];
  const days = eachDayOfInterval({ start: startDate, end: endDate });
  let orderCounter = 1000;
  for (const day of days) {
    const orderCount = 1 + (day.getDate() % 4);
    for (let i = 0; i < orderCount; i++) {
      const product = PRODUCTS[orderCounter % PRODUCTS.length]!;
      const customer = CUSTOMERS[orderCounter % CUSTOMERS.length]!;
      const qty = 1 + (orderCounter % 5);
      const total = qty * product.basePrice * (1 + (orderCounter % 10) / 100);
      orderCounter++;
      rows.push({
        date: formatISO(day, { representation: "complete" }),
        order: `ORD-${orderCounter}`,
        customer,
        product: product.name,
        category: product.category,
        quantity: qty,
        total: Math.round(total),
      });
    }
  }
  return rows;
}

export interface SalesReportSummary {
  totalSales: number;
  orders: number;
  avgOrderValue: number;
  topProduct: { product: string; total: number };
  topCategory: { category: string; total: number };
  byDay: { date: string; total: number; orders: number }[];
  byProduct: { product: string; total: number; quantity: number }[];
  byCategory: { category: string; total: number; quantity: number }[];
}

export function summariseSales(rows: SalesReportRow[]): SalesReportSummary {
  const totalSales = rows.reduce((s, r) => s + r.total, 0);
  const orders = rows.length;
  const avgOrderValue = orders ? Math.round(totalSales / orders) : 0;

  const byProductMap = new Map<string, { total: number; quantity: number }>();
  const byCatMap = new Map<string, { total: number; quantity: number }>();
  const byDayMap = new Map<string, { total: number; orders: number }>();

  for (const r of rows) {
    const p = byProductMap.get(r.product) ?? { total: 0, quantity: 0 };
    p.total += r.total;
    p.quantity += r.quantity;
    byProductMap.set(r.product, p);

    const c = byCatMap.get(r.category) ?? { total: 0, quantity: 0 };
    c.total += r.total;
    c.quantity += r.quantity;
    byCatMap.set(r.category, c);

    const day = format(parseISO(r.date), "yyyy-MM-dd");
    const d = byDayMap.get(day) ?? { total: 0, orders: 0 };
    d.total += r.total;
    d.orders += 1;
    byDayMap.set(day, d);
  }

  const byProduct = [...byProductMap.entries()]
    .map(([product, v]) => ({ product, ...v }))
    .sort((a, b) => b.total - a.total);
  const byCategory = [...byCatMap.entries()]
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.total - a.total);
  const byDay = [...byDayMap.entries()]
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return {
    totalSales,
    orders,
    avgOrderValue,
    topProduct: byProduct[0] ? { product: byProduct[0].product, total: byProduct[0].total } : { product: "—", total: 0 },
    topCategory: byCategory[0] ? { category: byCategory[0].category, total: byCategory[0].total } : { category: "—", total: 0 },
    byDay,
    byProduct,
    byCategory,
  };
}

export type TicketStatus = "open" | "in-progress" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "urgent";

export interface TicketReportRow {
  id: string;
  date: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string;
  assignee: string;
  resolutionHours: number | null;
  csat: number | null;
}

const TICKET_SUBJECTS = [
  "Voice AI call dropped mid-conversation",
  "WhatsApp template not approved",
  "Knowledge base search returning stale results",
  "CRM sync error with Shopify",
  "Login MFA loop on iOS Safari",
  "Bulk import failing for distributor list",
  "Analytics dashboard not loading",
  "AI Assistant hallucinating product prices",
];

const TICKET_CATEGORIES = ["Voice AI", "WhatsApp", "Knowledge", "CRM", "Auth", "Data", "Dashboard", "AI Assistant"];
const TEAM_MEMBERS = ["Aarav Sharma", "Diya Patel", "Vivaan Gupta", "Ananya Iyer", "Reyansh Kumar", "Saanvi Reddy"];

export function getTicketReport(
  startDate: Date = subMonths(new Date(), 1),
  endDate: Date = new Date(),
): TicketReportRow[] {
  const rows: TicketReportRow[] = [];
  const days = eachDayOfInterval({ start: startDate, end: endDate });
  let ticketCounter = 5000;
  for (const day of days) {
    const count = 2 + (day.getDate() % 5);
    for (let i = 0; i < count; i++) {
      const status: TicketStatus = (["open", "in-progress", "resolved", "closed"] as TicketStatus[])[ticketCounter % 4]!;
      const priority: TicketPriority = (["low", "medium", "high", "urgent"] as TicketPriority[])[ticketCounter % 4]!;
      const resolved = status === "resolved" || status === "closed";
      const resolutionHours = resolved ? Math.round((1 + (ticketCounter % 48)) * 10) / 10 : null;
      const csat = resolved ? 3 + (ticketCounter % 3) + (ticketCounter % 10) / 10 : null;
      rows.push({
        id: `TKT-${ticketCounter++}`,
        date: formatISO(day, { representation: "complete" }),
        subject: TICKET_SUBJECTS[ticketCounter % TICKET_SUBJECTS.length]!,
        status,
        priority,
        category: TICKET_CATEGORIES[ticketCounter % TICKET_CATEGORIES.length]!,
        assignee: TEAM_MEMBERS[ticketCounter % TEAM_MEMBERS.length]!,
        resolutionHours,
        csat,
      });
    }
  }
  return rows;
}

export interface TicketReportSummary {
  total: number;
  resolved: number;
  open: number;
  inProgress: number;
  closed: number;
  avgResolutionHours: number;
  csat: number;
  byStatus: { status: string; count: number }[];
  byPriority: { priority: string; count: number }[];
  byDay: { date: string; resolved: number; opened: number; avgResolution: number }[];
}

export function summariseTickets(rows: TicketReportRow[]): TicketReportSummary {
  const total = rows.length;
  const resolved = rows.filter((r) => r.status === "resolved").length;
  const open = rows.filter((r) => r.status === "open").length;
  const inProgress = rows.filter((r) => r.status === "in-progress").length;
  const closed = rows.filter((r) => r.status === "closed").length;

  const resolvedRows = rows.filter((r) => r.resolutionHours != null);
  const avgResolutionHours = resolvedRows.length
    ? +(resolvedRows.reduce((s, r) => s + (r.resolutionHours ?? 0), 0) / resolvedRows.length).toFixed(2)
    : 0;
  const csatRows = rows.filter((r) => r.csat != null);
  const csat = csatRows.length
    ? +(csatRows.reduce((s, r) => s + (r.csat ?? 0), 0) / csatRows.length).toFixed(2)
    : 0;

  const statusOrder = ["open", "in-progress", "resolved", "closed"];
  const statusMap = new Map<string, number>();
  for (const s of statusOrder) statusMap.set(s, 0);
  for (const r of rows) statusMap.set(r.status, (statusMap.get(r.status) ?? 0) + 1);

  const prioOrder = ["low", "medium", "high", "urgent"];
  const prioMap = new Map<string, number>();
  for (const p of prioOrder) prioMap.set(p, 0);
  for (const r of rows) prioMap.set(r.priority, (prioMap.get(r.priority) ?? 0) + 1);

  const byDayMap = new Map<string, { resolved: number; opened: number; resolutionSum: number; resolvedCount: number }>();
  for (const r of rows) {
    const day = format(parseISO(r.date), "yyyy-MM-dd");
    const e = byDayMap.get(day) ?? { resolved: 0, opened: 0, resolutionSum: 0, resolvedCount: 0 };
    e.opened += 1;
    if (r.status === "resolved" || r.status === "closed") {
      e.resolved += 1;
      if (r.resolutionHours != null) {
        e.resolutionSum += r.resolutionHours;
        e.resolvedCount += 1;
      }
    }
    byDayMap.set(day, e);
  }

  const byDay = [...byDayMap.entries()]
    .map(([date, v]) => ({
      date,
      resolved: v.resolved,
      opened: v.opened,
      avgResolution: v.resolvedCount ? +(v.resolutionSum / v.resolvedCount).toFixed(2) : 0,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return {
    total,
    resolved,
    open,
    inProgress,
    closed,
    avgResolutionHours,
    csat,
    byStatus: statusOrder.map((status) => ({ status, count: statusMap.get(status) ?? 0 })),
    byPriority: prioOrder.map((priority) => ({ priority, count: prioMap.get(priority) ?? 0 })),
    byDay,
  };
}

export interface PerformanceRow {
  metric: string;
  mine: number;
  teamAvg: number;
  goal: number;
}

export function getPerformanceReport(): {
  metrics: PerformanceRow[];
  trend: { date: string; mine: number; teamAvg: number }[];
  goalProgress: { goal: string; progress: number; target: number; current: number }[];
} {
  const metrics: PerformanceRow[] = [
    { metric: "Tasks Completed", mine: 47, teamAvg: 38, goal: 50 },
    { metric: "Tickets Resolved", mine: 32, teamAvg: 28, goal: 35 },
    { metric: "Customers Managed", mine: 18, teamAvg: 15, goal: 20 },
    { metric: "Leads Converted", mine: 9, teamAvg: 6, goal: 12 },
    { metric: "Avg CSAT", mine: 4.6, teamAvg: 4.3, goal: 4.5 },
    { metric: "Avg Resolution (hrs)", mine: 6.2, teamAvg: 8.4, goal: 8 },
  ];

  const days = eachDayOfInterval({ start: subDays(new Date(), 13), end: new Date() });
  const trend = days.map((d, i) => ({
    date: format(d, "MMM d"),
    mine: 4 + (i % 3) + (i > 7 ? 2 : 0),
    teamAvg: 3 + (i % 2) + (i > 9 ? 1 : 0),
  }));

  const goalProgress = [
    { goal: "Quarterly Tasks", progress: 0.94, target: 50, current: 47 },
    { goal: "Ticket SLA Adherence", progress: 0.91, target: 100, current: 91 },
    { goal: "Lead Conversion", progress: 0.75, target: 12, current: 9 },
    { goal: "CSAT Score", progress: 1.02, target: 4.5, current: 4.6 },
  ];

  return { metrics, trend, goalProgress };
}

// ============================================================================
// Analytics
// ============================================================================

export interface AnalyticsKPIs {
  tasksCompleted: number;
  tasksCompletedDelta: number;
  ticketsResolved: number;
  ticketsResolvedDelta: number;
  leadsConverted: number;
  leadsConvertedDelta: number;
  csatScore: number;
  csatDelta: number;
}

export function getAnalyticsKPIs(): AnalyticsKPIs {
  return {
    tasksCompleted: 47,
    tasksCompletedDelta: 0.12,
    ticketsResolved: 32,
    ticketsResolvedDelta: -0.05,
    leadsConverted: 9,
    leadsConvertedDelta: 0.28,
    csatScore: 4.6,
    csatDelta: 0.04,
  };
}

export function getProductivityTrend(days = 14): {
  date: string;
  tasks: number;
  tickets: number;
}[] {
  const range = eachDayOfInterval({ start: subDays(new Date(), days - 1), end: new Date() });
  return range.map((d, i) => ({
    date: format(d, "MMM d"),
    tasks: 3 + ((i * 2) % 4) + (i > 7 ? 1 : 0),
    tickets: 2 + (i % 3) + (i > 5 ? 1 : 0),
  }));
}

export function getResolutionTimeTrend(days = 14): {
  date: string;
  hours: number;
  sla: number;
}[] {
  const range = eachDayOfInterval({ start: subDays(new Date(), days - 1), end: new Date() });
  return range.map((d, i) => ({
    date: format(d, "MMM d"),
    hours: +(8 - (i % 4) + (i > 8 ? -1 : 0)).toFixed(1),
    sla: 8,
  }));
}

export function getConversionTrend(days = 14): {
  date: string;
  leads: number;
  converted: number;
  rate: number;
}[] {
  const range = eachDayOfInterval({ start: subDays(new Date(), days - 1), end: new Date() });
  return range.map((d, i) => {
    const leads = 5 + (i % 4);
    const converted = Math.max(1, Math.round(leads * (0.3 + (i % 3) * 0.1)));
    return {
      date: format(d, "MMM d"),
      leads,
      converted,
      rate: +(converted / leads).toFixed(2),
    };
  });
}

export function getInteractionTrend(days = 14): {
  date: string;
  calls: number;
  emails: number;
  chats: number;
  meetings: number;
}[] {
  const range = eachDayOfInterval({ start: subDays(new Date(), days - 1), end: new Date() });
  return range.map((d, i) => ({
    date: format(d, "MMM d"),
    calls: 4 + (i % 4),
    emails: 8 + (i % 6),
    chats: 12 + (i % 8),
    meetings: 1 + (i % 3),
  }));
}

export interface TeamComparisonRow {
  metric: string;
  mine: number;
  teamAvg: number;
  top: number;
}

export function getTeamComparison(): TeamComparisonRow[] {
  return [
    { metric: "Tasks Completed", mine: 47, teamAvg: 38, top: 62 },
    { metric: "Tickets Resolved", mine: 32, teamAvg: 28, top: 41 },
    { metric: "Customers Managed", mine: 18, teamAvg: 15, top: 24 },
    { metric: "Leads Converted", mine: 9, teamAvg: 6, top: 14 },
    { metric: "Avg Resolution (hrs)", mine: 6.2, teamAvg: 8.4, top: 5.1 },
    { metric: "CSAT Score", mine: 4.6, teamAvg: 4.3, top: 4.9 },
  ];
}

// ============================================================================
// Team
// ============================================================================

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: "EMPLOYEE" | "AGENT" | "MANAGER";
  department: string;
  status: "active" | "on-leave" | "inactive";
  avatarColor: string;
  activeTasks: number;
  openTickets: number;
  performance: number; // 0-100
  joinDate: string;
  location: string;
  shift: string;
}

const TEAM_SEED: TeamMember[] = [
  {
    id: "u_001",
    name: "Aarav Sharma",
    email: "aarav.sharma@dayjoy.ai",
    phone: "+91 98765 43210",
    role: "AGENT",
    department: "Customer Support",
    status: "active",
    avatarColor: "bg-aurora",
    activeTasks: 8,
    openTickets: 4,
    performance: 92,
    joinDate: "2023-04-12",
    location: "Bengaluru, IN",
    shift: "9:00 AM – 6:00 PM IST",
  },
  {
    id: "u_002",
    name: "Diya Patel",
    email: "diya.patel@dayjoy.ai",
    phone: "+91 98765 11223",
    role: "AGENT",
    department: "Sales",
    status: "active",
    avatarColor: "bg-emerald-500/30",
    activeTasks: 12,
    openTickets: 2,
    performance: 88,
    joinDate: "2023-07-03",
    location: "Ahmedabad, IN",
    shift: "10:00 AM – 7:00 PM IST",
  },
  {
    id: "u_003",
    name: "Vivaan Gupta",
    email: "vivaan.gupta@dayjoy.ai",
    phone: "+91 98765 44556",
    role: "MANAGER",
    department: "Customer Support",
    status: "active",
    avatarColor: "bg-cyan/30",
    activeTasks: 5,
    openTickets: 1,
    performance: 95,
    joinDate: "2022-01-15",
    location: "Pune, IN",
    shift: "9:00 AM – 6:00 PM IST",
  },
  {
    id: "u_004",
    name: "Ananya Iyer",
    email: "ananya.iyer@dayjoy.ai",
    phone: "+91 98765 77889",
    role: "AGENT",
    department: "Sales",
    status: "on-leave",
    avatarColor: "bg-amber-500/30",
    activeTasks: 3,
    openTickets: 0,
    performance: 79,
    joinDate: "2023-11-21",
    location: "Chennai, IN",
    shift: "11:00 AM – 8:00 PM IST",
  },
  {
    id: "u_005",
    name: "Reyansh Kumar",
    email: "reyansh.kumar@dayjoy.ai",
    phone: "+91 98765 33445",
    role: "AGENT",
    department: "Operations",
    status: "active",
    avatarColor: "bg-rose-500/30",
    activeTasks: 7,
    openTickets: 5,
    performance: 84,
    joinDate: "2024-02-08",
    location: "Hyderabad, IN",
    shift: "9:30 AM – 6:30 PM IST",
  },
  {
    id: "u_006",
    name: "Saanvi Reddy",
    email: "saanvi.reddy@dayjoy.ai",
    phone: "+91 98765 99001",
    role: "EMPLOYEE",
    department: "Marketing",
    status: "active",
    avatarColor: "bg-indigo/30",
    activeTasks: 6,
    openTickets: 1,
    performance: 90,
    joinDate: "2023-09-14",
    location: "Bengaluru, IN",
    shift: "9:00 AM – 6:00 PM IST",
  },
];

export function getTeam(): TeamMember[] {
  return structuredClone(TEAM_SEED);
}

export function getTeamMember(id: string): TeamMember | undefined {
  return structuredClone(TEAM_SEED.find((m) => m.id === id));
}

export interface TeamMemberActivity {
  id: string;
  type: "task" | "ticket" | "lead" | "customer" | "attendance" | "note";
  title: string;
  description: string;
  timestamp: string;
}

export function getTeamMemberActivity(id: string): TeamMemberActivity[] {
  const base = [
    {
      type: "task" as const,
      title: "Completed task: Update CRM import script",
      description: "Marked task TSK-204 as done.",
      timestamp: subDays(new Date(), 0).toISOString(),
    },
    {
      type: "ticket" as const,
      title: "Resolved ticket TKT-5012",
      description: "Customer reported login MFA loop — fix deployed.",
      timestamp: subDays(new Date(), 1).toISOString(),
    },
    {
      type: "lead" as const,
      title: "Converted lead LD-883",
      description: "Globex Industries signed up for Voice Pro.",
      timestamp: subDays(new Date(), 2).toISOString(),
    },
    {
      type: "attendance" as const,
      title: "Checked in late",
      description: "Checked in at 10:18 AM (13 min late).",
      timestamp: subDays(new Date(), 3).toISOString(),
    },
    {
      type: "customer" as const,
      title: "Added customer: Acme Corp",
      description: "New customer created with onboarding call scheduled.",
      timestamp: subDays(new Date(), 4).toISOString(),
    },
    {
      type: "note" as const,
      title: "Added note to ticket TKT-4980",
      description: "“Awaiting backend fix — Slack channel linked.”",
      timestamp: subDays(new Date(), 5).toISOString(),
    },
  ];
  return base.map((b, i) => ({ id: `${id}_act_${i}`, ...b }));
}

// ============================================================================
// Saved reports
// ============================================================================

export interface SavedReport {
  id: string;
  name: string;
  category: "Sales" | "Tickets" | "Tasks" | "Performance" | "Custom";
  createdAt: string;
  lastRun: string;
  schedule: "Manual" | "Daily" | "Weekly" | "Monthly";
}

export function getSavedReports(): SavedReport[] {
  return [
    {
      id: "rpt_001",
      name: "Monthly Sales — All products",
      category: "Sales",
      createdAt: formatISO(subMonths(new Date(), 3)),
      lastRun: formatISO(subDays(new Date(), 2)),
      schedule: "Monthly",
    },
    {
      id: "rpt_002",
      name: "Weekly Ticket SLA",
      category: "Tickets",
      createdAt: formatISO(subMonths(new Date(), 6)),
      lastRun: formatISO(subDays(new Date(), 1)),
      schedule: "Weekly",
    },
    {
      id: "rpt_003",
      name: "Q3 Performance review",
      category: "Performance",
      createdAt: formatISO(subMonths(new Date(), 1)),
      lastRun: formatISO(subDays(new Date(), 7)),
      schedule: "Manual",
    },
    {
      id: "rpt_004",
      name: "Tasks closed — last 30 days",
      category: "Tasks",
      createdAt: formatISO(subMonths(new Date(), 2)),
      lastRun: formatISO(subDays(new Date(), 3)),
      schedule: "Daily",
    },
  ];
}

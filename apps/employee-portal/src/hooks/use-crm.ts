"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";
import type {
  Customer,
  CustomerFilters,
  Distributor,
  DistributorFilters,
  Lead,
  LeadFilters,
  CreateLeadInput,
  UpdateLeadInput,
} from "@/types/crm.types";

// ===== Customers =====

export function useCustomers(filters: CustomerFilters) {
  return useQuery({
    queryKey: [...QUERY_KEYS.customers, filters],
    queryFn: async () => {
      try {
        const data = await api.get<Customer[]>("/customers", {
          search: filters.search || undefined,
          type: filters.type !== "ALL" ? filters.type : undefined,
          status: filters.status !== "ALL" ? filters.status : undefined,
        });
        if (Array.isArray(data) && data.length > 0) return data;
        return mockCustomers();
      } catch {
        return mockCustomers();
      }
    },
    staleTime: 30 * 1000,
  });
}

export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: id ? QUERY_KEYS.customer(id) : ["customers", "undefined"],
    queryFn: async () => {
      try {
        return await api.get<Customer>(`/customers/${id}`);
      } catch {
        return (
          mockCustomers().find((c) => c.id === id) ??
          mockCustomers()[0]!
        );
      }
    },
    enabled: !!id,
  });
}

// ===== Distributors =====

export function useDistributors(filters: DistributorFilters) {
  return useQuery({
    queryKey: [...QUERY_KEYS.distributors, filters],
    queryFn: async () => {
      try {
        const data = await api.get<Distributor[]>("/distributors", {
          search: filters.search || undefined,
          tier: filters.tier !== "ALL" ? filters.tier : undefined,
          status: filters.status !== "ALL" ? filters.status : undefined,
        });
        if (Array.isArray(data) && data.length > 0) return data;
        return mockDistributors();
      } catch {
        return mockDistributors();
      }
    },
    staleTime: 30 * 1000,
  });
}

export function useDistributor(id: string | undefined) {
  return useQuery({
    queryKey: id ? QUERY_KEYS.distributor(id) : ["distributors", "undefined"],
    queryFn: async () => {
      try {
        return await api.get<Distributor>(`/distributors/${id}`);
      } catch {
        return (
          mockDistributors().find((d) => d.id === id) ??
          mockDistributors()[0]!
        );
      }
    },
    enabled: !!id,
  });
}

// ===== Leads =====

export function useLeads(filters: LeadFilters) {
  return useQuery({
    queryKey: [...QUERY_KEYS.leads, filters],
    queryFn: async () => {
      try {
        const data = await api.get<Lead[]>("/leads", {
          search: filters.search || undefined,
          source: filters.source !== "ALL" ? filters.source : undefined,
          status: filters.status !== "ALL" ? filters.status : undefined,
          assigneeId:
            filters.assigneeId !== "ALL" ? filters.assigneeId : undefined,
        });
        if (Array.isArray(data) && data.length > 0) return data;
        return mockLeads();
      } catch {
        return mockLeads();
      }
    },
    staleTime: 30 * 1000,
  });
}

export function useLead(id: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: id ? QUERY_KEYS.lead(id) : ["leads", "undefined"],
    queryFn: async () => {
      try {
        return await api.get<Lead>(`/leads/${id}`);
      } catch {
        return mockLeads().find((l) => l.id === id) ?? mockLeads()[0]!;
      }
    },
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateLeadInput }) =>
      api.put<Lead>(`/leads/${id}`, input).catch(() => undefined),
    onSuccess: () => {
      if (id) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lead(id) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.leads });
      }
    },
  });

  const convertMutation = useMutation({
    mutationFn: (leadId: string) =>
      api.post<{ customerId: string }>(`/leads/${leadId}/convert`).catch(() => ({
        customerId: `cus_new_${Math.random().toString(36).slice(2, 8)}`,
      })),
    onSuccess: () => {
      if (id) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lead(id) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.leads });
      }
      toast.success("Lead converted to customer");
    },
  });

  const noteMutation = useMutation({
    mutationFn: ({ leadId, note }: { leadId: string; note: string }) =>
      api.post(`/leads/${leadId}/notes`, { body: note }).catch(() => undefined),
    onSuccess: () => {
      if (id) queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lead(id) });
    },
  });

  return {
    lead: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    updateLead: (input: UpdateLeadInput) =>
      updateMutation.mutateAsync({ id: id!, input }),
    convertLead: () => convertMutation.mutateAsync(id!),
    addNote: (note: string) =>
      noteMutation.mutateAsync({ leadId: id!, note }),
  };
}

export function useCreateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLeadInput) =>
      api.post<Lead>("/leads", input).catch(() => mockLead(input)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.leads });
      toast.success("Lead created");
    },
  });
}

// ===== Mock data =====

function mockCustomers(): Customer[] {
  const today = new Date().toISOString();
  const lastWeek = new Date();
  lastWeek.setDate(lastWeek.getDate() - 7);
  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);

  return [
    {
      id: "cus_001",
      name: "Rajesh Kumar",
      email: "rajesh.kumar@gmail.com",
      phone: "+91 98765 43210",
      type: "INDIVIDUAL",
      status: "ACTIVE",
      city: "Mumbai",
      state: "Maharashtra",
      lifetimeValue: 184500,
      currency: "INR",
      totalOrders: 12,
      lastOrderAt: lastWeek.toISOString(),
      assignedToName: "You",
      tags: ["VIP", "Wellness"],
      createdAt: lastMonth.toISOString(),
      updatedAt: today,
      orders: [
        {
          id: "ord_1",
          number: "ORD-22931",
          total: 14999,
          status: "DELIVERED",
          createdAt: lastWeek.toISOString(),
        },
        {
          id: "ord_2",
          number: "ORD-22401",
          total: 7499,
          status: "DELIVERED",
          createdAt: lastMonth.toISOString(),
        },
      ],
      interactions: [
        {
          id: "i1",
          type: "CALL",
          summary: "Discussed bulk order for wellness bundle. Wants pricing.",
          channel: "Outbound call",
          createdAt: lastWeek.toISOString(),
          handledBy: "You",
        },
      ],
      notes: [
        {
          id: "n1",
          body: "Prefers calls before 11am. Strong interest in Q3 bundles.",
          authorId: "u_001",
          authorName: "Priya Sharma",
          createdAt: lastWeek.toISOString(),
        },
      ],
      ticketIds: ["tkt_4821"],
    },
    {
      id: "cus_002",
      name: "Sunita Traders",
      email: "accounts@sunitatraders.in",
      phone: "+91 91234 56780",
      type: "WHOLESALE",
      status: "ACTIVE",
      city: "Pune",
      state: "Maharashtra",
      gstin: "27AABCS1234L1Z5",
      lifetimeValue: 924000,
      currency: "INR",
      totalOrders: 38,
      lastOrderAt: today,
      assignedToName: "You",
      tags: ["B2B", "Wholesale"],
      createdAt: new Date(2024, 0).toISOString(),
      updatedAt: today,
      orders: [
        {
          id: "ord_3",
          number: "ORD-22950",
          total: 84500,
          status: "PROCESSING",
          createdAt: today,
        },
      ],
      interactions: [],
      notes: [],
      ticketIds: ["tkt_4818"],
    },
    {
      id: "cus_003",
      name: "Meena Iyer",
      email: "meena.iyer@gmail.com",
      phone: "+91 99876 54321",
      type: "INDIVIDUAL",
      status: "ACTIVE",
      city: "Bengaluru",
      state: "Karnataka",
      lifetimeValue: 32400,
      currency: "INR",
      totalOrders: 4,
      lastOrderAt: lastMonth.toISOString(),
      assignedToName: "You",
      tags: ["New"],
      createdAt: lastMonth.toISOString(),
      updatedAt: today,
      orders: [],
      interactions: [],
      notes: [],
      ticketIds: [],
    },
    {
      id: "cus_004",
      name: "Anil Verma",
      email: "anil.verma@outlook.com",
      phone: "+91 90909 80808",
      type: "INDIVIDUAL",
      status: "ACTIVE",
      city: "Delhi",
      state: "Delhi",
      lifetimeValue: 8900,
      currency: "INR",
      totalOrders: 2,
      lastOrderAt: lastMonth.toISOString(),
      assignedToName: "You",
      tags: [],
      createdAt: lastMonth.toISOString(),
      updatedAt: today,
      orders: [],
      interactions: [],
      notes: [],
      ticketIds: ["tkt_4801"],
    },
    {
      id: "cus_005",
      name: "Wellness Roots Pvt Ltd",
      email: "info@wellnessroots.in",
      phone: "+91 80123 45678",
      type: "DISTRIBUTOR",
      status: "ACTIVE",
      city: "Hyderabad",
      state: "Telangana",
      gstin: "36AABCW5678R1Z2",
      lifetimeValue: 1280000,
      currency: "INR",
      totalOrders: 64,
      lastOrderAt: today,
      assignedToName: "You",
      tags: ["Gold-tier"],
      createdAt: new Date(2023, 5).toISOString(),
      updatedAt: today,
      orders: [],
      interactions: [],
      notes: [],
      ticketIds: [],
    },
    {
      id: "cus_006",
      name: "Kavita Reddy",
      email: "kavita.reddy@gmail.com",
      phone: "+91 99000 11223",
      type: "INDIVIDUAL",
      status: "INACTIVE",
      city: "Chennai",
      state: "Tamil Nadu",
      lifetimeValue: 4500,
      currency: "INR",
      totalOrders: 1,
      lastOrderAt: new Date(2024, 8).toISOString(),
      assignedToName: "You",
      tags: ["Inactive"],
      createdAt: new Date(2024, 8).toISOString(),
      updatedAt: new Date(2024, 8).toISOString(),
      orders: [],
      interactions: [],
      notes: [],
      ticketIds: [],
    },
  ];
}

function mockDistributors(): Distributor[] {
  const today = new Date().toISOString();
  return [
    {
      id: "dist_001",
      code: "DJ-GOLD-001",
      companyName: "Wellness Roots Pvt Ltd",
      contactPerson: "Suresh Babu",
      email: "info@wellnessroots.in",
      phone: "+91 80123 45678",
      city: "Hyderabad",
      state: "Telangana",
      gstin: "36AABCW5678R1Z2",
      tier: "GOLD",
      status: "ACTIVE",
      commissionRate: 18,
      joinedAt: new Date(2023, 5).toISOString(),
      lifetimeValue: 1280000,
      currency: "INR",
      totalOrders: 64,
      totalDownline: 8,
      assignedToName: "You",
      createdAt: new Date(2023, 5).toISOString(),
      updatedAt: today,
      salesPoints: [
        { id: "sp1", name: "Wellness Roots — Hyderabad HQ", city: "Hyderabad", status: "ACTIVE" },
        { id: "sp2", name: "Wellness Roots — Vijayawada branch", city: "Vijayawada", status: "ACTIVE" },
      ],
      team: [
        { id: "tm1", name: "Suresh Babu", tier: "GOLD", joinedAt: new Date(2023, 5).toISOString() },
        { id: "tm2", name: "Lakshmi N.", tier: "SILVER", joinedAt: new Date(2024, 0).toISOString() },
      ],
      performance: [
        { month: "2026-05", revenue: 245000, ordersCount: 14, newCustomers: 3 },
        { month: "2026-06", revenue: 318000, ordersCount: 18, newCustomers: 5 },
        { month: "2026-07", revenue: 287500, ordersCount: 16, newCustomers: 4 },
      ],
    },
    {
      id: "dist_002",
      code: "DJ-SILV-014",
      companyName: "GreenLeaf Distributors",
      contactPerson: "Anita Desai",
      email: "hello@greenleaf.co",
      phone: "+91 98765 11111",
      city: "Pune",
      state: "Maharashtra",
      gstin: "27AABCGL9876R1Z1",
      tier: "SILVER",
      status: "ACTIVE",
      commissionRate: 14,
      joinedAt: new Date(2024, 2).toISOString(),
      lifetimeValue: 542000,
      currency: "INR",
      totalOrders: 28,
      totalDownline: 3,
      assignedToName: "You",
      createdAt: new Date(2024, 2).toISOString(),
      updatedAt: today,
      salesPoints: [
        { id: "sp3", name: "GreenLeaf — Pune main", city: "Pune", status: "ACTIVE" },
      ],
      team: [],
      performance: [
        { month: "2026-05", revenue: 86000, ordersCount: 5, newCustomers: 1 },
        { month: "2026-06", revenue: 142000, ordersCount: 8, newCustomers: 2 },
        { month: "2026-07", revenue: 118000, ordersCount: 6, newCustomers: 1 },
      ],
    },
    {
      id: "dist_003",
      code: "DJ-BRZ-098",
      companyName: "Healthy Homes",
      contactPerson: "Manoj Pillai",
      email: "manoj@healthyhomes.in",
      phone: "+91 90909 76543",
      city: "Kochi",
      state: "Kerala",
      tier: "BRONZE",
      status: "PENDING",
      commissionRate: 10,
      joinedAt: new Date(2026, 6).toISOString(),
      lifetimeValue: 0,
      currency: "INR",
      totalOrders: 0,
      totalDownline: 0,
      assignedToName: "You",
      createdAt: new Date(2026, 6).toISOString(),
      updatedAt: today,
      salesPoints: [],
      team: [],
      performance: [],
    },
    {
      id: "dist_004",
      code: "DJ-PLT-005",
      companyName: "Sunrise Wellness Co.",
      contactPerson: "Deepak Mehta",
      email: "deepak@sunrisewellness.in",
      phone: "+91 98111 22334",
      city: "Ahmedabad",
      state: "Gujarat",
      gstin: "24AABCSUN5566R1Z7",
      tier: "PLATINUM",
      status: "ACTIVE",
      commissionRate: 22,
      joinedAt: new Date(2022, 1).toISOString(),
      lifetimeValue: 3120000,
      currency: "INR",
      totalOrders: 142,
      totalDownline: 21,
      assignedToName: "You",
      createdAt: new Date(2022, 1).toISOString(),
      updatedAt: today,
      salesPoints: [
        { id: "sp4", name: "Sunrise — Ahmedabad HQ", city: "Ahmedabad", status: "ACTIVE" },
        { id: "sp5", name: "Sunrise — Surat branch", city: "Surat", status: "ACTIVE" },
        { id: "sp6", name: "Sunrise — Rajkot branch", city: "Rajkot", status: "ACTIVE" },
      ],
      team: [
        { id: "tm3", name: "Deepak Mehta", tier: "PLATINUM", joinedAt: new Date(2022, 1).toISOString() },
        { id: "tm4", name: "Pooja Mehta", tier: "GOLD", joinedAt: new Date(2023, 0).toISOString() },
      ],
      performance: [
        { month: "2026-05", revenue: 412000, ordersCount: 22, newCustomers: 4 },
        { month: "2026-06", revenue: 488000, ordersCount: 26, newCustomers: 6 },
        { month: "2026-07", revenue: 521000, ordersCount: 28, newCustomers: 7 },
      ],
    },
  ];
}

function mockLead(input?: CreateLeadInput): Lead {
  const now = new Date().toISOString();
  return {
    id: `lead_${Math.random().toString(36).slice(2, 10)}`,
    name: input?.name ?? "New lead",
    email: input?.email,
    phone: input?.phone,
    company: input?.company,
    source: input?.source ?? "OTHER",
    status: input?.status ?? "NEW",
    score: 0,
    budget: input?.budget,
    interestedIn: input?.interestedIn,
    notes: input?.notes,
    assignedToId: input?.assignedToId,
    assignedToName: "You",
    activity: [],
    createdAt: now,
    updatedAt: now,
  };
}

function mockLeads(): Lead[] {
  const now = new Date();
  const today = new Date(now);
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  const lastWeek = new Date(now); lastWeek.setDate(lastWeek.getDate() - 7);
  const twoWeeksAgo = new Date(now); twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  return [
    {
      id: "lead_001",
      name: "Vikram Reddy",
      email: "vikram.reddy@gmail.com",
      phone: "+91 91234 99988",
      company: "Self",
      source: "WEBSITE",
      status: "QUALIFIED",
      score: 72,
      budget: 25000,
      currency: "INR",
      interestedIn: "Wellness Bundle",
      assignedToName: "You",
      expectedCloseDate: new Date(now.getFullYear(), now.getMonth() + 1, 15).toISOString(),
      activity: [
        { id: "a1", type: "NOTE", description: "Initial enquiry via website chat.", actorName: "System", createdAt: twoWeeksAgo.toISOString() },
        { id: "a2", type: "CALL", description: "Spoke with Vikram — sent pricing PDF.", actorName: "You", createdAt: lastWeek.toISOString() },
        { id: "a3", type: "STATUS_CHANGE", description: "Moved from Contacted → Qualified.", actorName: "You", createdAt: yesterday.toISOString() },
      ],
      createdAt: twoWeeksAgo.toISOString(),
      updatedAt: yesterday.toISOString(),
      lastContactedAt: yesterday.toISOString(),
    },
    {
      id: "lead_002",
      name: "Meena Iyer",
      email: "meena.iyer@gmail.com",
      phone: "+91 99876 54321",
      company: "Self",
      source: "WHATSAPP",
      status: "NEGOTIATION",
      score: 88,
      budget: 50000,
      currency: "INR",
      interestedIn: "Wellness Bundle (bulk)",
      assignedToName: "You",
      expectedCloseDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3).toISOString(),
      activity: [
        { id: "a4", type: "NOTE", description: "Wants 50-unit bundle. Sent proposal.", actorName: "You", createdAt: yesterday.toISOString() },
      ],
      createdAt: lastWeek.toISOString(),
      updatedAt: today.toISOString(),
      lastContactedAt: today.toISOString(),
    },
    {
      id: "lead_003",
      name: "Suresh Industries",
      email: "purchase@sureshind.co",
      phone: "+91 80123 45678",
      company: "Suresh Industries Pvt Ltd",
      source: "REFERRAL",
      status: "CONTACTED",
      score: 54,
      budget: 120000,
      currency: "INR",
      interestedIn: "Corporate gifting",
      assignedToName: "You",
      activity: [],
      createdAt: yesterday.toISOString(),
      updatedAt: yesterday.toISOString(),
      lastContactedAt: yesterday.toISOString(),
    },
    {
      id: "lead_004",
      name: "Anjali Gupta",
      email: "anjali.g@gmail.com",
      phone: "+91 99000 22334",
      source: "VOICE_CALL",
      status: "NEW",
      score: 28,
      interestedIn: "Product info",
      assignedToName: "You",
      activity: [],
      createdAt: today.toISOString(),
      updatedAt: today.toISOString(),
    },
    {
      id: "lead_005",
      name: "Rohit Sharma",
      email: "rohit.sharma@gmail.com",
      phone: "+91 98765 11122",
      source: "EMAIL_CAMPAIGN",
      status: "WON",
      score: 100,
      budget: 18000,
      currency: "INR",
      interestedIn: "Wellness Bundle",
      customerId: "cus_007",
      convertedAt: yesterday.toISOString(),
      assignedToName: "You",
      activity: [],
      createdAt: twoWeeksAgo.toISOString(),
      updatedAt: yesterday.toISOString(),
    },
    {
      id: "lead_006",
      name: "Karan Malhotra",
      email: "karan.m@outlook.com",
      phone: "+91 90909 55566",
      source: "SOCIAL_MEDIA",
      status: "LOST",
      score: 18,
      interestedIn: "Wellness Bundle",
      assignedToName: "You",
      notes: "Went with competitor — pricing too high.",
      activity: [],
      createdAt: lastWeek.toISOString(),
      updatedAt: yesterday.toISOString(),
    },
  ];
}

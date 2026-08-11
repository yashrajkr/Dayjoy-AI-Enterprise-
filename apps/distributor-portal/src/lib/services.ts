import { api } from "@/lib/api";
import { sleep } from "@/lib/utils";
import {
  MOCK_AI_CONVERSATIONS,
  MOCK_AI_MESSAGES,
  MOCK_ANNOUNCEMENTS,
  MOCK_CUSTOMERS,
  MOCK_DOCUMENTS,
  MOCK_EVENTS,
  MOCK_KNOWLEDGE,
  MOCK_LEADS,
  MOCK_NOTIFICATIONS,
  MOCK_ORDERS,
  MOCK_PRODUCTS,
  MOCK_PROFILE,
  MOCK_TRAINING,
} from "@/lib/mock-data";
import type {
  AiConversation,
  AiMessage,
  Announcement,
  Customer,
  DocumentItem,
  DistributorProfile,
  EventItem,
  KnowledgeArticle,
  Lead,
  NotificationItem,
  Order,
  Product,
  TrainingModule,
} from "@/types";

/**
 * Service layer for the Distributor Portal.
 *
 * Each method first attempts the real backend API. On any error (network,
 * 401, 404, 5xx) it falls back to the corresponding mock dataset so every
 * page renders end-to-end without a live backend.
 *
 * This "API-first with mock fallback" pattern lets the portal ship today
 * against the backend's progress and switch to API-only by removing the
 * catch blocks when the backend is fully wired.
 */

const LATENCY = 250; // ms — simulated network latency for mock responses

async function withFallback<T>(
  apiCall: () => Promise<T>,
  mock: () => Promise<T>,
): Promise<T> {
  try {
    return await apiCall();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[portal] API call failed, falling back to mock:", err);
    return mock();
  }
}

// ===== Leads =====
export const leadsService = {
  async list(params?: {
    search?: string;
    stage?: string;
    source?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: Lead[]; total: number }> {
    return withFallback(
      () => api.get<{ data: Lead[]; total: number }>("/leads", params),
      async () => {
        await sleep(LATENCY);
        let data = [...MOCK_LEADS];
        const { search, stage, source } = params ?? {};
        if (search) {
          const q = search.toLowerCase();
          data = data.filter(
            (l) =>
              `${l.firstName} ${l.lastName}`.toLowerCase().includes(q) ||
              l.email?.toLowerCase().includes(q) ||
              l.phone?.toLowerCase().includes(q),
          );
        }
        if (stage) data = data.filter((l) => l.stage === stage);
        if (source) data = data.filter((l) => l.source === source);
        return { data, total: data.length };
      },
    );
  },

  async get(id: string): Promise<Lead> {
    return withFallback(
      () => api.get<Lead>(`/leads/${id}`),
      async () => {
        await sleep(LATENCY);
        const lead = MOCK_LEADS.find((l) => l.id === id);
        if (!lead) throw new Error("Lead not found");
        return lead;
      },
    );
  },

  async create(
    payload: Omit<Lead, "id" | "activities" | "notes" | "assignedAt" | "lastContactedAt" | "convertedCustomerId">,
  ): Promise<Lead> {
    return withFallback(
      () => api.post<Lead>("/leads", payload),
      async () => {
        await sleep(LATENCY);
        const newLead: Lead = {
          ...payload,
          id: `lead_${Date.now()}`,
          notes: [],
          activities: [
            {
              id: `a_${Date.now()}`,
              type: "STATUS_CHANGE",
              title: "Lead created",
              description: `Source: ${payload.source}`,
              createdAt: new Date().toISOString(),
            },
          ],
          assignedAt: new Date().toISOString(),
          lastContactedAt: null,
          convertedCustomerId: null,
        };
        return newLead;
      },
    );
  },

  async addNote(id: string, body: string): Promise<Lead> {
    return withFallback(
      () => api.post<Lead>(`/leads/${id}/notes`, { body }),
      async () => {
        await sleep(LATENCY);
        const lead = MOCK_LEADS.find((l) => l.id === id);
        if (!lead) throw new Error("Lead not found");
        lead.notes.unshift({
          id: `n_${Date.now()}`,
          body,
          author: "You",
          createdAt: new Date().toISOString(),
        });
        lead.activities.unshift({
          id: `a_${Date.now()}`,
          type: "NOTE",
          title: "Note added",
          description: body,
          createdAt: new Date().toISOString(),
        });
        return lead;
      },
    );
  },

  async updateStage(id: string, stage: Lead["stage"]): Promise<Lead> {
    return withFallback(
      () => api.patch<Lead>(`/leads/${id}/stage`, { stage }),
      async () => {
        await sleep(LATENCY);
        const lead = MOCK_LEADS.find((l) => l.id === id);
        if (!lead) throw new Error("Lead not found");
        lead.stage = stage;
        lead.activities.unshift({
          id: `a_${Date.now()}`,
          type: "STATUS_CHANGE",
          title: `Stage → ${stage}`,
          timestamp: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        });
        return lead;
      },
    );
  },

  async convert(id: string): Promise<Lead> {
    return withFallback(
      () => api.post<Lead>(`/leads/${id}/convert`),
      async () => {
        await sleep(LATENCY);
        const lead = MOCK_LEADS.find((l) => l.id === id);
        if (!lead) throw new Error("Lead not found");
        lead.stage = "CONVERTED";
        lead.convertedCustomerId = `cus_${Date.now()}`;
        lead.activities.unshift({
          id: `a_${Date.now()}`,
          type: "STATUS_CHANGE",
          title: "Converted to customer",
          description: `Customer ID: ${lead.convertedCustomerId}`,
          createdAt: new Date().toISOString(),
        });
        return lead;
      },
    );
  },

  async suggestScore(payload: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    company?: string;
    interest?: string;
    source: string;
  }): Promise<{ score: number; reasoning: string }> {
    return withFallback(
      () => api.post<{ score: number; reasoning: string }>("/ai/lead-score", payload),
      async () => {
        await sleep(900);
        let score = 40;
        const reasoning: string[] = [];
        if (payload.source === "REFERRAL") {
          score += 25;
          reasoning.push("Referral leads have 2.4× higher conversion rate.");
        } else if (payload.source === "EVENT") {
          score += 20;
          reasoning.push("Event leads are pre-warmed and high-intent.");
        } else if (payload.source === "WEBSITE") {
          score += 12;
          reasoning.push("Website form submissions show active interest.");
        } else if (payload.source === "SOCIAL_MEDIA") {
          score += 8;
          reasoning.push("Social media leads require more nurturing.");
        }
        if (payload.company) {
          score += 15;
          reasoning.push("Business affiliation indicates higher LTV potential.");
        }
        if (payload.interest && payload.interest.length > 10) {
          score += 10;
          reasoning.push("Specific product interest shows clear intent.");
        }
        if (payload.email && payload.phone) {
          score += 5;
          reasoning.push("Multiple contact channels improve reachability.");
        }
        score = Math.min(98, score);
        return {
          score,
          reasoning: `${reasoning.join(" ")} Suggested stage: ${score >= 75 ? "QUALIFIED" : score >= 50 ? "CONTACTED" : "NEW"}.`,
        };
      },
    );
  },

  async suggestNextAction(id: string): Promise<{ action: string; script: string; priority: string }> {
    return withFallback(
      () => api.get<{ action: string; script: string; priority: string }>(`/ai/leads/${id}/next-action`),
      async () => {
        await sleep(800);
        const lead = MOCK_LEADS.find((l) => l.id === id);
        if (!lead) throw new Error("Lead not found");
        if (lead.stage === "NEW") {
          return {
            action: "Send WhatsApp introduction within 24 hours",
            script: `Hi ${lead.firstName}! This is Anil from Dayjoy. Thanks for your interest in our wellness range. I'd love to share a quick 5-min demo — what time works best today or tomorrow?`,
            priority: "HIGH",
          };
        }
        if (lead.stage === "CONTACTED") {
          return {
            action: "Schedule a discovery call this week",
            script: `Hi ${lead.firstName}, following up on our last chat. I've put together a personalized plan for you. Can we hop on a 15-min call this week? Tuesday 4 PM or Wednesday 11 AM work for me.`,
            priority: "HIGH",
          };
        }
        if (lead.stage === "QUALIFIED") {
          return {
            action: "Send proposal + bundle offer",
            script: `Hi ${lead.firstName}, based on our discussions, here's a custom bundle for you with a special 10% launch discount valid for 7 days. Shall I lock in your order?`,
            priority: "CRITICAL",
          };
        }
        return {
          action: "Re-engage with a value-add message",
          script: `Hi ${lead.firstName}, sharing a quick case study you might find useful — how a similar customer saved 30% by switching to Dayjoy. Open to a quick chat?`,
          priority: "MEDIUM",
        };
      },
    );
  },
};

// ===== Customers =====
export const customersService = {
  async list(params?: {
    search?: string;
    type?: string;
    status?: string;
  }): Promise<Customer[]> {
    return withFallback(
      () => api.get<Customer[]>("/customers", params),
      async () => {
        await sleep(LATENCY);
        let data = [...MOCK_CUSTOMERS];
        const { search, type, status } = params ?? {};
        if (search) {
          const q = search.toLowerCase();
          data = data.filter(
            (c) =>
              `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
              c.email?.toLowerCase().includes(q) ||
              c.phone.toLowerCase().includes(q),
          );
        }
        if (type) data = data.filter((c) => c.type === type);
        if (status) data = data.filter((c) => c.status === status);
        return data;
      },
    );
  },

  async get(id: string): Promise<Customer> {
    return withFallback(
      () => api.get<Customer>(`/customers/${id}`),
      async () => {
        await sleep(LATENCY);
        const customer = MOCK_CUSTOMERS.find((c) => c.id === id);
        if (!customer) throw new Error("Customer not found");
        return customer;
      },
    );
  },

  async getOrders(customerId: string): Promise<Order[]> {
    return withFallback(
      () => api.get<Order[]>(`/customers/${customerId}/orders`),
      async () => {
        await sleep(LATENCY);
        return MOCK_ORDERS.filter((o) => o.customerId === customerId);
      },
    );
  },

  async getConversations(customerId: string): Promise<AiConversation[]> {
    return withFallback(
      () => api.get<AiConversation[]>(`/customers/${customerId}/conversations`),
      async () => {
        await sleep(LATENCY);
        return MOCK_AI_CONVERSATIONS.slice(0, 2);
      },
    );
  },

  async addNote(id: string, body: string): Promise<Customer> {
    return withFallback(
      () => api.post<Customer>(`/customers/${id}/notes`, { body }),
      async () => {
        await sleep(LATENCY);
        const customer = MOCK_CUSTOMERS.find((c) => c.id === id);
        if (!customer) throw new Error("Customer not found");
        customer.notes.unshift({
          id: `n_${Date.now()}`,
          body,
          author: "You",
          createdAt: new Date().toISOString(),
        });
        return customer;
      },
    );
  },
};

// ===== Products =====
export const productsService = {
  async list(params?: {
    search?: string;
    category?: string;
  }): Promise<Product[]> {
    return withFallback(
      () => api.get<Product[]>("/products", params),
      async () => {
        await sleep(LATENCY);
        let data = [...MOCK_PRODUCTS];
        const { search, category } = params ?? {};
        if (search) {
          const q = search.toLowerCase();
          data = data.filter(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              p.sku.toLowerCase().includes(q) ||
              p.description.toLowerCase().includes(q),
          );
        }
        if (category) data = data.filter((p) => p.category === category);
        return data;
      },
    );
  },

  async get(id: string): Promise<Product> {
    return withFallback(
      () => api.get<Product>(`/products/${id}`),
      async () => {
        await sleep(LATENCY);
        const product = MOCK_PRODUCTS.find((p) => p.id === id);
        if (!product) throw new Error("Product not found");
        return product;
      },
    );
  },

  async generatePitch(productId: string): Promise<{ pitch: string; keyPoints: string[] }> {
    return withFallback(
      () => api.post<{ pitch: string; keyPoints: string[] }>("/ai/product-pitch", { productId }),
      async () => {
        await sleep(1200);
        const product = MOCK_PRODUCTS.find((p) => p.id === productId);
        if (!product) throw new Error("Product not found");
        return {
          pitch: `Meet the ${product.name} — ${product.description}

Here's why your customers will love it:
${product.features.map((f) => `• ${f}`).join("\n")}

At an MRP of ₹${product.mrp}, your customer gets premium quality. As a Dayjoy distributor, you earn ${product.commissionRate}% commission (₹${Math.round(product.distributorPrice * product.commissionRate / 100)} per unit sold).

**Best-suited for:** ${product.category === "WELLNESS" ? "busy professionals, homemakers, and wellness enthusiasts" : product.category === "BEAUTY" ? "anyone 25+ concerned about skin health" : product.category === "NUTRITION" ? "fitness enthusiasts and busy professionals skipping meals" : "households upgrading their lifestyle"}.

**Close:** "Would you like me to set one up for you this week? I can offer free delivery in your area."`,
          keyPoints: [
            `${product.commissionRate}% commission (₹${Math.round(product.distributorPrice * product.commissionRate / 100)}/unit)`,
            `${product.stock} units in stock`,
            `${product.rating}★ rating (${product.reviewCount} reviews)`,
            `Bundle idea: pair with ${product.category === "WELLNESS" ? "Zen Essential Oil Set" : "Glow Diffuser"}`,
          ],
        };
      },
    );
  },
};

// ===== Orders =====
export const ordersService = {
  async list(params?: {
    search?: string;
    status?: string;
  }): Promise<Order[]> {
    return withFallback(
      () => api.get<Order[]>("/orders", params),
      async () => {
        await sleep(LATENCY);
        let data = [...MOCK_ORDERS];
        const { search, status } = params ?? {};
        if (search) {
          const q = search.toLowerCase();
          data = data.filter(
            (o) =>
              o.orderNumber.toLowerCase().includes(q) ||
              o.customerName.toLowerCase().includes(q),
          );
        }
        if (status) data = data.filter((o) => o.status === status);
        return data;
      },
    );
  },

  async get(id: string): Promise<Order> {
    return withFallback(
      () => api.get<Order>(`/orders/${id}`),
      async () => {
        await sleep(LATENCY);
        const order = MOCK_ORDERS.find((o) => o.id === id);
        if (!order) throw new Error("Order not found");
        return order;
      },
    );
  },

  async create(payload: {
    customerId: string;
    items: { productId: string; quantity: number }[];
    shippingAddress: string;
  }): Promise<Order> {
    return withFallback(
      () => api.post<Order>("/orders", payload),
      async () => {
        await sleep(800);
        const customer = MOCK_CUSTOMERS.find((c) => c.id === payload.customerId);
        if (!customer) throw new Error("Customer not found");
        const items = payload.items.map((it, idx) => {
          const product = MOCK_PRODUCTS.find((p) => p.id === it.productId);
          if (!product) throw new Error("Product not found");
          const lineTotal = product.distributorPrice * it.quantity;
          const commissionEarned = Math.round(lineTotal * product.commissionRate / 100);
          return {
            id: `oi_${Date.now()}_${idx}`,
            productId: product.id,
            productName: product.name,
            productImage: product.images[0] ?? null,
            quantity: it.quantity,
            unitPrice: product.distributorPrice,
            commissionRate: product.commissionRate,
            lineTotal,
            commissionEarned,
          };
        });
        const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
        const tax = Math.round(subtotal * 0.18);
        const shipping = subtotal > 5000 ? 0 : 149;
        const total = subtotal + tax + shipping;
        const commissionEarned = items.reduce((s, i) => s + i.commissionEarned, 0);
        const orderNumber = `DJ-ORD-2026-${String(Math.floor(Math.random() * 999) + 200).padStart(4, "0")}`;
        const newOrder: Order = {
          id: `ord_${Date.now()}`,
          orderNumber,
          customerId: customer.id,
          customerName: `${customer.firstName} ${customer.lastName}`,
          customerPhone: customer.phone,
          items,
          subtotal,
          tax,
          shipping,
          total,
          commissionEarned,
          status: "PENDING",
          shippingAddress: payload.shippingAddress,
          trackingNumber: null,
          trackingUrl: null,
          invoiceUrl: null,
          timeline: [
            {
              id: `t_${Date.now()}`,
              status: "CREATED",
              label: "Order Placed",
              timestamp: new Date().toISOString(),
            },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        return newOrder;
      },
    );
  },
};

// ===== AI Assistant =====
export const aiService = {
  async getConversations(): Promise<AiConversation[]> {
    return withFallback(
      () => api.get<AiConversation[]>("/ai/conversations"),
      async () => {
        await sleep(LATENCY);
        return MOCK_AI_CONVERSATIONS;
      },
    );
  },

  async getMessages(conversationId: string): Promise<AiMessage[]> {
    return withFallback(
      () => api.get<AiMessage[]>(`/ai/conversations/${conversationId}/messages`),
      async () => {
        await sleep(LATENCY);
        return MOCK_AI_MESSAGES[conversationId] ?? [];
      },
    );
  },

  async send(conversationId: string, content: string): Promise<AiMessage> {
    return withFallback(
      () => api.post<AiMessage>(`/ai/conversations/${conversationId}/messages`, { content }),
      async () => {
        await sleep(900);
        return {
          id: `m_${Date.now()}`,
          role: "assistant",
          content: `Here's my response to: "${content.slice(0, 80)}${content.length > 80 ? "…" : ""}"

I can help you with:
- Generating sales pitches for any Dayjoy product
- Suggesting follow-up messages for leads
- Analyzing your team's performance
- Building a tier-advancement strategy
- Crafting WhatsApp broadcasts
- Writing customer onboarding sequences

Try one of the quick actions on the left, or ask me a specific question.`,
          citations: [
            { source: "kb_001", title: "Compensation Plan Overview" },
          ],
          createdAt: new Date().toISOString(),
        };
      },
    );
  },
};

// ===== Training =====
export const trainingService = {
  async list(params?: { category?: string; status?: "all" | "completed" | "in-progress" | "locked" }): Promise<TrainingModule[]> {
    return withFallback(
      () => api.get<TrainingModule[]>("/training/modules", params),
      async () => {
        await sleep(LATENCY);
        let data = [...MOCK_TRAINING].sort((a, b) => a.order - b.order);
        const { category, status } = params ?? {};
        if (category) data = data.filter((m) => m.category === category);
        if (status === "completed") data = data.filter((m) => m.completed);
        if (status === "in-progress") data = data.filter((m) => !m.completed && !m.locked && m.progress > 0);
        if (status === "locked") data = data.filter((m) => m.locked);
        return data;
      },
    );
  },

  async get(id: string): Promise<TrainingModule> {
    return withFallback(
      () => api.get<TrainingModule>(`/training/modules/${id}`),
      async () => {
        await sleep(LATENCY);
        const mod = MOCK_TRAINING.find((m) => m.id === id);
        if (!mod) throw new Error("Training module not found");
        return mod;
      },
    );
  },

  async markComplete(id: string): Promise<TrainingModule> {
    return withFallback(
      () => api.post<TrainingModule>(`/training/modules/${id}/complete`),
      async () => {
        await sleep(LATENCY);
        const mod = MOCK_TRAINING.find((m) => m.id === id);
        if (!mod) throw new Error("Training module not found");
        mod.completed = true;
        mod.progress = 100;
        return mod;
      },
    );
  },

  async submitQuiz(id: string, answers: number[]): Promise<{ passed: boolean; score: number }> {
    return withFallback(
      () => api.post<{ passed: boolean; score: number }>(`/training/modules/${id}/quiz`, { answers }),
      async () => {
        await sleep(800);
        const mod = MOCK_TRAINING.find((m) => m.id === id);
        if (!mod?.quiz) return { passed: false, score: 0 };
        const correct = answers.reduce(
          (sum, ans, idx) => sum + (ans === mod.quiz!.questions[idx]?.correctIndex ? 1 : 0),
          0,
        );
        const score = Math.round((correct / mod.quiz.questions.length) * 100);
        return { passed: score >= mod.quiz.passingScore, score };
      },
    );
  },
};

// ===== Knowledge =====
export const knowledgeService = {
  async list(params?: { search?: string; category?: string }): Promise<KnowledgeArticle[]> {
    return withFallback(
      () => api.get<KnowledgeArticle[]>("/knowledge/articles", params),
      async () => {
        await sleep(LATENCY);
        let data = [...MOCK_KNOWLEDGE];
        const { search, category } = params ?? {};
        if (search) {
          const q = search.toLowerCase();
          data = data.filter(
            (a) =>
              a.title.toLowerCase().includes(q) ||
              a.summary.toLowerCase().includes(q) ||
              a.content.toLowerCase().includes(q),
          );
        }
        if (category) data = data.filter((a) => a.category === category);
        return data;
      },
    );
  },

  async get(slug: string): Promise<KnowledgeArticle> {
    return withFallback(
      () => api.get<KnowledgeArticle>(`/knowledge/articles/${slug}`),
      async () => {
        await sleep(LATENCY);
        const article = MOCK_KNOWLEDGE.find((a) => a.slug === slug);
        if (!article) throw new Error("Article not found");
        return article;
      },
    );
  },

  async feedback(id: string, helpful: boolean): Promise<void> {
    return withFallback(
      () => api.post<void>(`/knowledge/articles/${id}/feedback`, { helpful }),
      async () => {
        await sleep(200);
        const article = MOCK_KNOWLEDGE.find((a) => a.id === id);
        if (!article) return;
        if (helpful) article.helpful += 1;
        else article.notHelpful += 1;
      },
    );
  },
};

// ===== Announcements =====
export const announcementsService = {
  async list(params?: { category?: string }): Promise<Announcement[]> {
    return withFallback(
      () => api.get<Announcement[]>("/announcements", params),
      async () => {
        await sleep(LATENCY);
        let data = [...MOCK_ANNOUNCEMENTS];
        const { category } = params ?? {};
        if (category) data = data.filter((a) => a.category === category);
        return data.sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
        });
      },
    );
  },

  async markRead(id: string): Promise<void> {
    return withFallback(
      () => api.post<void>(`/announcements/${id}/read`),
      async () => {
        await sleep(100);
        const ann = MOCK_ANNOUNCEMENTS.find((a) => a.id === id);
        if (ann) ann.read = true;
      },
    );
  },
};

// ===== Events =====
export const eventsService = {
  async list(): Promise<EventItem[]> {
    return withFallback(
      () => api.get<EventItem[]>("/events"),
      async () => {
        await sleep(LATENCY);
        return [...MOCK_EVENTS].sort(
          (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
        );
      },
    );
  },

  async rsvp(id: string, attending: boolean): Promise<EventItem> {
    return withFallback(
      () => api.post<EventItem>(`/events/${id}/rsvp`, { attending }),
      async () => {
        await sleep(LATENCY);
        const event = MOCK_EVENTS.find((e) => e.id === id);
        if (!event) throw new Error("Event not found");
        if (attending && !event.rsvped) {
          event.rsvped = true;
          event.registered += 1;
        } else if (!attending && event.rsvped) {
          event.rsvped = false;
          event.registered -= 1;
        }
        return event;
      },
    );
  },
};

// ===== Notifications =====
export const notificationsService = {
  async list(params?: { type?: string; unreadOnly?: boolean }): Promise<NotificationItem[]> {
    return withFallback(
      () => api.get<NotificationItem[]>("/notifications", params),
      async () => {
        await sleep(LATENCY);
        let data = [...MOCK_NOTIFICATIONS];
        const { type, unreadOnly } = params ?? {};
        if (type) data = data.filter((n) => n.type === type);
        if (unreadOnly) data = data.filter((n) => !n.read);
        return data.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
      },
    );
  },

  async markRead(id: string): Promise<void> {
    return withFallback(
      () => api.post<void>(`/notifications/${id}/read`),
      async () => {
        await sleep(100);
        const n = MOCK_NOTIFICATIONS.find((x) => x.id === id);
        if (n) n.read = true;
      },
    );
  },

  async markAllRead(): Promise<void> {
    return withFallback(
      () => api.post<void>("/notifications/read-all"),
      async () => {
        await sleep(200);
        MOCK_NOTIFICATIONS.forEach((n) => (n.read = true));
      },
    );
  },
};

// ===== Documents =====
export const documentsService = {
  async list(params?: { category?: string }): Promise<DocumentItem[]> {
    return withFallback(
      () => api.get<DocumentItem[]>("/documents", params),
      async () => {
        await sleep(LATENCY);
        let data = [...MOCK_DOCUMENTS];
        const { category } = params ?? {};
        if (category) data = data.filter((d) => d.category === category);
        return data.sort(
          (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
        );
      },
    );
  },

  async upload(file: File, category: string): Promise<DocumentItem> {
    return withFallback(
      async () => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("category", category);
        return api.post<DocumentItem>("/documents", formData);
      },
      async () => {
        await sleep(900);
        return {
          id: `doc_${Date.now()}`,
          name: file.name,
          category,
          type: "PDF",
          size: file.size,
          url: `/api/documents/${Date.now()}`,
          uploadedAt: new Date().toISOString(),
          uploadedBy: "You",
        };
      },
    );
  },
};

// ===== Profile =====
export const profileService = {
  async get(): Promise<DistributorProfile> {
    return withFallback(
      () => api.get<DistributorProfile>("/distributors/me"),
      async () => {
        await sleep(LATENCY);
        return MOCK_PROFILE;
      },
    );
  },

  async updatePersonal(payload: Partial<DistributorProfile>): Promise<DistributorProfile> {
    return withFallback(
      () => api.patch<DistributorProfile>("/distributors/me", payload),
      async () => {
        await sleep(LATENCY);
        Object.assign(MOCK_PROFILE, payload);
        return MOCK_PROFILE;
      },
    );
  },

  async updateBank(payload: NonNullable<DistributorProfile["bankAccount"]>): Promise<DistributorProfile> {
    return withFallback(
      () => api.patch<DistributorProfile>("/distributors/me/bank", payload),
      async () => {
        await sleep(LATENCY);
        MOCK_PROFILE.bankAccount = payload;
        return MOCK_PROFILE;
      },
    );
  },

  async changePassword(payload: { currentPassword: string; newPassword: string }): Promise<void> {
    return withFallback(
      () => api.post<void>("/auth/change-password", payload),
      async () => sleep(800),
    );
  },

  async uploadDocument(type: "ID_PROOF" | "ADDRESS_PROOF" | "BANK_PROOF" | "PHOTO", file: File): Promise<DistributorProfile> {
    return withFallback(
      async () => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("type", type);
        return api.post<DistributorProfile>("/distributors/me/documents", formData);
      },
      async () => {
        await sleep(900);
        MOCK_PROFILE.documents.unshift({
          id: `pd_${Date.now()}`,
          type,
          name: file.name,
          uploadedAt: new Date().toISOString(),
          verified: false,
        });
        return MOCK_PROFILE;
      },
    );
  },
};

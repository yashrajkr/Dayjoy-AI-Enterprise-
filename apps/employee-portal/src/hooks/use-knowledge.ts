"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";

export interface KnowledgeArticleSummary {
  id: string;
  slug: string;
  title: string;
  category: string;
  categorySlug: string;
  summary?: string;
  tags?: string[];
  updatedAt: string;
  readTimeMins?: number;
  authorName?: string;
}

export interface KnowledgeArticle extends KnowledgeArticleSummary {
  body: string; // markdown
  related?: KnowledgeArticleSummary[];
}

/**
 * Fetch the knowledge-base article index from
 * `GET /api/knowledge/articles`. Falls back to a deterministic mock list
 * derived from the `packages/knowledge-base/` directory tree so the
 * portal stays usable even when the backend isn't reachable.
 */
export function useKnowledgeArticles() {
  return useQuery({
    queryKey: QUERY_KEYS.knowledgeArticles,
    queryFn: async () => {
      try {
        const data = await api.get<KnowledgeArticleSummary[]>(
          "/knowledge/articles",
        );
        if (Array.isArray(data) && data.length > 0) return data;
        return mockArticleSummaries();
      } catch {
        return mockArticleSummaries();
      }
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useKnowledgeArticle(slug: string | undefined) {
  return useQuery({
    queryKey: slug ? QUERY_KEYS.knowledgeArticle(slug) : ["knowledge", "articles", "undefined"],
    queryFn: async () => {
      try {
        return await api.get<KnowledgeArticle>(
          `/knowledge/articles/${slug}`,
        );
      } catch {
        const all = mockArticles();
        const found = all.find((a) => a.slug === slug) ?? all[0]!;
        return found;
      }
    },
    enabled: !!slug,
  });
}

export function queryKnowledgeAI(question: string) {
  return api.post<{ answer: string; sources?: { title: string; slug: string }[] }>(
    "/knowledge/query",
    { question },
  );
}

// ===== Mock article index (mirrors `packages/knowledge-base/`) =====

const MOCK_ARTICLES: Omit<KnowledgeArticle, "related">[] = [
  {
    id: "kb_company_about",
    slug: "company-about-dayjoy",
    title: "About Dayjoy",
    category: "Company",
    categorySlug: "internal",
    summary: "Who we are, what we make, and where we're headed.",
    body: `# About Dayjoy\n\nDayjoy is a direct-selling wellness brand...\n\nOur mission is to make wellness accessible to every Indian household through a network of empowered distributors and AI-first customer support.`,
    tags: ["company", "brand"],
    updatedAt: "2026-07-15T10:00:00Z",
    readTimeMins: 4,
    authorName: "Marketing Team",
  },
  {
    id: "kb_company_mvv",
    slug: "company-mission-vision-values",
    title: "Mission, Vision & Values",
    category: "Company",
    categorySlug: "internal",
    summary: "The principles that guide every decision at Dayjoy.",
    body: `# Mission, Vision & Values\n\n**Mission** — Democratise wellness.\n\n**Vision** — A Dayjoy home in every pincode.\n\n**Values** — Integrity, Empathy, Excellence.`,
    tags: ["company", "values"],
    updatedAt: "2026-07-10T10:00:00Z",
    readTimeMins: 3,
    authorName: "Leadership",
  },
  {
    id: "kb_policy_returns",
    slug: "policy-return-policy",
    title: "Return Policy",
    category: "Policies",
    categorySlug: "policies",
    summary: "7-day return window for unopened products; damaged-item refund process.",
    body: `# Return Policy\n\nCustomers may return unopened products within **7 days** of delivery for a full refund.\n\nFor damaged items, please raise a ticket within 48 hours of delivery with photos attached. Our team will process a refund or replacement within 3 business days.`,
    tags: ["policy", "returns", "refunds"],
    updatedAt: "2026-06-30T10:00:00Z",
    readTimeMins: 5,
    authorName: "Operations",
  },
  {
    id: "kb_policy_shipping",
    slug: "policy-shipping-policy",
    title: "Shipping Policy",
    category: "Policies",
    categorySlug: "policies",
    summary: "Standard shipping 3-5 business days; express 1-2 days; free above ₹2,000.",
    body: `# Shipping Policy\n\n- **Standard** (3-5 business days): ₹49, free above ₹2,000\n- **Express** (1-2 business days): ₹149\n- We ship pan-India via Delhivery & BlueDart.\n- Tracking link is emailed and sent via WhatsApp once the order ships.`,
    tags: ["policy", "shipping", "logistics"],
    updatedAt: "2026-06-15T10:00:00Z",
    readTimeMins: 4,
    authorName: "Logistics",
  },
  {
    id: "kb_policy_payments",
    slug: "policy-payment-options",
    title: "Payment Options",
    category: "Policies",
    categorySlug: "policies",
    summary: "UPI, cards, net-banking, COD; EMI on orders above ₹5,000.",
    body: `# Payment Options\n\nWe accept UPI, all major debit/credit cards, net-banking, and Cash on Delivery (COD, up to ₹10,000).\n\nEMI is available on orders above ₹5,000 via Razorpay.`,
    tags: ["policy", "payments"],
    updatedAt: "2026-06-01T10:00:00Z",
    readTimeMins: 2,
    authorName: "Finance",
  },
  {
    id: "kb_policy_warranty",
    slug: "policy-warranty",
    title: "Warranty Policy",
    category: "Policies",
    categorySlug: "policies",
    summary: "Wellness devices carry a 1-year warranty against manufacturing defects.",
    body: `# Warranty Policy\n\nAll Dayjoy wellness devices come with a **1-year limited warranty** against manufacturing defects.\n\nTo claim warranty, raise a support ticket with proof of purchase and a description of the defect.`,
    tags: ["policy", "warranty"],
    updatedAt: "2026-05-20T10:00:00Z",
    readTimeMins: 3,
    authorName: "Operations",
  },
  {
    id: "kb_product_wellness_bundle",
    slug: "product-wellness-bundle",
    title: "Wellness Bundle — Product Information",
    category: "Product Info",
    categorySlug: "product-info",
    summary: "5-product wellness bundle. List ₹1,999; bulk pricing available.",
    body: `# Wellness Bundle\n\nThe Wellness Bundle is our flagship SKU — a curated set of 5 Ayurvedic supplements targeting immunity, energy, and sleep.\n\n| Item | Qty |\n|---|---|\n| Immune Boost | 1 |\n| Energy Plus | 1 |\n| Calm Sleep | 1 |\n| Daily Multivitamin | 1 |\n| Omega-3 | 1 |\n\n**List price:** ₹1,999 (incl. GST).\n**Bulk pricing:** 50+ units — ₹1,499/unit. 100+ units — ₹1,299/unit.\n**Contra-indications:** Consult a physician if taking BP or diabetes medication.`,
    tags: ["product", "bundle", "ayurveda"],
    updatedAt: "2026-07-01T10:00:00Z",
    readTimeMins: 6,
    authorName: "Product Team",
  },
  {
    id: "kb_product_catalog",
    slug: "product-catalog",
    title: "Product Catalog",
    category: "Product Info",
    categorySlug: "product-info",
    summary: "Full product list with SKUs, prices, and descriptions.",
    body: `# Product Catalog\n\nThe Dayjoy catalog spans 4 categories: Immunity, Energy, Sleep, and General Wellness.\n\nSee the latest catalog PDF on the shared drive (refreshed monthly).`,
    tags: ["product", "catalog"],
    updatedAt: "2026-07-05T10:00:00Z",
    readTimeMins: 8,
    authorName: "Product Team",
  },
  {
    id: "kb_sop_customer_journey",
    slug: "sop-customer-journey",
    title: "Customer Journey SOP",
    category: "SOPs",
    categorySlug: "sops",
    summary: "End-to-end customer journey — from enquiry to repeat purchase.",
    body: `# Customer Journey SOP\n\n1. **Enquiry** — Customer reaches out via WhatsApp / voice / web.\n2. **Qualification** — Confirm needs, recommend products.\n3. **Order** — Place order, share tracking.\n4. **Delivery** — Follow up 24h after delivery.\n5. **Repeat** — Re-engage at 30/60/90 days with relevant offers.\n\n**SLA:** Enquiry → first response within 1 business hour.`,
    tags: ["sop", "customer", "journey"],
    updatedAt: "2026-06-25T10:00:00Z",
    readTimeMins: 7,
    authorName: "Operations",
  },
  {
    id: "kb_sop_business_processes",
    slug: "sop-business-processes",
    title: "Business Processes SOP",
    category: "SOPs",
    categorySlug: "sops",
    summary: "Core business processes — order, fulfilment, support, escalation.",
    body: `# Business Processes SOP\n\nCovers end-to-end processes for order intake, fulfilment, support ticketing, and escalation paths.\n\nRefer to the linked process diagrams in the shared drive.`,
    tags: ["sop", "processes"],
    updatedAt: "2026-06-10T10:00:00Z",
    readTimeMins: 10,
    authorName: "Operations",
  },
  {
    id: "kb_training_sales",
    slug: "training-sales-techniques",
    title: "Sales Techniques Training",
    category: "Training",
    categorySlug: "training",
    summary: "Consultative selling framework, objection handling, closing techniques.",
    body: `# Sales Techniques Training\n\n## Consultative Selling\n1. **Listen** — Understand the customer's wellness goal.\n2. **Educate** — Recommend the right product, not the priciest.\n3. **Address objections** — Use the LAER model (Listen, Acknowledge, Explore, Respond).\n4. **Close** — Always propose a next step (sample, demo, order).\n\n## Common objections\n- "Too expensive" → reframe as cost-per-day; share bulk pricing.\n- "Not sure it works" → share testimonials + 7-day return policy.`,
    tags: ["training", "sales"],
    updatedAt: "2026-06-12T10:00:00Z",
    readTimeMins: 12,
    authorName: "Sales Enablement",
  },
  {
    id: "kb_training_product",
    slug: "training-product-training",
    title: "Product Training",
    category: "Training",
    categorySlug: "training",
    summary: "Deep-dive on each Dayjoy product — ingredients, benefits, dosages.",
    body: `# Product Training\n\nDetailed training on every Dayjoy SKU. Covers ingredients, benefits, recommended dosages, and contra-indications.\n\nSchedule: Monthly product training — first Friday, 11am IST.`,
    tags: ["training", "product"],
    updatedAt: "2026-06-08T10:00:00Z",
    readTimeMins: 15,
    authorName: "Product Team",
  },
  {
    id: "kb_comp_distributor",
    slug: "compensation-plan-distributor",
    title: "Distributor Compensation Plan",
    category: "Training",
    categorySlug: "training",
    summary: "Tiered commission structure, downline bonuses, and qualification rules.",
    body: `# Distributor Compensation Plan\n\n## Tiers & commission\n| Tier | Min. quarterly sales | Commission |\n|---|---|---|\n| Bronze | ₹50,000 | 10% |\n| Silver | ₹1,50,000 | 14% |\n| Gold | ₹4,00,000 | 18% |\n| Platinum | ₹10,00,000 | 22% |\n| Diamond | ₹25,00,000 | 26% |\n\n## Downline bonus\nEarn 2% on your direct downline's sales, 1% on second level.\n\n## Qualification\nTier is reviewed every quarter. Maintain sales volume to retain tier.`,
    tags: ["compensation", "distributor", "commission"],
    updatedAt: "2026-07-12T10:00:00Z",
    readTimeMins: 9,
    authorName: "Finance",
  },
  {
    id: "kb_compliance_gst",
    slug: "compliance-gst-tax",
    title: "GST & Tax Information",
    category: "Compliance",
    categorySlug: "compliance",
    summary: "GST rates, invoice requirements, and tax filing references.",
    body: `# GST & Tax Information\n\nAll Dayjoy products attract **18% GST** (HSN 3004).\n\nGST invoices are auto-generated for B2B orders and emailed within 24h.\n\nFor manual invoice requests, raise a ticket with the customer's GSTIN.`,
    tags: ["compliance", "gst", "tax"],
    updatedAt: "2026-05-28T10:00:00Z",
    readTimeMins: 4,
    authorName: "Finance",
  },
  {
    id: "kb_compliance_privacy",
    slug: "compliance-privacy-policy",
    title: "Privacy Policy",
    category: "Compliance",
    categorySlug: "compliance",
    summary: "How we collect, use, and protect customer data.",
    body: `# Privacy Policy\n\nWe collect only the data needed to fulfil orders and provide support.\n\nCustomer data is never sold. Distributors may access only data for customers in their direct downline.\n\nFor data-deletion requests, raise a ticket — we action within 7 days.`,
    tags: ["compliance", "privacy", "data"],
    updatedAt: "2026-05-10T10:00:00Z",
    readTimeMins: 5,
    authorName: "Legal",
  },
];

function mockArticleSummaries(): KnowledgeArticleSummary[] {
  return MOCK_ARTICLES.map(({ body, ...rest }) => rest);
}

function mockArticles(): KnowledgeArticle[] {
  return MOCK_ARTICLES.map((a) => ({
    ...a,
    related: MOCK_ARTICLES.filter(
      (r) => r.slug !== a.slug && r.categorySlug === a.categorySlug,
    )
      .slice(0, 3)
      .map(({ body, ...rest }) => rest),
  }));
}

/**
 * RAG Test Fixtures — Dayjoy Knowledge Base Snapshot
 * ===================================================
 *
 * Curated set of knowledge-base chunks the channel RAG tests assert
 * against. Each fixture models a real slice of the Dayjoy knowledge
 * base (`packages/knowledge-base/`): product catalog, distributor
 * system, compensation plan, return policy, shipping, leadership team,
 * etc.
 *
 * The chunks are deliberately small (≤ 300 chars of `content`) so the
 * tests can assert on full-snippet inclusion without truncation.
 *
 * Used by:
 *   - `retrieval-accuracy.test.ts`   (top-K + relevance + expected docs)
 *   - `citation-accuracy.test.ts`    (citations returned by `query()`)
 *   - `hallucination-detection.test.ts` (grounded answer checks + traps)
 *   - `evaluation.test.ts`           (precision / recall / MRR / latency)
 *   - `ingestion.test.ts`            (ingestion → chunks → embeddings)
 */

import type { RagChunk } from './mock-rag-service';

/** Stable document IDs — referenced by retrieval-accuracy expected docs. */
export const DOC_IDS = {
  PRODUCT_CATALOG: 'product-catalog',
  HEALTH_PRODUCTS: 'health-products',
  BEAUTY_PRODUCTS: 'beauty-products',
  HOME_CARE: 'home-care-kit',
  COMPENSATION_PLAN: 'compensation-plan',
  DISTRIBUTOR_SYSTEM: 'distributor-system',
  RETURN_POLICY: 'return-policy',
  SHIPPING_POLICY: 'shipping-policy',
  WARRANTY_POLICY: 'warranty-policy',
  PAYMENT_OPTIONS: 'payment-options',
  LEADERSHIP_TEAM: 'leadership-team',
  ABOUT_DAYJOY: 'about-dayjoy',
  MISSION_VISION: 'mission-vision-values',
  FAQ_TROUBLESHOOTING: 'faq-troubleshooting',
  TERMS_OF_SERVICE: 'terms-of-service',
  PRIVACY_POLICY: 'privacy-policy',
} as const;

/** Known product names — used by the "do not fabricate" hallucination test. */
export const KNOWN_PRODUCTS = [
  'Dayjoy Premium Health Tonic',
  'Dayjoy Beauty Cream',
  'Dayjoy Home Care Kit',
  'Dayjoy Omega-3 Supplement',
  'Dayjoy Hair Oil',
];

/** Seed chunks — 24 across 12 documents. */
export const SEED_CHUNKS: RagChunk[] = [
  // --- Product catalog (3 chunks) ---
  {
    chunkId: 'pc-1',
    documentId: DOC_IDS.PRODUCT_CATALOG,
    documentTitle: 'Product Catalog',
    content:
      'Dayjoy offers a complete range of wellness, beauty, and home-care products. ' +
      'The flagship product is the Dayjoy Premium Health Tonic (500 ml, MRP ₹699), ' +
      'an Ayurvedic daily supplement with Ashwagandha, Shatavari, Amla, and Giloy. ' +
      'Other popular products include the Dayjoy Beauty Cream and the Dayjoy Home Care Kit.',
    snippet:
      'Dayjoy offers wellness, beauty, and home-care products. Flagship: Premium Health Tonic ₹699.',
    score: 0.95,
    finalScore: 0.95,
    metadata: { documentTitle: 'Product Catalog' },
  },
  {
    chunkId: 'pc-2',
    documentId: DOC_IDS.PRODUCT_CATALOG,
    documentTitle: 'Product Catalog',
    content:
      'Health products include the Premium Health Tonic (₹699), Omega-3 Supplement (₹499), ' +
      'and the Dayjoy Hair Oil (₹299). Beauty products include the Beauty Cream (₹599) and ' +
      'the Dayjoy Face Wash (₹199). Home Care Kit is ₹899.',
    snippet:
      'Health: Health Tonic ₹699, Omega-3 ₹499, Hair Oil ₹299. Beauty: Cream ₹599, Face Wash ₹199.',
    score: 0.92,
    finalScore: 0.92,
    metadata: { documentTitle: 'Product Catalog' },
  },
  {
    chunkId: 'pc-3',
    documentId: DOC_IDS.HEALTH_PRODUCTS,
    documentTitle: 'Health Products',
    content:
      'The health products line is anchored by the Dayjoy Premium Health Tonic. ' +
      'It is an Ayurvedic daily tonic with Ashwagandha, Shatavari, Amla, and Giloy. ' +
      'Recommended dosage: 15 ml twice daily after meals. Safe for adults; consult a ' +
      'paediatrician before giving to children (5 ml twice daily after meals).',
    snippet:
      'Premium Health Tonic: Ayurvedic, 15 ml twice daily after meals. 5 ml for children.',
    score: 0.91,
    finalScore: 0.91,
    metadata: { documentTitle: 'Health Products' },
  },
  // --- Compensation plan (2 chunks) ---
  {
    chunkId: 'cp-1',
    documentId: DOC_IDS.COMPENSATION_PLAN,
    documentTitle: 'Compensation Plan',
    content:
      'The Dayjoy compensation plan has three components: retail profit (20% margin ' +
      'on every sale), performance bonus (5–15% based on monthly PV), and leadership ' +
      'bonus (paid on downline sales once you reach Silver rank and above). ' +
      'Commissions are credited monthly on the 10th of the following month.',
    snippet:
      'Three components: retail profit 20%, performance bonus 5–15%, leadership bonus.',
    score: 0.94,
    finalScore: 0.94,
    metadata: { documentTitle: 'Compensation Plan' },
  },
  {
    chunkId: 'cp-2',
    documentId: DOC_IDS.COMPENSATION_PLAN,
    documentTitle: 'Compensation Plan',
    content:
      'Distributor ranks: Bronze, Silver, Gold, Platinum, Diamond. Each rank unlocks ' +
      'additional leadership bonuses and downline commission depth. Rank is calculated ' +
      'monthly based on group PV (Personal Volume + downline PV).',
    snippet: 'Ranks: Bronze, Silver, Gold, Platinum, Diamond. Monthly PV-based.',
    score: 0.88,
    finalScore: 0.88,
    metadata: { documentTitle: 'Compensation Plan' },
  },
  // --- Distributor system (2 chunks) ---
  {
    chunkId: 'ds-1',
    documentId: DOC_IDS.DISTRIBUTOR_SYSTEM,
    documentTitle: 'Distributor System',
    content:
      'To become a Dayjoy distributor, fill out the application form, provide your GST ' +
      'number, and pay a refundable security deposit of ₹2,000. After approval, you will ' +
      'receive a starter kit and access to the distributor portal. You will also be ' +
      'assigned a sponsor who will help with training.',
    snippet:
      'Apply with GST + ₹2,000 refundable deposit. Sponsor + training provided.',
    score: 0.93,
    finalScore: 0.93,
    metadata: { documentTitle: 'Distributor System' },
  },
  {
    chunkId: 'ds-2',
    documentId: DOC_IDS.DISTRIBUTOR_SYSTEM,
    documentTitle: 'Distributor System',
    content:
      'Every distributor has a unique distributor ID and is sponsored by another ' +
      'distributor. The sponsor provides training and helps the new distributor reach ' +
      'their first 1,000 PV. Once a distributor reaches Bronze rank, they can sponsor ' +
      'their own downline.',
    snippet: 'Distributor IDs are unique. Sponsor helps reach first 1,000 PV.',
    score: 0.86,
    finalScore: 0.86,
    metadata: { documentTitle: 'Distributor System' },
  },
  // --- Return policy (2 chunks) ---
  {
    chunkId: 'rp-1',
    documentId: DOC_IDS.RETURN_POLICY,
    documentTitle: 'Return Policy',
    content:
      'Dayjoy offers a 7-day return policy on unopened products. If you received a ' +
      'damaged or incorrect item, contact customer support within 48 hours of delivery ' +
      'with photos. Refunds are processed to the original payment method within ' +
      '5–7 business days. UPI refunds are typically faster.',
    snippet: '7-day returns on unopened products. Refunds in 5–7 business days.',
    score: 0.95,
    finalScore: 0.95,
    metadata: { documentTitle: 'Return Policy' },
  },
  {
    chunkId: 'rp-2',
    documentId: DOC_IDS.RETURN_POLICY,
    documentTitle: 'Return Policy',
    content:
      'Returns are not accepted on opened consumable products (health tonics, supplements) ' +
      'for safety reasons. Beauty products can be returned if the seal is intact. ' +
      'Home Care Kits can be returned within 7 days if unused.',
    snippet: 'No returns on opened consumables. Beauty + home care if sealed.',
    score: 0.87,
    finalScore: 0.87,
    metadata: { documentTitle: 'Return Policy' },
  },
  // --- Shipping (1 chunk) ---
  {
    chunkId: 'sp-1',
    documentId: DOC_IDS.SHIPPING_POLICY,
    documentTitle: 'Shipping Policy',
    content:
      'Dayjoy ships across India via partnered couriers. Orders are dispatched within ' +
      '24–48 hours of payment confirmation. Standard delivery takes 3–5 business days ' +
      'in metro cities and 5–7 business days in other areas. Free shipping on orders ' +
      'above ₹999.',
    snippet: 'India-wide shipping. 3–5 days metro, 5–7 days others. Free over ₹999.',
    score: 0.9,
    finalScore: 0.9,
    metadata: { documentTitle: 'Shipping Policy' },
  },
  // --- Warranty (1 chunk) ---
  {
    chunkId: 'wp-1',
    documentId: DOC_IDS.WARRANTY_POLICY,
    documentTitle: 'Warranty Policy',
    content:
      'The Dayjoy Home Care Kit comes with a 6-month warranty against manufacturing ' +
      'defects. Consumable products (health tonics, supplements, beauty products) do ' +
      'not carry a warranty — only the 7-day return policy applies.',
    snippet: 'Home Care Kit: 6-month warranty. Consumables: 7-day return only.',
    score: 0.89,
    finalScore: 0.89,
    metadata: { documentTitle: 'Warranty Policy' },
  },
  // --- Payment options (1 chunk) ---
  {
    chunkId: 'po-1',
    documentId: DOC_IDS.PAYMENT_OPTIONS,
    documentTitle: 'Payment Options',
    content:
      'Dayjoy accepts UPI (PhonePe, Google Pay, Paytm), all major credit and debit ' +
      'cards, net banking, and Cash on Delivery (COD) for orders below ₹5,000. ' +
      'Distributors can also pay via wallet balance.',
    snippet: 'UPI, cards, net banking, COD (< ₹5,000), distributor wallet.',
    score: 0.86,
    finalScore: 0.86,
    metadata: { documentTitle: 'Payment Options' },
  },
  // --- Leadership (1 chunk) ---
  {
    chunkId: 'lt-1',
    documentId: DOC_IDS.LEADERSHIP_TEAM,
    documentTitle: 'Leadership Team',
    content:
      'Dayjoy was founded in 2018 by Mr. Rajesh Sharma (CEO). The leadership team ' +
      'includes Mrs. Anita Sharma (COO), Mr. Vikram Patel (CTO), and Mrs. Priya Iyer ' +
      '(CMO). The company is headquartered in Bengaluru, India.',
    snippet: 'Founded 2018 by Rajesh Sharma. HQ Bengaluru. COO Anita, CTO Vikram, CMO Priya.',
    score: 0.85,
    finalScore: 0.85,
    metadata: { documentTitle: 'Leadership Team' },
  },
  // --- About Dayjoy (1 chunk) ---
  {
    chunkId: 'ad-1',
    documentId: DOC_IDS.ABOUT_DAYJOY,
    documentTitle: 'About Dayjoy',
    content:
      'Dayjoy is a direct-selling wellness company based in India. Our mission is to ' +
      'bring affordable Ayurvedic and natural wellness products to every Indian ' +
      'household through a network of trained distributors.',
    snippet: 'Dayjoy: Indian direct-selling wellness company.',
    score: 0.84,
    finalScore: 0.84,
    metadata: { documentTitle: 'About Dayjoy' },
  },
  // --- Mission / vision / values (1 chunk) ---
  {
    chunkId: 'mv-1',
    documentId: DOC_IDS.MISSION_VISION,
    documentTitle: 'Mission, Vision & Values',
    content:
      'Mission: Wellness in every home. Vision: To be India’s most trusted direct-selling ' +
      'wellness brand by 2030. Values: Customer first, Distributor partnership, ' +
      'Ayurvedic authenticity, Transparent business.',
    snippet: 'Mission: Wellness in every home. Vision: India\'s most trusted by 2030.',
    score: 0.82,
    finalScore: 0.82,
    metadata: { documentTitle: 'Mission, Vision & Values' },
  },
  // --- FAQ troubleshooting (2 chunks) ---
  {
    chunkId: 'ft-1',
    documentId: DOC_IDS.FAQ_TROUBLESHOOTING,
    documentTitle: 'FAQ Troubleshooting',
    content:
      'Q: How do I reset my Dayjoy account password? A: Click "Forgot password" on the ' +
      'login page, enter your registered email or phone, and an OTP will be sent. ' +
      'Verify the OTP and set a new password. Do not call customer care for password ' +
      'resets — it is a self-service flow.',
    snippet: 'Password reset: Forgot password → OTP → new password.',
    score: 0.88,
    finalScore: 0.88,
    metadata: { documentTitle: 'FAQ Troubleshooting' },
  },
  {
    chunkId: 'ft-2',
    documentId: DOC_IDS.FAQ_TROUBLESHOOTING,
    documentTitle: 'FAQ Troubleshooting',
    content:
      'Q: Is the Dayjoy Premium Health Tonic safe for children? A: Yes, but consult a ' +
      'paediatrician first. The recommended children’s dose is 5 ml twice daily after ' +
      'meals (half the adult dose of 15 ml twice daily).',
    snippet: 'Children: 5 ml twice daily after meals. Consult paediatrician first.',
    score: 0.87,
    finalScore: 0.87,
    metadata: { documentTitle: 'FAQ Troubleshooting' },
  },
  // --- Terms (1 chunk) ---
  {
    chunkId: 'ts-1',
    documentId: DOC_IDS.TERMS_OF_SERVICE,
    documentTitle: 'Terms of Service',
    content:
      'By using the Dayjoy platform, you agree to our terms of service. Distributors ' +
      'must comply with all applicable Indian laws, including the Consumer Protection ' +
      'Act and the Direct Selling Guidelines 2016. Misrepresentation of products or ' +
      'income claims is prohibited.',
    snippet: 'Distributors must comply with Indian law. No misrepresentation.',
    score: 0.78,
    finalScore: 0.78,
    metadata: { documentTitle: 'Terms of Service' },
  },
  // --- Privacy (1 chunk) ---
  {
    chunkId: 'pp-1',
    documentId: DOC_IDS.PRIVACY_POLICY,
    documentTitle: 'Privacy Policy',
    content:
      'Dayjoy collects personal data (name, phone, email, address) for order fulfilment ' +
      'and distributor management. We do not sell customer data to third parties. ' +
      'Customers may request data deletion by emailing privacy@dayjoy.ai.',
    snippet: 'We collect personal data for fulfilment. Never sold. Deletion on request.',
    score: 0.81,
    finalScore: 0.81,
    metadata: { documentTitle: 'Privacy Policy' },
  },
];

/** Build a `RagQueryResult` for a happy-path scripted response. */
export function buildQueryResult(opts: {
  answer: string;
  citations?: RagChunk[];
  queryId?: string;
  confidence?: number;
  latencyMs?: number;
}): import('./mock-rag-service').RagQueryResult {
  const citations = opts.citations ?? [];
  return {
    answer: opts.answer,
    citations: citations.map((c, i) => ({
      index: i + 1,
      chunkId: c.chunkId,
      documentId: c.documentId,
      documentTitle: c.documentTitle,
      // Use the full chunk content for the snippet so the
      // hallucination-detection tests can verify the answer is
      // grounded in the retrieved context (joined snippets).
      snippet: c.content,
      score: c.score,
      unresolved: false,
    })),
    queryId: opts.queryId ?? 'q-mock',
    confidence: opts.confidence ?? (citations[0]?.score ?? 0),
    latencyMs: opts.latencyMs ?? 42,
    retrievedChunks: citations.length,
    tokens: 100,
    model: 'gpt-4o-mock',
  };
}

/** Build a hedged "I don't know" response — for hallucination-trap tests. */
export function buildHedgedResult(question: string): import('./mock-rag-service').RagQueryResult {
  // NOTE: do NOT echo the question back in the answer — the
  // hallucination tests assert on regex matches like /cure/ or
  // /diabetes/, and echoing the question would produce false
  // positives.
  void question;
  return {
    answer:
      "I'm sorry, I don't have information about that in our knowledge base. " +
      'Could you rephrase or ask about our products, compensation plan, or return policy?',
    citations: [],
    queryId: 'q-hedged',
    confidence: 0,
    retrievedChunks: 0,
    latencyMs: 18,
    tokens: 30,
    model: 'gpt-4o-mock',
  };
}

import type {
  Announcement,
  AiConversation,
  AiMessage,
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
  UserSettings,
} from "@/types";

/**
 * In-memory mock dataset for the Distributor Portal.
 *
 * The portal's service layer (`src/lib/services.ts`) first tries the real
 * backend; on failure (or in storybook/preview mode) it falls back to
 * these fixtures so every page renders end-to-end without a live API.
 *
 * All IDs are stable so cross-page navigation (lead → customer, order →
 * invoice, product → training module) resolves cleanly.
 */

const now = Date.now();
const days = (n: number) => new Date(now - n * 86_400_000).toISOString();
const hours = (n: number) => new Date(now - n * 3_600_000).toISOString();
const future = (n: number) => new Date(now + n * 86_400_000).toISOString();

// ===== Leads =====
export const MOCK_LEADS: Lead[] = [
  {
    id: "lead_001",
    firstName: "Aarav",
    lastName: "Sharma",
    email: "aarav.sharma@example.com",
    phone: "+91 98765 43210",
    company: "Sharma Wellness Pvt Ltd",
    interest: "Glow Diffuser + Aura Lamp combo",
    source: "WEBSITE",
    stage: "NEW",
    score: 78,
    notes: [
      {
        id: "n1",
        body: "Visited booth at Wellness Expo — very interested in distributor pricing.",
        author: "You",
        createdAt: days(2),
      },
    ],
    activities: [
      {
        id: "a1",
        type: "STATUS_CHANGE",
        title: "Lead created",
        description: "Source: Website form submission",
        createdAt: days(3),
      },
      {
        id: "a2",
        type: "NOTE",
        title: "Note added",
        description: "Visited booth at Wellness Expo",
        createdAt: days(2),
      },
    ],
    assignedAt: days(3),
    lastContactedAt: null,
    convertedCustomerId: null,
  },
  {
    id: "lead_002",
    firstName: "Priya",
    lastName: "Patel",
    email: "priya.patel@example.com",
    phone: "+91 99887 76655",
    company: null,
    interest: "Personal wellness products",
    source: "REFERRAL",
    stage: "CONTACTED",
    score: 65,
    notes: [],
    activities: [
      {
        id: "a3",
        type: "CALL",
        title: "Outbound call (4m 22s)",
        description: "Explained Silver tier benefits; will review and revert.",
        createdAt: days(1),
      },
    ],
    assignedAt: days(5),
    lastContactedAt: days(1),
    convertedCustomerId: null,
  },
  {
    id: "lead_003",
    firstName: "Rohan",
    lastName: "Mehta",
    email: "rohan.mehta@example.com",
    phone: "+91 90909 80808",
    company: "Mehta Traders",
    interest: "Bulk wholesale — Beauty range",
    source: "EVENT",
    stage: "QUALIFIED",
    score: 88,
    notes: [
      {
        id: "n2",
        body: "Strong wholesale prospect. Asked for ₹5L+ MOQ quote for Beauty range.",
        author: "You",
        createdAt: hours(20),
      },
    ],
    activities: [
      {
        id: "a4",
        type: "MEETING",
        title: "Discovery meeting (45m)",
        description: "Discussed tier upgrade path; sent product catalog PDF.",
        createdAt: hours(20),
      },
      {
        id: "a5",
        type: "EMAIL",
        title: "Catalog sent",
        createdAt: hours(18),
      },
    ],
    assignedAt: days(7),
    lastContactedAt: hours(18),
    convertedCustomerId: null,
  },
  {
    id: "lead_004",
    firstName: "Sneha",
    lastName: "Reddy",
    email: "sneha.reddy@example.com",
    phone: "+91 91234 56789",
    company: null,
    interest: "Aura Lamp (single unit)",
    source: "SOCIAL_MEDIA",
    stage: "NEW",
    score: 42,
    notes: [],
    activities: [
      {
        id: "a6",
        type: "STATUS_CHANGE",
        title: "Lead created",
        description: "Source: Instagram DM",
        createdAt: hours(6),
      },
    ],
    assignedAt: hours(6),
    lastContactedAt: null,
    convertedCustomerId: null,
  },
  {
    id: "lead_005",
    firstName: "Vikram",
    lastName: "Iyer",
    email: "vikram.iyer@example.com",
    phone: "+91 98123 45678",
    company: "Iyer & Sons",
    interest: "Full wellness catalog",
    source: "REFERRAL",
    stage: "CONVERTED",
    score: 95,
    notes: [],
    activities: [
      {
        id: "a7",
        type: "STATUS_CHANGE",
        title: "Converted to customer",
        description: "Customer ID: cus_003",
        createdAt: days(2),
      },
    ],
    assignedAt: days(15),
    lastContactedAt: days(2),
    convertedCustomerId: "cus_003",
  },
  {
    id: "lead_006",
    firstName: "Ananya",
    lastName: "Nair",
    email: "ananya.nair@example.com",
    phone: "+91 90000 11111",
    company: null,
    interest: "Personal Care range",
    source: "WHATSAPP",
    stage: "LOST",
    score: 22,
    notes: [
      {
        id: "n3",
        body: "Went with competitor due to lower pricing. Revisit in Q3.",
        author: "You",
        createdAt: days(8),
      },
    ],
    activities: [
      {
        id: "a8",
        type: "STATUS_CHANGE",
        title: "Marked as Lost",
        description: "Reason: Price sensitivity",
        createdAt: days(8),
      },
    ],
    assignedAt: days(20),
    lastContactedAt: days(8),
    convertedCustomerId: null,
  },
];

// ===== Customers =====
export const MOCK_CUSTOMERS: Customer[] = [
  {
    id: "cus_001",
    firstName: "Vikram",
    lastName: "Iyer",
    email: "vikram.iyer@example.com",
    phone: "+91 98123 45678",
    company: "Iyer & Sons",
    type: "RETAILER",
    status: "ACTIVE",
    ltv: 184500,
    totalOrders: 14,
    lastOrderAt: days(4),
    notes: [],
    address: "12 MG Road, Indiranagar",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560038",
    createdAt: days(120),
  },
  {
    id: "cus_002",
    firstName: "Meera",
    lastName: "Joshi",
    email: "meera.joshi@example.com",
    phone: "+91 98765 11111",
    company: null,
    type: "INDIVIDUAL",
    status: "ACTIVE",
    ltv: 42300,
    totalOrders: 6,
    lastOrderAt: days(11),
    notes: [],
    address: "45 Boat Club Road",
    city: "Pune",
    state: "Maharashtra",
    pincode: "411001",
    createdAt: days(85),
  },
  {
    id: "cus_003",
    firstName: "Arjun",
    lastName: "Kapoor",
    email: "arjun.kapoor@example.com",
    phone: "+91 99887 22222",
    company: "Kapoor Wellness Hub",
    type: "WHOLESALE",
    status: "ACTIVE",
    ltv: 412800,
    totalOrders: 22,
    lastOrderAt: days(2),
    notes: [],
    address: "8 Civil Lines",
    city: "Delhi",
    state: "Delhi",
    pincode: "110054",
    createdAt: days(200),
  },
  {
    id: "cus_004",
    firstName: "Diya",
    lastName: "Verma",
    email: "diya.verma@example.com",
    phone: "+91 90123 33333",
    company: null,
    type: "INDIVIDUAL",
    status: "ACTIVE",
    ltv: 8900,
    totalOrders: 2,
    lastOrderAt: days(28),
    notes: [],
    address: null,
    city: null,
    state: null,
    pincode: null,
    createdAt: days(40),
  },
  {
    id: "cus_005",
    firstName: "Karan",
    lastName: "Singh",
    email: "karan.singh@example.com",
    phone: "+91 91234 44444",
    company: "Singh Distributors",
    type: "WHOLESALE",
    status: "INACTIVE",
    ltv: 96200,
    totalOrders: 9,
    lastOrderAt: days(95),
    notes: [],
    address: "23 Sector 17",
    city: "Chandigarh",
    state: "Chandigarh",
    pincode: "160017",
    createdAt: days(280),
  },
];

// ===== Products =====
export const MOCK_PRODUCTS: Product[] = [
  {
    id: "prod_001",
    name: "Dayjoy Glow Diffuser",
    slug: "glow-diffuser",
    sku: "DJ-DFR-001",
    category: "WELLNESS",
    description:
      "Ultrasonic aromatherapy diffuser with 7-color LED mood lighting and 300ml capacity.",
    longDescription:
      "The Dayjoy Glow Diffuser transforms any space into a calming sanctuary. With ultrasonic mist technology, a 300ml reservoir, and 7 adjustable LED colors, it delivers up to 10 hours of continuous aromatherapy. Auto shut-off when water runs out. BPA-free materials. 2-year warranty.",
    images: [
      "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=600",
      "https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=600",
    ],
    mrp: 3999,
    distributorPrice: 2400,
    commissionRate: 12,
    stock: 248,
    rating: 4.7,
    reviewCount: 312,
    features: [
      "300ml capacity",
      "7-color LED mood lighting",
      "Up to 10 hours runtime",
      "Auto shut-off",
      "BPA-free",
    ],
    trainingModuleIds: ["trn_001"],
  },
  {
    id: "prod_002",
    name: "Aura Smart Lamp",
    slug: "aura-smart-lamp",
    sku: "DJ-LMP-002",
    category: "HOME",
    description:
      "App-controlled smart lamp with 16M colors, music sync, and voice assistant compatibility.",
    longDescription:
      "The Aura Smart Lamp brings ambiance to life with 16 million colors, music sync, and full voice control. Works with Alexa and Google Assistant. Schedule routines, set scenes, and control from anywhere via the Dayjoy app. Energy-efficient LED rated for 25,000 hours.",
    images: [
      "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=600",
    ],
    mrp: 5499,
    distributorPrice: 3300,
    commissionRate: 10,
    stock: 142,
    rating: 4.5,
    reviewCount: 187,
    features: [
      "16M colors",
      "Music sync",
      "Alexa & Google compatible",
      "25,000 hour LED",
      "App + voice control",
    ],
    trainingModuleIds: ["trn_002"],
  },
  {
    id: "prod_003",
    name: "Pure Nutrition Shake — Vanilla",
    slug: "pure-nutrition-shake-vanilla",
    sku: "DJ-NUT-003",
    category: "NUTRITION",
    description:
      "Plant-based meal replacement with 22g protein, 23 vitamins, and probiotics. 400g.",
    longDescription:
      "Pure Nutrition Shake is a complete meal replacement delivering 22g of plant-based protein, 23 essential vitamins and minerals, and probiotics for gut health. No added sugar, gluten-free, and clinically tested for digestibility. Vanilla bean flavor. 400g jar (10 servings).",
    images: [
      "https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=600",
    ],
    mrp: 2499,
    distributorPrice: 1500,
    commissionRate: 15,
    stock: 0,
    rating: 4.8,
    reviewCount: 524,
    features: [
      "22g plant protein",
      "23 vitamins + minerals",
      "Probiotics",
      "No added sugar",
      "Gluten-free",
    ],
    trainingModuleIds: ["trn_003"],
  },
  {
    id: "prod_004",
    name: "Radiance Vitamin C Serum",
    slug: "radiance-vitamin-c-serum",
    sku: "DJ-BTY-004",
    category: "BEAUTY",
    description:
      "20% Vitamin C + Hyaluronic Acid brightening serum. 30ml. Dermatologist tested.",
    longDescription:
      "Radiance Vitamin C Serum brightens, hydrates, and protects. 20% L-ascorbic acid + hyaluronic acid + vitamin E work synergistically to fade dark spots, even tone, and boost collagen. Lightweight, fast-absorbing, non-greasy. Suitable for all skin types. 30ml.",
    images: [
      "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600",
    ],
    mrp: 1899,
    distributorPrice: 1100,
    commissionRate: 14,
    stock: 86,
    rating: 4.6,
    reviewCount: 268,
    features: [
      "20% Vitamin C",
      "Hyaluronic acid",
      "Fades dark spots",
      "Dermatologist tested",
      "All skin types",
    ],
    trainingModuleIds: [],
  },
  {
    id: "prod_005",
    name: "Zen Pure Essential Oil Set",
    slug: "zen-essential-oil-set",
    sku: "DJ-WLN-005",
    category: "WELLNESS",
    description:
      "Set of 6 therapeutic-grade essential oils: lavender, eucalyptus, peppermint, lemon, tea tree, rosemary.",
    longDescription:
      "The Zen Pure Essential Oil Set includes 6 therapeutic-grade oils (10ml each): lavender, eucalyptus, peppermint, lemon, tea tree, and rosemary. Steam-distilled, GC/MS tested for purity, no fillers or additives. Comes with a wooden storage box and diffuser guide.",
    images: [
      "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=600",
    ],
    mrp: 2999,
    distributorPrice: 1800,
    commissionRate: 13,
    stock: 64,
    rating: 4.9,
    reviewCount: 421,
    features: [
      "6 oils × 10ml",
      "Therapeutic grade",
      "GC/MS tested",
      "Wooden storage box",
      "Diffuser guide included",
    ],
    trainingModuleIds: ["trn_001"],
  },
  {
    id: "prod_006",
    name: "Dayjoy Bamboo Toothbrush (4-pack)",
    slug: "bamboo-toothbrush-4pack",
    sku: "DJ-PC-006",
    category: "PERSONAL_CARE",
    description:
      "Eco-friendly bamboo toothbrushes with charcoal-infused soft bristles. Pack of 4.",
    longDescription:
      "Switch to sustainable oral care with the Dayjoy Bamboo Toothbrush 4-pack. Biodegradable bamboo handles, charcoal-infused soft bristles, and plastic-free packaging. Dentist-recommended bristle firmness. Each brush lasts 3 months.",
    images: [
      "https://images.unsplash.com/photo-1559591937-abc5e0e9e35c?w=600",
    ],
    mrp: 599,
    distributorPrice: 360,
    commissionRate: 18,
    stock: 540,
    rating: 4.4,
    reviewCount: 892,
    features: [
      "Pack of 4",
      "Bamboo handles",
      "Charcoal bristles",
      "Plastic-free packaging",
      "Dentist-recommended",
    ],
    trainingModuleIds: [],
  },
];

// ===== Orders =====
export const MOCK_ORDERS: Order[] = [
  {
    id: "ord_001",
    orderNumber: "DJ-ORD-2026-0142",
    customerId: "cus_003",
    customerName: "Arjun Kapoor",
    customerPhone: "+91 99887 22222",
    items: [
      {
        id: "oi_1",
        productId: "prod_001",
        productName: "Dayjoy Glow Diffuser",
        productImage:
          "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=200",
        quantity: 10,
        unitPrice: 2400,
        commissionRate: 12,
        lineTotal: 24000,
        commissionEarned: 2880,
      },
      {
        id: "oi_2",
        productId: "prod_005",
        productName: "Zen Pure Essential Oil Set",
        productImage:
          "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=200",
        quantity: 5,
        unitPrice: 1800,
        commissionRate: 13,
        lineTotal: 9000,
        commissionEarned: 1170,
      },
    ],
    subtotal: 33000,
    tax: 5940,
    shipping: 0,
    total: 38940,
    commissionEarned: 4050,
    status: "SHIPPED",
    shippingAddress:
      "8 Civil Lines, Delhi, Delhi 110054",
    trackingNumber: "DLH-2026-998877",
    trackingUrl: "https://track.delhivery.com/DLH-2026-998877",
    invoiceUrl: "/api/invoices/DJ-ORD-2026-0142.pdf",
    timeline: [
      {
        id: "t1",
        status: "CREATED",
        label: "Order Placed",
        timestamp: days(3),
      },
      {
        id: "t2",
        status: "CONFIRMED",
        label: "Confirmed",
        timestamp: days(3),
      },
      {
        id: "t3",
        status: "PROCESSING",
        label: "Processing",
        timestamp: days(2),
      },
      {
        id: "t4",
        status: "SHIPPED",
        label: "Shipped",
        description: "Tracking: DLH-2026-998877",
        timestamp: days(1),
      },
    ],
    createdAt: days(3),
    updatedAt: days(1),
  },
  {
    id: "ord_002",
    orderNumber: "DJ-ORD-2026-0141",
    customerId: "cus_001",
    customerName: "Vikram Iyer",
    customerPhone: "+91 98123 45678",
    items: [
      {
        id: "oi_3",
        productId: "prod_004",
        productName: "Radiance Vitamin C Serum",
        productImage:
          "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=200",
        quantity: 4,
        unitPrice: 1100,
        commissionRate: 14,
        lineTotal: 4400,
        commissionEarned: 616,
      },
    ],
    subtotal: 4400,
    tax: 792,
    shipping: 99,
    total: 5291,
    commissionEarned: 616,
    status: "DELIVERED",
    shippingAddress: "12 MG Road, Indiranagar, Bengaluru 560038",
    trackingNumber: "BLDT-2026-445566",
    trackingUrl: "https://track.bluedart.com/BLDT-2026-445566",
    invoiceUrl: "/api/invoices/DJ-ORD-2026-0141.pdf",
    timeline: [
      { id: "t5", status: "CREATED", label: "Order Placed", timestamp: days(11) },
      { id: "t6", status: "CONFIRMED", label: "Confirmed", timestamp: days(11) },
      { id: "t7", status: "PROCESSING", label: "Processing", timestamp: days(10) },
      { id: "t8", status: "SHIPPED", label: "Shipped", timestamp: days(9) },
      { id: "t9", status: "DELIVERED", label: "Delivered", timestamp: days(7) },
    ],
    createdAt: days(11),
    updatedAt: days(7),
  },
  {
    id: "ord_003",
    orderNumber: "DJ-ORD-2026-0140",
    customerId: "cus_002",
    customerName: "Meera Joshi",
    customerPhone: "+91 98765 11111",
    items: [
      {
        id: "oi_4",
        productId: "prod_002",
        productName: "Aura Smart Lamp",
        productImage:
          "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=200",
        quantity: 1,
        unitPrice: 3300,
        commissionRate: 10,
        lineTotal: 3300,
        commissionEarned: 330,
      },
      {
        id: "oi_5",
        productId: "prod_006",
        productName: "Dayjoy Bamboo Toothbrush (4-pack)",
        productImage:
          "https://images.unsplash.com/photo-1559591937-abc5e0e9e35c?w=200",
        quantity: 2,
        unitPrice: 360,
        commissionRate: 18,
        lineTotal: 720,
        commissionEarned: 129.6,
      },
    ],
    subtotal: 4020,
    tax: 723.6,
    shipping: 149,
    total: 4892.6,
    commissionEarned: 459.6,
    status: "PENDING",
    shippingAddress: "45 Boat Club Road, Pune 411001",
    trackingNumber: null,
    trackingUrl: null,
    invoiceUrl: null,
    timeline: [
      { id: "t10", status: "CREATED", label: "Order Placed", timestamp: hours(5) },
    ],
    createdAt: hours(5),
    updatedAt: hours(5),
  },
];

// ===== Training Modules =====
export const MOCK_TRAINING: TrainingModule[] = [
  {
    id: "trn_000",
    title: "Welcome to Dayjoy — Start Here",
    slug: "welcome-to-dayjoy",
    category: "ONBOARDING",
    description:
      "Your first 30 minutes at Dayjoy. Learn the mission, the products, and how to earn your first commission.",
    thumbnail: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=600",
    duration: 1200,
    type: "VIDEO",
    videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    outline: [
      "Dayjoy's mission and 10-year vision",
      "The 5 product categories",
      "How distributor commissions work",
      "Setting up your portal and profile",
      "Your first 7 days checklist",
    ],
    progress: 100,
    completed: true,
    locked: false,
    order: 0,
  },
  {
    id: "trn_001",
    title: "Selling the Glow Diffuser",
    slug: "selling-glow-diffuser",
    category: "PRODUCT_TRAINING",
    description:
      "Everything you need to know about the #1 bestseller: features, demos, objection handling, and bundle ideas.",
    thumbnail: "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=600",
    duration: 1800,
    type: "VIDEO",
    videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    outline: [
      "Product walkthrough and key features",
      "Live demo script",
      "Top 5 objections and rebuttals",
      "Bundle ideas (Aura Lamp, Essential Oils)",
      "Closing techniques",
    ],
    progress: 60,
    completed: false,
    locked: false,
    order: 1,
    quiz: {
      passingScore: 70,
      questions: [
        {
          id: "q1",
          question: "What is the water capacity of the Glow Diffuser?",
          options: ["200ml", "300ml", "400ml", "500ml"],
          correctIndex: 1,
        },
        {
          id: "q2",
          question: "How many LED colors does the Glow Diffuser offer?",
          options: ["3", "5", "7", "10"],
          correctIndex: 2,
        },
        {
          id: "q3",
          question: "What is the warranty period?",
          options: ["6 months", "1 year", "2 years", "Lifetime"],
          correctIndex: 2,
        },
      ],
    },
  },
  {
    id: "trn_002",
    title: "Smart Home Pitch — Aura Lamp Edition",
    slug: "aura-lamp-pitch",
    category: "PRODUCT_TRAINING",
    description:
      "Position the Aura Smart Lamp as the centerpiece of a smart home. Cross-sell with the Glow Diffuser.",
    thumbnail: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=600",
    duration: 1500,
    type: "VIDEO",
    videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    outline: [
      "Smart home market opportunity",
      "Aura Lamp positioning vs competitors",
      "Demo: app + voice control",
      "Cross-sell script (Glow Diffuser bundle)",
      "Q&A",
    ],
    progress: 0,
    completed: false,
    locked: false,
    order: 2,
  },
  {
    id: "trn_003",
    title: "Nutrition Sales Fundamentals",
    slug: "nutrition-sales-fundamentals",
    category: "PRODUCT_TRAINING",
    description:
      "Sell the Pure Nutrition Shake with confidence. Understand macros, target audiences, and subscription models.",
    thumbnail: "https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=600",
    duration: 2100,
    type: "VIDEO",
    outline: [
      "Macronutrient breakdown",
      "Who is the target customer?",
      "Subscription vs one-time purchase",
      "Sample day meal plan",
      "Compliance and claims",
    ],
    progress: 0,
    completed: false,
    locked: true,
    order: 3,
  },
  {
    id: "trn_010",
    title: "Prospecting & Lead Generation",
    slug: "prospecting-lead-generation",
    category: "SALES_TECHNIQUES",
    description:
      "The ABCs of building a healthy pipeline. Cold outreach scripts, social selling, referral systems.",
    thumbnail: "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=600",
    duration: 2400,
    type: "VIDEO",
    outline: [
      "Pipeline math (1 close = N leads)",
      "Cold outreach playbook",
      "Social selling on Instagram + WhatsApp",
      "Referral systems that scale",
      "Lead scoring basics",
    ],
    progress: 100,
    completed: true,
    locked: false,
    order: 10,
  },
  {
    id: "trn_020",
    title: "Compensation Plan Deep Dive",
    slug: "compensation-plan-deep-dive",
    category: "BUSINESS_PLAN",
    description:
      "Understand the 5-tier ladder, retail profit, team commissions, leadership bonuses, and rank-qualification rules.",
    thumbnail: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=600",
    duration: 3000,
    type: "VIDEO",
    outline: [
      "The 5-tier ladder",
      "Retail profit (15–30%)",
      "Team commission structure",
      "Leadership bonus qualification",
      "Rank-advancement checklists",
    ],
    progress: 30,
    completed: false,
    locked: false,
    order: 20,
  },
  {
    id: "trn_030",
    title: "Building Your First Team",
    slug: "building-your-first-team",
    category: "LEADERSHIP",
    description:
      "Recruit, onboard, and retain your first 5 distributors. Includes onboarding checklist and weekly cadence template.",
    thumbnail: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600",
    duration: 2700,
    type: "DOCUMENT",
    documentUrl: "/training/building-first-team.pdf",
    outline: [
      "Recruiting philosophy",
      "The 5 conversations framework",
      "Onboarding checklist",
      "Weekly 1:1 cadence template",
      "Handling common objections",
    ],
    progress: 0,
    completed: false,
    locked: true,
    order: 30,
  },
];

// ===== Knowledge Articles =====
export const MOCK_KNOWLEDGE: KnowledgeArticle[] = [
  {
    id: "kb_001",
    slug: "compensation-plan-overview",
    title: "Compensation Plan Overview",
    category: "COMPENSATION_PLAN",
    summary:
      "A complete breakdown of the Dayjoy 5-tier distributor compensation plan, including retail profit, team commissions, and leadership bonuses.",
    content: `# Compensation Plan Overview

Dayjoy rewards distributors through **5 income streams**:

1. **Retail Profit** — 15% to 30% margin on every product sold at MRP.
2. **Personal Sales Commission** — 3% to 15% based on your tier (BRONZE → DIAMOND).
3. **Team Commission** — Override commission on your downline's sales, up to 7 levels deep.
4. **Leadership Bonus** — Monthly cash bonus when you qualify for GOLD or above.
5. **Rank Advancement Bonus** — One-time payout when you advance a tier.

## Tier ladder

| Tier   | Personal Sales (monthly) | Team Volume | Commission Rate |
|--------|--------------------------|-------------|-----------------|
| BRONZE | ₹10,000                  | —           | 3%              |
| SILVER | ₹25,000                  | ₹50,000     | 5%              |
| GOLD   | ₹50,000                  | ₹2,00,000   | 8%              |
| PLATINUM | ₹1,00,000              | ₹5,00,000   | 12%             |
| DIAMOND | ₹2,00,000               | ₹15,00,000  | 15%             |

## Important rules

- Commissions are calculated on **distributor price** (not MRP).
- Payouts happen on the **15th of every month** for the previous month's earnings.
- Minimum payout threshold: **₹1,000**.
- Tax (TDS) is deducted at source as per Indian Income Tax rules.
`,
    author: "Dayjoy Compliance Team",
    updatedAt: days(15),
    readTime: 6,
    views: 1842,
    helpful: 142,
    notHelpful: 8,
    tags: ["compensation", "tiers", "commissions"],
    relatedIds: ["kb_002", "kb_005"],
  },
  {
    id: "kb_002",
    slug: "how-commissions-are-calculated",
    title: "How Commissions Are Calculated",
    category: "COMPENSATION_PLAN",
    summary:
      "Step-by-step breakdown of how your monthly commission is calculated, with worked examples.",
    content: `# How Commissions Are Calculated

Your monthly commission is the sum of:

\`\`\`
Personal Sales Commission
+ Team Commission (downline override)
+ Leadership Bonus (if qualified)
+ Rank Advancement Bonus (if you advanced)
− TDS (10% if PAN provided, 20% otherwise)
− Returns/Refunds adjustment
= Net Payout
\`\`\`

## Worked example

You're at **GOLD tier** (8% commission rate).

- Personal sales: ₹50,000 (on distributor price)
- Team sales (7 levels): ₹2,00,000
- Your commission: ₹50,000 × 8% = **₹4,000**
- Team override (avg 3%): ₹2,00,000 × 3% = **₹6,000**
- Leadership bonus (GOLD): **₹2,500**
- **Gross:** ₹12,500
- **TDS (10%):** ₹1,250
- **Net payout:** **₹11,250**

Payout hits your bank account on the 15th of the following month.
`,
    author: "Dayjoy Compliance Team",
    updatedAt: days(20),
    readTime: 4,
    views: 982,
    helpful: 87,
    notHelpful: 3,
    tags: ["commissions", "calculations", "examples"],
    relatedIds: ["kb_001", "kb_005"],
  },
  {
    id: "kb_003",
    slug: "return-and-refund-policy",
    title: "Return & Refund Policy",
    category: "POLICIES",
    summary:
      "Dayjoy's 7-day return policy, eligibility rules, and the step-by-step process for initiating a return.",
    content: `# Return & Refund Policy

Dayjoy offers a **7-day return window** from the date of delivery, subject to the conditions below.

## Eligible products

- Sealed and unused products in original packaging
- Defective or damaged products (with photo proof)
- Wrong product delivered

## Not eligible

- Products marked "non-returnable" (e.g. nutritional supplements once opened)
- Products damaged by misuse
- Products returned after 7 days

## How to initiate a return

1. Log in to the Distributor Portal.
2. Go to **Orders** → click the order → **Initiate Return**.
3. Select the items and reason.
4. Upload photo proof (for damaged/wrong items).
5. Dayjoy reviews within 48 hours.
6. On approval, a pickup is scheduled (2–4 business days).
7. Refund is credited to the customer's original payment method within 5 business days of pickup.

## Commission impact

- Returned orders ** claw back** the commission earned.
- The claw-back appears on your next commission statement.
`,
    author: "Dayjoy Customer Care",
    updatedAt: days(35),
    readTime: 3,
    views: 1456,
    helpful: 110,
    notHelpful: 12,
    tags: ["returns", "refunds", "policy"],
    relatedIds: ["kb_004"],
  },
  {
    id: "kb_004",
    slug: "shipping-and-delivery-sop",
    title: "Shipping & Delivery SOP",
    category: "SOPS",
    summary:
      "Standard operating procedure for order fulfillment, shipping partners, and delivery timelines across India.",
    content: `# Shipping & Delivery SOP

## Order processing

- Orders placed before **3 PM** ship the same business day.
- Orders placed after 3 PM ship the next business day.
- Sunday and public holidays are not business days.

## Shipping partners

| Region        | Partner     | ETA (business days) |
|---------------|-------------|---------------------|
| Metro cities  | Bluedart    | 1–2                 |
| Tier-2 cities | Delhivery   | 2–4                 |
| Rural         | India Post  | 5–8                 |

## Tracking

- A tracking number is generated when the order ships.
- The customer receives an SMS + email with the tracking link.
- Distributors can view tracking in **Orders → Order Detail**.

## Damaged-in-transit

- Customer must report within **48 hours** of delivery with photos.
- Dayjoy files a claim with the shipping partner.
- Replacement ships within 3 business days.
`,
    author: "Dayjoy Logistics",
    updatedAt: days(10),
    readTime: 5,
    views: 624,
    helpful: 51,
    notHelpful: 4,
    tags: ["shipping", "delivery", "sop"],
    relatedIds: ["kb_003"],
  },
  {
    id: "kb_005",
    slug: "tier-advancement-faq",
    title: "Tier Advancement — Frequently Asked Questions",
    category: "FAQs",
    summary:
      "Common questions about advancing through the Dayjoy tier ladder, including volume requirements and timing.",
    content: `# Tier Advancement FAQ

**Q: When does tier advancement happen?**
A: On the **1st of every month**, we calculate your previous month's personal sales + team volume. If you meet the next tier's requirements, you advance.

**Q: Do I lose my tier if I have a slow month?**
A: You have a **2-month grace period**. If you miss the requirement for 3 consecutive months, you drop one tier.

**Q: Does my team volume include my personal sales?**
A: No. Personal sales and team volume are calculated separately. You must meet **both** thresholds.

**Q: Can I jump two tiers in one month?**
A: Yes, if you meet both tiers' requirements in the same month.

**Q: How can I check my progress toward the next tier?**
A: Go to **Dashboard → Tier Progress** in the portal.

**Q: What happens to my commission rate mid-month?**
A: Your rate is locked on the 1st of the month. Advancements take effect the following month.
`,
    author: "Dayjoy Support",
    updatedAt: days(8),
    readTime: 3,
    views: 1124,
    helpful: 96,
    notHelpful: 5,
    tags: ["tiers", "advancement", "faq"],
    relatedIds: ["kb_001", "kb_002"],
  },
];

// ===== Announcements =====
export const MOCK_ANNOUNCEMENTS: Announcement[] = [
  {
    id: "ann_001",
    title: "New Product Launch: Radiance Vitamin C Serum",
    category: "PRODUCT",
    summary:
      "Our highest-commission beauty product (14%) is now in stock. Limited launch inventory — sell fast.",
    body: `We're thrilled to announce the launch of **Radiance Vitamin C Serum** (SKU DJ-BTY-004).

- MRP: ₹1,899
- Distributor Price: ₹1,100
- **Commission Rate: 14%**

This is our highest-commission beauty product to date. Initial inventory is limited to **5,000 units** — sell fast to lock in your commission.

## Marketing assets

- Product photography: available in Documents → Certificates
- Sales script: see Training → Selling Beauty Products
- Social media kit: download from Knowledge Base → Product Info

Launch offer valid through end of month.
`,
    author: "Dayjoy Product Team",
    publishedAt: hours(8),
    pinned: true,
    read: false,
  },
  {
    id: "ann_002",
    title: "Q3 Leadership Summit — Bengaluru",
    category: "EVENT",
    summary:
      "Join 500+ GOLD+ distributors for a 2-day leadership summit. Limited seats — RSVP now.",
    body: `The Q3 Leadership Summit brings together GOLD, PLATINUM, and DIAMOND distributors for a 2-day intensive.

**When:** Sep 18–19, 2026
**Where:** The Leela Palace, Bengaluru
**Who:** GOLD tier and above

## What you'll get

- New product roadmap reveal
- Compensation plan updates for 2027
- Workshop: Building 100-person teams
- Networking with top earners

RSVP via the Events page. First 200 confirmed attendees get a free wellness kit.
`,
    author: "Dayjoy Events",
    publishedAt: days(2),
    pinned: true,
    read: false,
  },
  {
    id: "ann_003",
    title: "Commission payout schedule for August",
    category: "COMPANY",
    summary:
      "August commissions will be paid on Sep 15. Make sure your bank details and PAN are verified.",
    body: `August commission payouts will be processed on **September 15, 2026**.

To ensure timely payment:

1. Verify your **bank account details** in Profile → Bank Details.
2. Verify your **PAN number** in Profile → Business Details.
3. Submit pending **KYC documents** in Profile → Documents.

Unverified accounts will have payouts held until the following month.
`,
    author: "Dayjoy Finance",
    publishedAt: days(4),
    pinned: false,
    read: true,
  },
  {
    id: "ann_004",
    title: "Festive Season Promo — Double Commission on Wellness",
    category: "PROMOTION",
    summary:
      "From Oct 1–31, earn 2× commission on all Wellness category products.",
    body: `**Double Commission Festive Promo**

From October 1 to October 31, all Wellness category products earn **2× the standard commission rate**.

- Glow Diffuser: 12% → **24%**
- Zen Essential Oil Set: 13% → **26%**

No promo code needed — commissions auto-adjust in your portal.

Max payout per distributor: ₹50,000 in bonus commission.
`,
    author: "Dayjoy Marketing",
    publishedAt: days(6),
    pinned: false,
    read: true,
  },
];

// ===== Events =====
export const MOCK_EVENTS: EventItem[] = [
  {
    id: "evt_001",
    title: "Q3 Leadership Summit — Bengaluru",
    type: "MEETING",
    description:
      "2-day intensive for GOLD+ distributors. New product roadmap, compensation updates, and team-building workshops.",
    startAt: future(40),
    endAt: future(41),
    location: "The Leela Palace, Bengaluru",
    meetingLink: null,
    capacity: 500,
    registered: 312,
    rsvped: false,
    past: false,
  },
  {
    id: "evt_002",
    title: "Webinar: Selling the Glow Diffuser",
    type: "WEBINAR",
    description:
      "Live product demo + Q&A with the category manager. Learn objection handling and bundle techniques.",
    startAt: future(3),
    endAt: future(3),
    location: "Zoom (link after RSVP)",
    meetingLink: "https://zoom.us/j/1234567890",
    capacity: 1000,
    registered: 487,
    rsvped: true,
    past: false,
  },
  {
    id: "evt_003",
    title: "New Distributor Onboarding — Batch 142",
    type: "TRAINING",
    description:
      "Mandatory onboarding for new distributors joined in the last 2 weeks. Covers portal setup, first sale, and compliance.",
    startAt: future(7),
    endAt: future(7),
    location: "Online (Dayjoy LMS)",
    meetingLink: "https://learn.dayjoy.ai/live/batch-142",
    capacity: 100,
    registered: 67,
    rsvped: false,
    past: false,
  },
  {
    id: "evt_004",
    title: "Festive Season Kickoff",
    type: "LAUNCH",
    description:
      "Unveiling the festive promo and 3 new SKUs. Hybrid event — Bengaluru HQ + live stream.",
    startAt: future(15),
    endAt: future(15),
    location: "Dayjoy HQ, Mumbai + Live stream",
    meetingLink: null,
    capacity: 2000,
    registered: 1204,
    rsvped: true,
    past: false,
  },
  {
    id: "evt_005",
    title: "August All-Hands",
    type: "MEETING",
    description:
      "Monthly all-hands with the leadership team. August performance review and September priorities.",
    startAt: days(12),
    endAt: days(12),
    location: "Online (Zoom)",
    meetingLink: null,
    capacity: 5000,
    registered: 4231,
    rsvped: true,
    past: true,
    recordingUrl: "https://learn.dayjoy.ai/recordings/aug-all-hands",
  },
];

// ===== Notifications =====
export const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "ntf_001",
    type: "COMMISSION",
    title: "₹4,050 commission earned",
    body: "Order DJ-ORD-2026-0142 (Arjun Kapoor) — commission of ₹4,050 has been credited.",
    read: false,
    link: "/orders/ord_001",
    createdAt: hours(2),
  },
  {
    id: "ntf_002",
    type: "TEAM",
    title: "New team member joined",
    body: "Riya Malhotra joined your downline under sponsor 'Vikram Iyer'.",
    read: false,
    link: "/team",
    createdAt: hours(6),
  },
  {
    id: "ntf_003",
    type: "ORDER",
    title: "New order: DJ-ORD-2026-0140",
    body: "Meera Joshi placed an order worth ₹4,893. Pending confirmation.",
    read: false,
    link: "/orders/ord_003",
    createdAt: hours(5),
  },
  {
    id: "ntf_004",
    type: "ANNOUNCEMENT",
    title: "New product launch: Radiance Vitamin C Serum",
    body: "Our highest-commission beauty product (14%) is now in stock.",
    read: true,
    link: "/announcements",
    createdAt: hours(8),
  },
  {
    id: "ntf_005",
    type: "SYSTEM",
    title: "KYC documents expiring soon",
    body: "Your address proof document expires in 30 days. Upload a renewed copy in Profile → Documents.",
    read: true,
    link: "/profile",
    createdAt: days(1),
  },
  {
    id: "ntf_006",
    type: "COMMISSION",
    title: "August commission statement ready",
    body: "Your August commission statement (₹42,180 net) is ready to download.",
    read: true,
    link: "/documents",
    createdAt: days(3),
  },
  {
    id: "ntf_007",
    type: "TEAM",
    title: "Tier advancement: GOLD → PLATINUM",
    body: "Congratulations! You've qualified for PLATINUM tier. Effective October 1.",
    read: true,
    link: "/dashboard",
    createdAt: days(4),
  },
];

// ===== Documents =====
export const MOCK_DOCUMENTS: DocumentItem[] = [
  {
    id: "doc_001",
    name: "August 2026 Commission Statement.pdf",
    category: "COMMISSION_STATEMENTS",
    type: "PDF",
    size: 184320,
    url: "/api/documents/comm-stmt-aug-2026.pdf",
    uploadedAt: days(3),
    uploadedBy: "Dayjoy Finance",
  },
  {
    id: "doc_002",
    name: "Invoice DJ-ORD-2026-0142.pdf",
    category: "INVOICES",
    type: "PDF",
    size: 92160,
    url: "/api/invoices/DJ-ORD-2026-0142.pdf",
    uploadedAt: days(3),
    uploadedBy: "System",
  },
  {
    id: "doc_003",
    name: "Invoice DJ-ORD-2026-0141.pdf",
    category: "INVOICES",
    type: "PDF",
    size: 88480,
    url: "/api/invoices/DJ-ORD-2026-0141.pdf",
    uploadedAt: days(11),
    uploadedBy: "System",
  },
  {
    id: "doc_004",
    name: "Form 16 — FY 2025-26.pdf",
    category: "TAX_DOCUMENTS",
    type: "PDF",
    size: 245760,
    url: "/api/documents/form-16-fy25-26.pdf",
    uploadedAt: days(60),
    uploadedBy: "Dayjoy Finance",
  },
  {
    id: "doc_005",
    name: "GST Returns — Q1 2026.xlsx",
    category: "TAX_DOCUMENTS",
    type: "XLSX",
    size: 54272,
    url: "/api/documents/gst-returns-q1-2026.xlsx",
    uploadedAt: days(75),
    uploadedBy: "Dayjoy Finance",
  },
  {
    id: "doc_006",
    name: "Distributor Certificate — GOLD Tier.pdf",
    category: "CERTIFICATES",
    type: "PDF",
    size: 122880,
    url: "/api/documents/gold-tier-cert.pdf",
    uploadedAt: days(90),
    uploadedBy: "Dayjoy Compliance",
  },
  {
    id: "doc_007",
    name: "Distributor Agreement 2026.pdf",
    category: "AGREEMENTS",
    type: "PDF",
    size: 319488,
    url: "/api/documents/distributor-agreement-2026.pdf",
    uploadedAt: days(180),
    uploadedBy: "Dayjoy Legal",
  },
];

// ===== Distributor Profile =====
export const MOCK_PROFILE: DistributorProfile = {
  id: "dist_001",
  distributorCode: "DJ-DIST-10042",
  firstName: "Anil",
  lastName: "Kumar",
  email: "anil.kumar@example.com",
  phone: "+91 98765 43210",
  avatarUrl: null,
  dateOfBirth: "1990-04-15",
  tier: "GOLD",
  joinDate: days(420),
  sponsorName: "Sunil Gupta",
  businessName: "Anil Wellness Ventures",
  taxId: "ABCDE1234F",
  panNumber: "ABCDE1234F",
  gstNumber: "27ABCDE1234F1Z5",
  bankAccount: {
    accountHolder: "Anil Kumar",
    accountNumber: "XXXX-XXXX-4829",
    ifsc: "HDFC0001234",
    bankName: "HDFC Bank",
    branch: "Indiranagar, Bengaluru",
  },
  address: {
    line1: "12 MG Road, Indiranagar",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560038",
    country: "India",
  },
  documents: [
    {
      id: "pd1",
      type: "ID_PROOF",
      name: "Aadhaar Card.pdf",
      uploadedAt: days(420),
      verified: true,
    },
    {
      id: "pd2",
      type: "ADDRESS_PROOF",
      name: "Electricity Bill.pdf",
      uploadedAt: days(420),
      verified: true,
    },
    {
      id: "pd3",
      type: "BANK_PROOF",
      name: "Cancelled Cheque.jpg",
      uploadedAt: days(420),
      verified: true,
    },
    {
      id: "pd4",
      type: "PHOTO",
      name: "Passport Photo.jpg",
      uploadedAt: days(420),
      verified: true,
    },
  ],
};

// ===== AI Conversations =====
export const MOCK_AI_CONVERSATIONS: AiConversation[] = [
  {
    id: "ai_001",
    title: "Glow Diffuser pitch for cold lead",
    preview:
      "Generate a 60-second sales pitch for the Dayjoy Glow Diffuser I can use with a new prospect.",
    messageCount: 4,
    lastMessageAt: hours(2),
    channel: "WEB",
  },
  {
    id: "ai_002",
    title: "Reaching PLATINUM tier strategy",
    preview:
      "I'm currently at GOLD tier with ₹4.2L in sales. What do I need to reach PLATINUM next month?",
    messageCount: 6,
    lastMessageAt: days(1),
    channel: "WEB",
  },
  {
    id: "ai_003",
    title: "Follow-up message for Priya Patel",
    preview: "Suggest the best WhatsApp follow-up for a lead who showed interest in wellness products.",
    messageCount: 3,
    lastMessageAt: days(3),
    channel: "WHATSAPP",
  },
  {
    id: "ai_004",
    title: "Team performance review — August",
    preview: "Analyze my team's performance this month and identify my top 3 performers.",
    messageCount: 8,
    lastMessageAt: days(5),
    channel: "VOICE",
  },
];

export const MOCK_AI_MESSAGES: Record<string, AiMessage[]> = {
  ai_001: [
    {
      id: "m1",
      role: "user",
      content:
        "Generate a 60-second sales pitch for the Dayjoy Glow Diffuser I can use with a new prospect.",
      createdAt: hours(2),
    },
    {
      id: "m2",
      role: "assistant",
      content: `Here's a 60-second pitch for the **Glow Diffuser**:

> "Imagine walking into your home and instantly feeling calmer. That's what the Dayjoy Glow Diffuser does — it transforms any room into a personal sanctuary using ultrasonic aromatherapy and 7-color mood lighting.
>
> With a 300ml capacity and up to 10 hours of runtime, it's perfect for bedrooms, living rooms, or your workspace. It auto-shuts-off when the water runs out, so it's safe around kids and pets.
>
> The Glow Diffuser retails at ₹3,999, but as a Dayjoy distributor I can offer you a special bundle price. Would you like me to set one up for you this week?"

**Tips:**
- Demo the LED colors if you have a unit on hand
- Cross-sell with the Zen Essential Oil Set (₹2,999) — adds ₹390 commission
- Mention the 2-year warranty as a closer

Want me to suggest follow-up messages too?`,
      citations: [
        { source: "kb_001", title: "Glow Diffuser product spec" },
      ],
      createdAt: hours(2),
    },
    {
      id: "m3",
      role: "user",
      content: "Yes, suggest 2 follow-up messages — one for WhatsApp, one for email.",
      createdAt: hours(1),
    },
    {
      id: "m4",
      role: "assistant",
      content: `Sure! Here are 2 follow-up messages:

**WhatsApp (Day 2):**
> Hi [Name]! Following up on our chat about the Glow Diffuser. I have a demo unit with me this week — would Tuesday or Wednesday work for a quick 10-min showcase? 🌿

**Email (Day 5):**
> Subject: Your Glow Diffuser demo — recap & special offer
>
> Hi [Name],
>
> Thanks again for your interest in the Glow Diffuser. As promised, here's a recap of the key features:
> - 300ml capacity, up to 10 hours runtime
> - 7-color LED mood lighting
> - 2-year warranty
>
> Special bundle offer valid through this Friday: Glow Diffuser + Zen Essential Oil Set at ₹5,999 (saves ₹999).
>
> Shall I lock in your order?
>
> Best,
> Anil`,
      createdAt: hours(1),
    },
  ],
  ai_002: [
    {
      id: "m5",
      role: "user",
      content:
        "I'm currently at GOLD tier with ₹4.2L in sales. What do I need to reach PLATINUM next month?",
      createdAt: days(1),
    },
    {
      id: "m6",
      role: "assistant",
      content: `To advance from **GOLD → PLATINUM**, you need to hit **both** thresholds in the same month:

| Requirement | GOLD (current) | PLATINUM (target) | Gap |
|-------------|----------------|-------------------|-----|
| Personal Sales | ₹50,000 | ₹1,00,000 | +₹50,000 |
| Team Volume | ₹2,00,000 | ₹5,00,000 | +₹3,00,000 |

**Your 4-week action plan:**

1. **Personal sales (+₹50k)**: Run a Glow Diffuser + Aura Lamp bundle promo to your top 10 customers. Avg order ₹5k → 10 orders = ₹50k. ✅

2. **Team volume (+₹3L)**: Identify 3 downline distributors who are 60-80% of their target. Run a 7-day "Finish Strong" sprint with daily check-ins.

3. **Recruit 2 new SILVER distributors**: Each new SILVER adds ~₹50k volume.

4. **Host 1 home demo event**: Target ₹1L in single-event sales.

Want me to draft the bundle promo email and the team sprint playbook?`,
      citations: [
        { source: "kb_001", title: "Compensation Plan Overview" },
        { source: "kb_005", title: "Tier Advancement FAQ" },
      ],
      createdAt: days(1),
    },
  ],
};

// ===== Settings =====
export const DEFAULT_SETTINGS: UserSettings = {
  theme: "light",
  language: "en-IN",
  dateFormat: "DD MMM YYYY",
  timezone: "Asia/Kolkata",
  notifications: {
    channels: {
      email: true,
      sms: true,
      whatsapp: true,
      push: true,
    },
    categories: {
      commission: true,
      team: true,
      order: true,
      announcement: true,
      system: true,
    },
  },
  privacy: {
    profileVisible: true,
    contactInfoVisible: false,
  },
};

/**
 * Product catalogue types — consumed by the product list, search,
 * category, and detail pages.
 */

export interface ProductImage {
  id: string;
  url: string;
  altText?: string;
  /** Display position (0 = hero). */
  position?: number;
}

export interface ProductReview {
  id: string;
  authorName: string;
  authorAvatarUrl?: string;
  rating: number;
  title?: string;
  comment: string;
  createdAt: string;
  /** Whether the reviewer purchased the product (verified buyer). */
  verifiedPurchase?: boolean;
  helpfulCount?: number;
}

export interface ProductSpecification {
  label: string;
  value: string;
  /** Optional grouping for specs (e.g. "Dimensions", "Electrical"). */
  group?: string;
}

export interface ProductPricing {
  /** List price (before discounts). */
  listPrice: number;
  /** Final selling price. */
  salePrice: number;
  currency: string;
  /** Percentage off, when on sale. */
  discountPercent?: number;
}

export type ProductAvailability = "in_stock" | "low_stock" | "out_of_stock" | "preorder";

export interface Product {
  id: string;
  slug: string;
  name: string;
  shortDescription?: string;
  description?: string;
  categoryId: string;
  categoryName?: string;
  categorySlug?: string;
  brand?: string;
  sku: string;
  images: ProductImage[];
  pricing: ProductPricing;
  currency: string;
  rating?: number;
  reviewCount?: number;
  availability: ProductAvailability;
  /** Stock units remaining (when known). */
  stockQuantity?: number;
  tags?: string[];
  specifications?: ProductSpecification[];
  /** Whether this product is featured in AI recommendations. */
  isRecommended?: boolean;
  isFeatured?: boolean;
  isNew?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductCategory {
  id: string;
  slug: string;
  name: string;
  description?: string;
  imageUrl?: string;
  parentId?: string | null;
  productCount?: number;
  /** Nested subcategories (optional — only when requested). */
  children?: ProductCategory[];
}

export interface ProductReviewSummary {
  averageRating: number;
  totalReviews: number;
  /** Distribution: rating → count (1..5). */
  distribution: Record<string, number>;
}

export interface ProductFilters {
  categoryId?: string;
  categorySlug?: string;
  brand?: string[];
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  availability?: ProductAvailability[];
  tags?: string[];
  search?: string;
  /** "recommended" | "featured" | "new" — special filter modes. */
  filter?: "recommended" | "featured" | "new";
}

export type ProductSortOption =
  | "price_asc"
  | "price_desc"
  | "rating"
  | "newest"
  | "popularity";

export interface ProductDetail extends Product {
  reviews?: ProductReview[];
  reviewSummary?: ProductReviewSummary;
  relatedProducts?: Product[];
  /** AI-generated natural-language summary of the product. */
  aiSummary?: string;
  /** Typical questions a buyer might ask, answered by the AI. */
  aiFaqs?: Array<{ question: string; answer: string }>;
}

// ===== Cart (client-side, but defined alongside products) =====

export interface CartItem {
  productId: string;
  slug: string;
  name: string;
  imageUrl?: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  currency: string;
  /** Snapshot of the max stock at add-time, for client-side guards. */
  maxStock?: number;
}

// ===== AI Recommendation =====

export interface ProductRecommendation {
  product: Product;
  /** Why the AI recommended this — shown as a tooltip / caption. */
  reason?: string;
  /** 0..1 confidence score, when available. */
  score?: number;
}

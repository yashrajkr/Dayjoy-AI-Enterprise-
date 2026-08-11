/**
 * Customer profile types — consumed by the profile pages (personal
 * details, addresses, documents, security, preferences).
 */

export type Gender = "male" | "female" | "other" | "prefer_not_to_say";

export type AddressType = "shipping" | "billing";

export interface CustomerAddress {
  id: string;
  type: AddressType;
  label?: string;
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
  instructions?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomerDocument {
  id: string;
  name: string;
  type:
    | "invoice"
    | "certificate"
    | "warranty"
    | "prescription"
    | "id_proof"
    | "other";
  mimeType: string;
  sizeBytes: number;
  url: string;
  uploadedAt: string;
  /** Associated order id, if this is an invoice / warranty. */
  orderId?: string;
}

export interface CustomerSession {
  id: string;
  device: string;
  browser?: string;
  os?: string;
  ipAddress: string;
  location?: string;
  lastActiveAt: string;
  /** Whether this is the current session. */
  isCurrent?: boolean;
}

export interface CustomerPreferences {
  language: string;
  currency: string;
  /** Notification channel toggles. */
  notifications: {
    email: boolean;
    sms: boolean;
    whatsapp: boolean;
    push: boolean;
  };
  /** Marketing opt-ins. */
  marketing: {
    promotionalEmails: boolean;
    productUpdates: boolean;
    smsOffers: boolean;
    personalizedRecommendations: boolean;
  };
  /** Newsletter subscription. */
  newsletter: boolean;
}

export interface Customer {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  alternatePhone?: string;
  dateOfBirth?: string;
  gender?: Gender;
  avatarUrl?: string;
  /** Loyalty / reward points balance. */
  rewardPoints: number;
  /** Loyalty tier label, if the customer is enrolled. */
  tier?: string;
  addresses: CustomerAddress[];
  documents: CustomerDocument[];
  preferences: CustomerPreferences;
  /** Total lifetime order count. */
  totalOrders?: number;
  /** Lifetime spend in customer's preferred currency. */
  lifetimeValue?: number;
  memberSince?: string;
  status?: "active" | "inactive" | "suspended";
  createdAt?: string;
  updatedAt?: string;
}

// ===== DTOs =====

export interface UpdatePersonalDetailsDto {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth?: string;
  gender?: Gender;
  avatarUrl?: string;
}

export interface CreateAddressDto {
  type: AddressType;
  label?: string;
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  instructions?: string;
  isDefault?: boolean;
}

export type UpdateAddressDto = Partial<CreateAddressDto>;

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

export interface UpdatePreferencesDto {
  language?: string;
  currency?: string;
  notifications?: Partial<CustomerPreferences["notifications"]>;
  marketing?: Partial<CustomerPreferences["marketing"]>;
  newsletter?: boolean;
}

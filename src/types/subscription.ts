// Subscription DTOs — mirrors card-service SubscriptionResponse.
//
// A Subscription is a purchased CardDefinition instance tied to a specific store.
// walletBalance decrements on each redemption.
//
// Status lifecycle: ACTIVE → EXPIRED (time) | EXHAUSTED (balance=0) | CANCELLED (manual)
// The server auto-expires ACTIVE subscriptions whose expiresAt is in the past
// when GET /api/subscriptions/my/active is called.

import type { ItemType } from './store';

export type SubscriptionStatus = 'ACTIVE' | 'EXPIRED' | 'EXHAUSTED' | 'CANCELLED';

export interface Subscription {
  id: number;
  userId: number;
  cardDefinitionId: number;
  cardName: string;        // denormalized from CardDefinition at query time
  storeId: number;
  walletBalance: number;   // remaining balance (BigDecimal → number)
  // Wallet Consumption Grid fields — frozen at purchase time, never derived from
  // CardDefinition.walletAmount (which can drift after purchase) or cardPrice.
  // All three are null together for subscriptions purchased before this snapshot
  // column existed; treat null as "unknown historical entitlement", not zero.
  originalWalletAmount: number | null;
  consumedAmount: number | null;
  consumptionPercentage: number | null;
  couponCode: string | null;
  originalAmount: number | null;
  discountApplied: number | null;
  finalAmount: number | null;
  status: SubscriptionStatus;
  purchasedAt: string;     // ISO-8601 LocalDateTime
  expiresAt: string;       // ISO-8601 LocalDateTime
  createdAt: string;       // ISO-8601 LocalDateTime
}

// GET /api/subscriptions/my — paginated using Spring Page<T>
export interface SubscriptionPage {
  content: Subscription[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  last: boolean;
}

// GET /api/subscriptions/{id}/menu
// Contains ONLY categories + items the purchased card is eligible for.
// Used exclusively for the redemption flow — NOT a general store menu.
export interface EligibleMenuItem {
  itemId: number;
  name: string;
  price: number;             // BigDecimal → number
  itemType: ItemType;
  availabilityStatus: 'AVAILABLE';
}

export interface EligibleCategory {
  categoryId: number;
  categoryName: string;
  items: EligibleMenuItem[];
}

export interface EligibleMenu {
  subscriptionId: number;
  cardName: string;
  categories: EligibleCategory[];
}

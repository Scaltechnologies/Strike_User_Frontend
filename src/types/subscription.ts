// Subscription (Card Service) DTOs — mirrors /api/subscriptions/* contracts.
//
// A Subscription is a purchased Card instance tied to a specific store.
// It tracks usage (usedBoxes / totalBoxes) and carries the QR + stamp data
// needed to render the card detail screen.

import type { PaginationParams } from './api';
import type { MenuCategory } from './store';

export type SubscriptionStatus = 'active' | 'cancelled' | 'expired';

export interface Subscription {
  id: string;
  cardId: string;
  cardName: string;         // 'Curry Card', 'All in one', etc.
  cardType: string;
  restaurantId: string;
  restaurantName: string;
  restaurantAddress: string;
  totalBoxes: number;       // e.g. 32
  usedBoxes: number;        // e.g. 20
  status: SubscriptionStatus;
  validTill: string;        // ISO 8601 date
  daysLeft: number;
  color: string;            // card widget background color
  purchasedAt: string;      // ISO 8601
}

export interface SubscriptionDetail extends Subscription {
  qrData: string;           // raw data string to render as QR code
  stampPattern: boolean[];  // length === totalBoxes; true = used stamp
  termsAndConditions: string;
}

// Returned by GET /api/subscriptions/{id}/menu.
// Contains ONLY the categories and items the purchased card is eligible for.
// The frontend MUST NOT use this to show a full menu — only for redemption flows.
export interface EligibleMenu {
  subscriptionId: string;
  categories: MenuCategory[];
}

export interface CreateSubscriptionRequest {
  storeId: string;
  cardId: string;
  quantity: number;
  couponCode?: string;
}

export interface BillSummary {
  subtotal: number;
  taxes: number;
  platformCharges: number;
  discount: number;
  total: number;
}

export interface SubscriptionListParams extends PaginationParams {
  status?: SubscriptionStatus;
}

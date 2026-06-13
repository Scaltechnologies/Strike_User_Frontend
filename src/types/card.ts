// Card Service DTOs — mirrors the strike-gateway /api/stores/{id}/cards contract.
//
// Core business rule: a Card controls Categories, NOT individual Menu Items.
//   Card → eligible Categories → Menu Items in those categories.
// The eligible items for a purchased card are resolved server-side and returned
// from GET /api/subscriptions/{id}/menu (see subscription.ts).

export interface CardOption {
  id: string;
  name: string;              // 'All in One Card', 'Curry Card', 'Breakfast Card'
  validityDays: number;      // e.g. 32
  originalPrice: number;
  currentPrice: number;
  discountPercent: number | null;
  isMostPreferred: boolean;
  color: string;             // hex, used as card widget background gradient base
  description: string | null;
  includedCategoryIds: string[]; // which MenuCategory IDs this card covers
}

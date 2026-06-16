// CardDefinition — mirrors card-service CardDefinitionResponse.
//
// Core business rule: a Card controls Categories, NOT individual Menu Items.
//   Card → eligible CategoryIds → Menu Items in those categories.
//   The eligible items for a purchased card are resolved server-side and returned
//   from GET /api/subscriptions/{id}/menu, NOT from this type.
//
// bonusAmount is computed server-side: max(walletAmount - cardPrice, 0).
// It represents the bonus credit loaded on top of what the user paid.

export interface CardDefinition {
  id: number;
  vendorId: number;
  storeId: number;
  name: string;
  description: string | null;
  cardPrice: number;       // what the user pays (BigDecimal → number)
  walletAmount: number;    // credit loaded to wallet (BigDecimal → number)
  bonusAmount: number;     // max(walletAmount - cardPrice, 0) — server-computed
  validityInDays: number;
  imageUrl: string | null;
  isActive: boolean;
  categoryIds: number[];   // which MenuCategory IDs this card covers
  createdAt: string;       // ISO-8601 LocalDateTime
}

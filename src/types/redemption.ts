// Redemption Service DTOs — mirrors /api/redemptions/* contracts.

export type RedemptionStatus = 'completed' | 'failed' | 'pending';

export interface CreateRedemptionRequest {
  subscriptionId: string;
  boxes: number; // must not exceed (totalBoxes - usedBoxes)
}

export interface Redemption {
  id: string;
  subscriptionId: string;
  cardName: string;
  restaurantName: string;
  boxes: number;
  boxCost: number;      // cost per box in ₹
  totalAmount: number;
  timestamp: string;    // ISO 8601
  transactionRef: string; // e.g. '#10200330302'
  status: RedemptionStatus;
}

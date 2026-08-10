// Redemption DTOs — mirrors redemption-service contracts.
//
// V1 flow (vendor-initiated): vendor POSTs → COMPLETED → balance deducted.
// V2 flow (user-initiated):   user POSTs /request → PENDING →
//   vendor POSTs /approve → APPROVED → balance deducted, or
//   vendor POSTs /reject  → REJECTED → no balance change.

export type RedemptionStatus =
  | 'PENDING'    // user-initiated, waiting for vendor action
  | 'APPROVED'   // vendor approved, balance deducted
  | 'REJECTED'   // vendor rejected, no balance change
  | 'COMPLETED'  // legacy vendor-initiated flow
  | 'FAILED'     // legacy — validation or deduction failure
  | 'REVERSED';  // refund applied

export interface RedemptionItem {
  menuItemId:   number;
  menuItemName: string;
  quantity:     number;
  unitPrice:    number;   // BigDecimal → number
  totalPrice:   number;   // unitPrice × quantity
}

export interface Redemption {
  id:                number;
  subscriptionId:    number;
  userId:            number;
  storeId:           number;
  totalAmount:       number;
  remainingBalance:  number;  // wallet balance AFTER approval; 0 when PENDING/REJECTED
  status:            RedemptionStatus;
  items:             RedemptionItem[];
  rejectionReason?:  string;  // present when status === 'REJECTED'
  createdAt:         string;  // ISO-8601 LocalDateTime
}

// POST /api/redemptions/request body
export interface RedemptionRequestItem {
  menuItemId: number;
  quantity:   number;
}

export interface RedemptionRequest {
  subscriptionId: number;
  storeId:        number;
  items:          RedemptionRequestItem[];
}

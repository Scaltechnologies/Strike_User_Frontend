// Ledger Service DTOs — mirrors /api/ledger/* contracts.

import type { PaginationParams } from './api';

export type TransactionType = 'redemption' | 'purchase';
export type TransactionStatus = 'completed' | 'failed' | 'pending';

export interface Transaction {
  id: string;
  type: TransactionType;
  cardName: string;          // e.g. 'Meal Card -102929'
  restaurantName: string;
  restaurantId: string;
  boxes: number | null;      // only for redemption type
  amount: number | null;     // only for purchase type
  date: string;              // ISO 8601
  status: TransactionStatus;
  transactionRef: string | null;
}

export interface LedgerQueryParams extends PaginationParams {
  status?: TransactionStatus;
  type?: TransactionType;
}

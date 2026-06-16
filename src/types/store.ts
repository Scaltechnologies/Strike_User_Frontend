import type { PaginationParams } from './api';

// ── Nested types from backend StoreResponse ──────────────────────────────────

export interface StoreTiming {
  id: number;
  storeId: number;
  dayOfWeek: string;       // "MONDAY" … "SUNDAY"
  openTime: string | null; // "HH:mm:ss"
  closeTime: string | null;
  isClosed: boolean;
}

export interface StoreHoliday {
  id: number;
  storeId: number;
  date: string;            // "YYYY-MM-DD"
  reason: string | null;
  createdAt: string;
}

// ── Store status enum — mirrors Java StoreStatus ──────────────────────────────

export type StoreStatus = 'ACTIVE' | 'INACTIVE' | 'TEMPORARILY_CLOSED';

// ── Primary store DTO — matches vendor-service StoreResponse exactly ──────────

export interface Store {
  id: number;
  vendorId: number;
  name: string;
  address: string;
  phone: string | null;
  email: string | null;
  category: string;
  description: string | null;
  logoUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceKm: number | null;
  status: StoreStatus;
  timings: StoreTiming[];
  holidays: StoreHoliday[];
  createdAt: string;
  updatedAt: string;
}

// ── Menu types — match vendor-service CategoryWithItemsResponse / MenuItemResponse ─
//
// GET /api/user/stores/{id}/menu → MenuCategory[]
// Each category embeds its items directly.

export type ItemType = 'VEG' | 'NON_VEG';
export type ItemAvailabilityStatus = 'AVAILABLE' | 'OUT_OF_STOCK';

export interface MenuItem {
  id: number;
  name: string;
  description: string | null;
  price: number;                     // BigDecimal serialises as JSON number
  imageUrl: string | null;
  itemType: ItemType;
  availabilityStatus: ItemAvailabilityStatus;
  categoryId: number;
  storeId: number;
  createdAt: string;
  updatedAt: string;
}

export interface MenuCategory {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  displayOrder: number | null;
  items: MenuItem[];
}

// ── Query param types ─────────────────────────────────────────────────────────

export interface SearchStoresParams {
  q: string;
  category?: string;
}

export interface StoreListParams extends PaginationParams {
  category?: string;
}

import type { PaginationParams } from './api';

// ── Nested types from backend StoreResponse ──────────────────────────────────

export interface StoreTiming {
  id: number;
  storeId: number;
  dayOfWeek: string;       // "MONDAY" … "SUNDAY"
  openTime: string | null; // "HH:MM:SS"
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

// ── Store status enum mirrors Java StoreStatus ────────────────────────────────

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
  distanceKm: number | null;  // only populated by nearby endpoint
  status: StoreStatus;
  timings: StoreTiming[];
  holidays: StoreHoliday[];
  createdAt: string;
  updatedAt: string;
}

// ── Store detail (extends Store with menu) ────────────────────────────────────

export interface StoreDetail extends Store {
  mapThumbnailUrl: string | null;
  testimonials: Testimonial[];
}

export interface Testimonial {
  id: string;
  authorName: string;
  text: string;
  rating: number;
}

// ── Menu types ────────────────────────────────────────────────────────────────

export interface MenuCategory {
  id: string;
  name: string;
  items: MenuItem[];
}

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
  description: string | null;
}

export interface StoreMenu {
  storeId: string;
  categories: MenuCategory[];
}

// ── Query param types ─────────────────────────────────────────────────────────

export interface SearchStoresParams {
  q: string;
  category?: string;
}

// NearbyStoresParams omitted — /nearby/me uses the backend-saved user location,
// no lat/lng needed from the frontend.

export interface StoreListParams extends PaginationParams {
  category?: string;
}

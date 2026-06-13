// Vendor Service DTOs — mirrors the strike-gateway /api/stores/* contracts.

import type { PaginationParams } from './api';

export interface Store {
  id: string;
  name: string;
  address: string;
  distance: number;     // km from user
  rating: number;       // 0–5
  reviewCount: number;
  isTopRated: boolean;
  imageUrl: string | null;
  tags: string[];       // e.g. ['Breakfast', 'Meals', 'Curries']
  startingPrice: number;
  isSaved: boolean;
}

export interface StoreDetail extends Store {
  mapThumbnailUrl: string | null;
  latitude: number;
  longitude: number;
  description: string | null;
  testimonials: Testimonial[];
}

export interface Testimonial {
  id: string;
  authorName: string;
  text: string;
  rating: number;
}

// --- Menu types ---
// These represent a FULL store menu (discovery context).
// For redemption-eligible menu, see EligibleMenu in subscription.ts.

export interface MenuCategory {
  id: string;
  name: string; // 'Breakfast', 'Curries', 'Meals', etc.
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

// --- Query param types ---

export interface NearbyStoresParams extends PaginationParams {
  latitude: number;
  longitude: number;
  radius?: number; // km, default varies by backend
  category?: string;
  sort?: 'nearby' | 'top-rated' | 'offer' | 'low-price';
}

export interface SearchStoresParams {
  query: string;
  latitude?: number;
  longitude?: number;
}

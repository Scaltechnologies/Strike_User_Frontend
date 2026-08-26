import { Linking, Platform } from 'react-native';

/**
 * Formats a backend-provided distanceKm into a human-readable string.
 * Uses the backend value directly — never recalculates.
 *
 * 0.25  → "250 m away"
 * 0.85  → "850 m away"
 * 1.26  → "1.3 km away"
 * 4.83  → "4.8 km away"
 * 12.01 → "12.0 km away"
 */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  return `${km.toFixed(1)} km away`;
}

/**
 * Compact distance format for badges/chips — same rounding as formatDistance
 * but without the trailing "away", for contexts where a label already
 * implies location (e.g. a distance badge overlaid on a card image).
 *
 * 0.25 → "250 m", 0.9 → "900 m", 1.26 → "1.2 km", 4.83 → "4.8 km"
 */
export function formatDistanceCompact(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle distance between two coordinates, in kilometers.
 * Used to compute a store's distance client-side when the backend hasn't
 * already supplied one (e.g. the plain store list, unlike /nearby/me,
 * carries no distanceKm) — real store lat/lng and real user coords in,
 * nothing invented.
 */
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Opens the device Maps app and starts turn-by-turn navigation to
 * the given store coordinates.
 *
 * Android
 *   Primary  : google.navigation:q=<lat>,<lng>   → Google Maps nav mode
 *   Fallback : https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>
 *
 * iOS
 *   Primary  : maps://maps.apple.com/?daddr=<lat>,<lng>  → Apple Maps
 *   Fallback : https://maps.apple.com/?daddr=<lat>,<lng>
 *
 * Call sites must only invoke this when lat/lng are non-null.
 * No confirmation dialog is shown — navigation starts immediately.
 */
export function openDirections(lat: number, lng: number): void {
  const primary = Platform.select({
    android: `google.navigation:q=${lat},${lng}`,
    ios:     `maps://maps.apple.com/?daddr=${lat},${lng}`,
  })!;
  const fallback = Platform.select({
    android: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    ios:     `https://maps.apple.com/?daddr=${lat},${lng}`,
  })!;

  void Linking.canOpenURL(primary).then((ok) =>
    Linking.openURL(ok ? primary : fallback),
  );
}

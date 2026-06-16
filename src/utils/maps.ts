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

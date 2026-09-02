// Places API (New) — plain REST calls (no native SDK), matching the same
// fetch()-based approach the app already uses for Nominatim. This avoids
// adding a native map/places dependency to an app on a brand-new Expo SDK
// (see AGENTS.md) purely to power a text search + place-details lookup.
import { Platform } from 'react-native';
import ENV from '@/config/env';

export interface PlaceSuggestion {
  placeId: string;
  name: string;
  secondaryText: string | null;
  // True when Google classified this as an area/division (locality, admin
  // area, sublocality, postal town, neighbourhood, ...) rather than a POI/
  // business — used only to bias ranking, never to discard a result (see
  // GOOGLE_PLACES_INTEGRATION notes on not over-filtering).
  isRegion: boolean;
}

export interface PlaceDetails {
  latitude: number;
  longitude: number;
  name: string;
  formattedAddress: string;
}

// Thrown for 401/403 — a misconfigured/restricted/missing key. Distinct from
// a generic network/5xx failure so the caller can surface a clear
// developer-facing log without silently masking a setup problem behind a
// Nominatim fallback (see index.tsx's searchArea orchestration).
export class GooglePlacesConfigError extends Error {}

// Google's own "(regions)" type collection ("areas or divisions") is the
// documented, exclusive way to restrict Autocomplete to places rather than
// businesses — but it can't be combined with other type filters, and we
// can't verify offline whether it's too narrow for every Indian admin level
// (village/mandal/taluk) without a live API key. So instead of restricting
// the request, we ask for everything and bias ranking client-side — the same
// low-risk, previously-verified approach used for the Nominatim fix. Types
// per Google's Place Types reference (Table B "Geographical Areas").
const REGION_TYPES = new Set([
  'locality', 'sublocality', 'sublocality_level_1', 'sublocality_level_2',
  'sublocality_level_3', 'sublocality_level_4', 'sublocality_level_5',
  'neighborhood', 'administrative_area_level_1', 'administrative_area_level_2',
  'administrative_area_level_3', 'administrative_area_level_4',
  'administrative_area_level_5', 'administrative_area_level_6',
  'administrative_area_level_7', 'postal_town', 'colloquial_area',
  'country', 'political', 'postal_code',
]);

function assertApiKey(): string {
  if (!ENV.GOOGLE_PLACES_API_KEY) {
    throw new GooglePlacesConfigError(
      'EXPO_PUBLIC_GOOGLE_PLACES_API_KEY is not set — Google location search is disabled.',
    );
  }
  return ENV.GOOGLE_PLACES_API_KEY;
}

// Application-restriction headers Google checks against a key restricted to
// this app in Cloud Console (see api-security-best-practices — REST callers
// must send these explicitly; a native SDK would attach them automatically).
// Harmless no-ops against an unrestricted or API-only-restricted key.
function appRestrictionHeaders(): Record<string, string> {
  if (Platform.OS === 'ios') {
    return { 'X-Ios-Bundle-Identifier': ENV.APP_IDENTIFIER };
  }
  if (Platform.OS === 'android') {
    const headers: Record<string, string> = { 'X-Android-Package': ENV.APP_IDENTIFIER };
    if (ENV.GOOGLE_ANDROID_CERT_SHA1) headers['X-Android-Cert'] = ENV.GOOGLE_ANDROID_CERT_SHA1;
    return headers;
  }
  return {};
}

function classifyFailure(status: number): never {
  if (status === 401 || status === 403) {
    throw new GooglePlacesConfigError(`Google Places request rejected (${status}) — check API key/restrictions`);
  }
  throw new Error(`Google Places request failed: ${status}`);
}

export async function autocompletePlaces(
  input: string,
  sessionToken: string,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const apiKey = assertApiKey();

  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'suggestions.placePrediction.placeId,' +
        'suggestions.placePrediction.text,' +
        'suggestions.placePrediction.structuredFormat,' +
        'suggestions.placePrediction.types',
      ...appRestrictionHeaders(),
    },
    body: JSON.stringify({
      input,
      languageCode: 'en',
      regionCode: 'in',
      includedRegionCodes: ['in'],
      sessionToken,
    }),
  });

  if (!res.ok) classifyFailure(res.status);

  const data = (await res.json()) as {
    suggestions?: {
      placePrediction?: {
        placeId: string;
        text?: { text?: string };
        structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
        types?: string[];
      };
    }[];
  };

  return (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({
      placeId: p.placeId,
      name: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
      secondaryText: p.structuredFormat?.secondaryText?.text ?? null,
      isRegion: (p.types ?? []).some((t) => REGION_TYPES.has(t)),
    }))
    .filter((s) => s.name.length > 0)
    // Region-shaped results first (an actual place to browse), Google's own
    // relevance order preserved within each group — not a replacement for
    // Google's ranking, just a bias against a same-named business/POI.
    .sort((a, b) => Number(b.isRegion) - Number(a.isRegion));
}

export async function getPlaceDetails(
  placeId: string,
  sessionToken: string,
  signal?: AbortSignal,
): Promise<PlaceDetails> {
  const apiKey = assertApiKey();

  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}`;
  const res = await fetch(url, {
    signal,
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'displayName,formattedAddress,location',
      ...appRestrictionHeaders(),
    },
  });

  if (!res.ok) classifyFailure(res.status);

  const data = (await res.json()) as {
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
  };

  const { latitude, longitude } = data.location ?? {};
  if (latitude == null || longitude == null) {
    throw new Error('Google Place Details response did not include a location');
  }

  return {
    latitude,
    longitude,
    name: data.displayName?.text ?? '',
    formattedAddress: data.formattedAddress ?? '',
  };
}

// Bundles one Autocomplete "typing session" + the Place Details call that
// ends it into a single Google billing session (materially cheaper than
// per-request pricing) — regenerate per search session, not per keystroke.
export function generateSessionToken(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bell,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Navigation,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  UtensilsCrossed,
  X,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { formatDistanceCompact, haversineDistanceKm, openDirections } from '@/utils/maps';
import { useMediaSource, logMediaError } from '@/utils/media';
import { tapLight, tapSelect } from '@/utils/haptics';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedHomeBackground } from '@/components/home/AnimatedHomeBackground';
import { BannerCarousel } from '@/components/home/BannerCarousel';
import { CategoriesRow } from '@/components/home/CategoriesRow';
import { PurchasedCardsCarousel } from '@/components/home/PurchasedCardsCarousel';
import { PressableScale } from '@/components/ui/PressableScale';
import { FadeInView } from '@/components/ui/FadeInView';
import { KeyboardAvoidingScreen } from '@/components/ui/KeyboardAvoidingScreen';
import { useLocation } from '@/hooks/useLocation';
import { useUnreadNotificationCount } from '@/hooks/useNotificationInbox';
import {
  useAllStores, useInvalidateStores, useNearbyStores, useSearchStores, useStoreMenu, useStoresByCategory,
} from '@/hooks/useStores';
import { useLowestCardPricesByStores } from '@/hooks/useCards';
import { ROUTES } from '@/constants/routes';
import { DEFAULT_RADIUS_KM } from '@/constants/api';
import { ManropeWeights } from '@/constants/theme';
import type { RecentLocation } from '@/services/storageService';
import { storageService } from '@/services/storageService';
import {
  autocompletePlaces, getPlaceDetails, generateSessionToken, GooglePlacesConfigError,
} from '@/services/googlePlacesService';
import { useAppStore } from '@/store/appStore';
import { isStoreOpenNow } from '@/utils/storeTiming';
import type { Store } from '@/types/store';

// ─── Design Tokens ─────────────────────────────────────────────────────────────

const C = {
  // Brand
  accent:       '#D63527',
  accentSoft:   '#FEF2EF',
  accentMid:    '#F5C5BB',
  accentDeep:   '#B02A1E',

  // Surfaces
  bg:           '#F2F2F7',
  surface:      '#FFFFFF',
  surfaceRaised:'#FAFAFA',

  // Borders & Dividers
  border:       '#E5E5EA',
  divider:      '#F0F0F5',

  // Text
  primary:      '#0D0D0D',
  secondary:    '#5C5C5C',
  muted:        '#AEAEB2',
  placeholder:  '#C7C7CC',

  // Semantic
  success:      '#30D158',
  successBg:    '#E8FAF0',
  successText:  '#1A7A35',
  danger:       '#FF3B30',
  dangerBg:     '#FFF0EE',
  dangerText:   '#C0261A',
  warning:      '#FF9F0A',
  warningBg:    '#FFF4E0',

  // Utility
  skeleton:     '#E8E8ED',
  blue:         '#2563EB',
  blueBg:       '#EEF4FF',
  green:        '#16A34A',
  greenBg:      '#F0FDF4',
  overlay:      'rgba(0,0,0,0.42)',
} as const;

// Spacing scale — every section/card/chip on this screen sizes its padding
// and gaps off this instead of picking its own number. `page` is the one
// horizontal margin the header, search bar, filter bar and section content
// all share, which is what keeps everything visually aligned into one
// column instead of drifting a few px left/right of each other.
const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  page: 20,
} as const;

// Corner-radius scale. `control` is the shared radius for tap targets that
// read as "a button/input" (search bar, chips); `surface` is the shared
// radius for the larger content surfaces (restaurant cards); `pill` is for
// fully-rounded badges/tags.
const RADIUS = {
  sm: 8,
  md: 14,
  control: 18,
  surface: 22,
  pill: 999,
} as const;

// ─── Typography scale ──────────────────────────────────────────────────────
// One named style per text ROLE, not per component — a restaurant-card
// title and a section heading are the same role ("title" in this row) and
// now share one definition, so they can never silently drift apart again.
// These are exactly the values already tuned in place; this only gives
// that tuning a name so nothing on this screen picks its own font size in
// isolation going forward.
const TYPE = {
  // Tiny uppercase eyebrow — "GOOD MORNING" above the location.
  eyebrow: {
    fontSize: 12,
    fontFamily: ManropeWeights.semiBold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  // The one hero line on the screen — the current location name.
  heroTitle: {
    fontSize: 21,
    fontFamily: ManropeWeights.extraBold,
    letterSpacing: -0.6,
    lineHeight: 25,
  },
  // Section headings — 18–20px/semibold per the app's typography spec.
  title: {
    fontSize: 19,
    lineHeight: 24,
    fontFamily: ManropeWeights.semiBold,
    letterSpacing: -0.3,
  },
  body: {
    fontSize: 12.5,
    fontFamily: ManropeWeights.regular,
  },
  secondary: {
    fontSize: 12,
    fontFamily: ManropeWeights.regular,
  },
  price: {
    fontSize: 20,
    fontFamily: ManropeWeights.extraBold,
    letterSpacing: -0.4,
  },
  priceUnit: {
    fontSize: 13,
    fontFamily: ManropeWeights.semiBold,
  },
  badge: {
    fontSize: 11.5,
    fontFamily: ManropeWeights.bold,
  },
  categoryLabel: {
    fontSize: 10.5,
    fontFamily: ManropeWeights.semiBold,
    letterSpacing: 0.2,
    textTransform: 'capitalize',
  },
  buttonText: {
    fontSize: 12.5,
    fontFamily: ManropeWeights.bold,
    letterSpacing: 0.1,
  },
  // Small uppercase metadata — "STARTING FROM", price captions.
  metaSmall: {
    fontSize: 10.5,
    fontFamily: ManropeWeights.semiBold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
} as const;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmtPrice(n: number): string {
  return n % 1 === 0 ? `₹${n}` : `₹${n.toFixed(2)}`;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getStoreFallbackColor(name: string): string {
  const palette = [
    '#EEF2FF', '#F0FDF4', '#FFF7ED', '#FDF4FF', '#F0F9FF',
    '#FEFCE8', '#FFF1F2',
  ];
  const idx = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length;
  return palette[idx];
}

function getStoreInitialColor(name: string): string {
  const palette = [
    '#818CF8', '#34D399', '#FB923C', '#C084FC', '#38BDF8',
    '#FACC15', '#FB7185',
  ];
  const idx = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length;
  return palette[idx];
}

type SortMode = 'default' | 'nearMe' | 'priceLowHigh' | 'priceHighLow';

// Open stores first, always. Beyond that, only the active sort mode moves
// cards: 'nearMe' sorts by distance, price modes sort by lowest price, and
// 'default' does nothing further — ties keep their incoming (recommended)
// order since Array.prototype.sort is stable. Previously this fell through
// to a distance tie-break unconditionally, which silently overrode the
// recommended ordering the moment any store carried a distanceKm.
function sortStores(stores: Store[], mode: SortMode, lowestPrices?: Record<number, number>): Store[] {
  return [...stores].sort((a, b) => {
    const aOpen = isStoreOpenNow(a) ? 0 : 1;
    const bOpen = isStoreOpenNow(b) ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;

    if (mode === 'priceLowHigh' || mode === 'priceHighLow') {
      const aPrice = lowestPrices?.[a.id];
      const bPrice = lowestPrices?.[b.id];
      if (aPrice == null && bPrice != null) return 1;
      if (aPrice != null && bPrice == null) return -1;
      if (aPrice != null && bPrice != null && aPrice !== bPrice) {
        return mode === 'priceLowHigh' ? aPrice - bPrice : bPrice - aPrice;
      }
      return 0;
    }

    if (mode === 'nearMe') {
      const aDist = a.distanceKm ?? Number.POSITIVE_INFINITY;
      const bDist = b.distanceKm ?? Number.POSITIVE_INFINITY;
      return aDist - bDist;
    }

    return 0;
  });
}

// The store-list heading reflects whatever sort is actually active instead
// of a permanent "Nearby"/"All stores" label — real state, not invented
// ranking. There is no rating/popularity data to sort by, so the unfiltered
// default is presented as "Recommended for you" using the existing
// recommended ordering, never a fake rating-based claim.
function getStoreSectionCopy(mode: SortMode): { title: string; subtitle?: string } {
  switch (mode) {
    case 'nearMe':
      return { title: 'Stores near you', subtitle: 'Sorted by distance' };
    case 'priceLowHigh':
      return { title: 'Stores near you', subtitle: 'Sorted by price: low to high' };
    case 'priceHighLow':
      return { title: 'Stores near you', subtitle: 'Sorted by price: high to low' };
    default:
      return { title: 'Recommended for you' };
  }
}

// ─── Area Search (Nominatim) ───────────────────────────────────────────────────

interface GeoResult {
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
}

// Settlement-shaped Nominatim types/addresstypes — villages, hamlets, towns,
// cities, mandal/district boundaries, neighbourhoods. Verified empirically
// (see LOCATION_SEARCH_AUDIT.md follow-up) that Nominatim's raw top hit for
// a small hamlet's name can be an unrelated POI located there (a school, an
// office) rather than the hamlet itself — this set is used to bias real
// places ahead of those, without attempting any fuzzier/heavier ranking.
const SETTLEMENT_TYPES = new Set([
  'village', 'hamlet', 'isolated_dwelling', 'town', 'city', 'municipality',
  'suburb', 'neighbourhood', 'quarter', 'city_district', 'county',
  'state_district', 'administrative', 'locality',
]);

// Throws on any provider/network failure instead of swallowing it — callers
// must distinguish "the provider failed" from "the provider returned zero
// matches" (an empty array here means the latter, unambiguously — Nominatim
// itself has no data for that locality; see LOCATION_SEARCH_AUDIT.md for why
// that can legitimately happen for smaller Indian villages/hamlets that
// simply aren't mapped in OpenStreetMap yet — no request-shape change fixes
// a real data gap in the provider).
async function searchAreaNominatim(query: string): Promise<GeoResult[]> {
  const url =
    `https://nominatim.openstreetmap.org/search` +
    `?format=json` +
    `&q=${encodeURIComponent(query.trim())}` +
    `&countrycodes=in` +
    `&limit=10` +
    `&addressdetails=1` +
    `&dedupe=1` +
    `&accept-language=en` +
    `&email=inquire.scalatechnologies%40gmail.com`;

  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      // Nominatim's usage policy requires the calling application to be
      // identifiable — an unidentified client risks silent throttling.
      'User-Agent': 'StrikeUserApp/1.0 (inquire.scalatechnologies@gmail.com)',
    },
  });
  if (!res.ok) {
    throw new Error(`Nominatim request failed: ${res.status}`);
  }

  const data = (await res.json()) as Array<{
      name?: string;
      display_name: string;
      lat: string;
      lon: string;
      type?: string;
      addresstype?: string;
      importance?: number;
      address?: {
        neighbourhood?: string;
        quarter?: string;
        suburb?: string;
        hamlet?: string;
        locality?: string;
        municipality?: string;
        city_district?: string;
        county?: string;
        city?: string;
        town?: string;
        village?: string;
        state?: string;
      };
    }>;

    return data
      // Settlement-shaped results first (a village/town/hamlet the user is
      // plausibly setting as their location), Nominatim's own `importance`
      // as the tiebreaker within each group — not a replacement for its
      // relevance scoring, just a bias against an unrelated POI (e.g. a
      // school or shop sharing the searched name) outranking the real place.
      .sort((x, y) => {
        const xSettlement = SETTLEMENT_TYPES.has(x.addresstype ?? x.type ?? '') ? 1 : 0;
        const ySettlement = SETTLEMENT_TYPES.has(y.addresstype ?? y.type ?? '') ? 1 : 0;
        if (xSettlement !== ySettlement) return ySettlement - xSettlement;
        return (y.importance ?? 0) - (x.importance ?? 0);
      })
      .map((item) => {
        const a = item.address;
        // Prefer Nominatim's own matched name (the literal name it found) —
        // the address.* chain is only a fallback for the rare item missing
        // it, reconstructing a label from whichever admin-level field exists.
        const name =
          item.name ??
          a?.neighbourhood ?? a?.quarter ?? a?.suburb ?? a?.hamlet ??
          a?.village ?? a?.town ?? a?.city ??
          a?.locality ?? a?.municipality ?? a?.city_district ?? a?.county ??
          item.display_name.split(',')[0];
        const cityOrTown = a?.city ?? a?.town ?? a?.municipality ?? a?.county;
        const parts = [name, cityOrTown, a?.state].filter(Boolean);
        const displayName = parts.length > 1 ? parts.join(', ') : item.display_name;
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        if (isNaN(lat) || isNaN(lon)) return null;
        return {
          name: name.trim(),
          displayName: displayName.trim(),
          latitude: lat,
          longitude: lon,
        };
      })
      .filter((r): r is GeoResult => r !== null && r.name.length > 0);
}

// ─── Area Search (Google Places — primary) ─────────────────────────────────────
//
// Google Places (New) replaces Nominatim as the primary Set Location search
// provider — it has meaningfully better coverage of small Indian villages/
// hamlets (see LOCATION_SEARCH_AUDIT.md's "Yellareddygudem" case, where
// Nominatim/OSM has no place node at all). Nominatim is kept as a fallback
// for a genuine Google network/5xx failure only — never for a config error
// (a bad/missing key must surface loudly, not be silently masked by a
// degraded fallback) and never for a legitimate zero-result response (Google
// already tried; Nominatim's coverage is a strict subset of what it just
// searched, so retrying there just adds latency for no real chance of help).
//
// A suggestion from Autocomplete has no lat/lng yet — Google requires a
// separate Place Details call (by placeId) once the user actually picks one,
// which is why this list item type carries a placeId instead of coordinates
// for the 'google' source, unlike the already-resolved 'nominatim' source.
interface LocationSearchResult {
  key: string;
  name: string;
  displayName: string;
  source: 'google' | 'nominatim';
  placeId?: string;
  latitude?: number;
  longitude?: number;
}

async function searchAreaGoogle(
  query: string,
  sessionToken: string,
  signal?: AbortSignal,
): Promise<LocationSearchResult[]> {
  const suggestions = await autocompletePlaces(query, sessionToken, signal);
  return suggestions.map((s) => ({
    key: s.placeId,
    name: s.name,
    displayName: s.secondaryText ? `${s.name}, ${s.secondaryText}` : s.name,
    source: 'google' as const,
    placeId: s.placeId,
  }));
}

async function searchAreaNominatimFallback(query: string): Promise<LocationSearchResult[]> {
  const results = await searchAreaNominatim(query);
  return results.map((r) => ({
    key: `${r.latitude},${r.longitude}`,
    name: r.name,
    displayName: r.displayName,
    source: 'nominatim' as const,
    latitude: r.latitude,
    longitude: r.longitude,
  }));
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

async function searchArea(
  query: string,
  sessionToken: string,
  signal?: AbortSignal,
): Promise<LocationSearchResult[]> {
  try {
    return await searchAreaGoogle(query, sessionToken, signal);
  } catch (err) {
    if (isAbortError(err)) throw err;
    if (err instanceof GooglePlacesConfigError) {
      console.error('[LocationSearch] Google Places misconfigured — not falling back to Nominatim:', err.message);
      throw err;
    }
    console.warn('[LocationSearch] Google Places request failed, falling back to Nominatim:', err);
    return await searchAreaNominatimFallback(query);
  }
}

// ─── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonPulse({ width, height, style, radius = 8 }: {
  width?: number | string;
  height: number;
  style?: object;
  radius?: number;
}) {
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.25,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.6,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { backgroundColor: C.skeleton, borderRadius: radius, height, opacity },
        width != null ? { width } : { flex: 1 },
        style,
      ]}
    />
  );
}

function StoreCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={[styles.cardImageWrap, { overflow: 'hidden' }]}>
        <SkeletonPulse height={200} radius={0} style={{ width: '100%' }} />
        <View style={[styles.cardImageCategoryRow, { bottom: 14 }]}>
          <SkeletonPulse width={64} height={26} radius={13} />
          <SkeletonPulse width={72} height={26} radius={13} />
        </View>
      </View>
      <View style={styles.cardBody}>
        <SkeletonPulse height={20} width="65%" style={{ marginBottom: 8 }} />
        <SkeletonPulse height={13} width="45%" style={{ marginBottom: 16 }} />
        <SkeletonPulse height={1} width="100%" style={{ marginBottom: 14 }} />
        <SkeletonPulse height={11} width="30%" style={{ marginBottom: 6 }} />
        <SkeletonPulse height={22} width="35%" />
      </View>
    </View>
  );
}

// ─── Store Card ────────────────────────────────────────────────────────────────

function StoreCard({ store, index = 0, lowestPrice }: { store: Store; index?: number; lowestPrice?: number }) {
  const router = useRouter();
  const isOpen = isStoreOpenNow(store);
  const distance = store.distanceKm != null ? formatDistanceCompact(store.distanceKm) : null;
  const initial = store.name.charAt(0).toUpperCase();
  const fallbackBg = getStoreFallbackColor(store.name);
  const initialColor = getStoreInitialColor(store.name);
  const [imgFailed, setImgFailed] = useState(false);
  const thumbSource = useMediaSource(store.logoUrl);
  const showPhoto = !!thumbSource && !imgFailed;

  // A failed-load flag has to be scoped to WHICH image it's about — without
  // this, a card that once failed to load (e.g. a transient network blip)
  // stays permanently blank even after `store.logoUrl` changes to a URL that
  // would load fine (a vendor updating their photo, or this same card
  // re-appearing under a different category/sort filter with fresh data).
  useEffect(() => {
    setImgFailed(false);
  }, [thumbSource?.uri]);

  // Vendor-defined menu categories (e.g. "Mains", "Beverages") — falls back
  // to the store's single business category if the vendor hasn't set up a
  // menu yet, so a card never renders with no tag at all.
  const { data: menuCategories, isLoading: categoriesLoading } = useStoreMenu(store.id);
  const categoryNames = menuCategories && menuCategories.length > 0
    ? menuCategories.map((c) => c.name)
    : null;

  const handleDirections = useCallback(() => {
    if (store.latitude == null || store.longitude == null) return;
    tapLight();
    openDirections(store.latitude, store.longitude);
  }, [store.latitude, store.longitude]);

  return (
    <FadeInView delay={index * 60} style={styles.cardWrapper}>
      <PressableScale
        style={[styles.card, !isOpen && styles.cardClosed]}
        onPress={() => router.push(`/store/${store.id}` as never)}
      >
        {/* ── Hero image — full card width, real distance/directions
            overlaid on it, not a separate row/column ────────────────── */}
        <View style={styles.cardImageWrap}>
          {showPhoto && thumbSource ? (
            <Image
              source={thumbSource}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={200}
              onError={(e) => {
                logMediaError('store card image', thumbSource.uri, e.error);
                setImgFailed(true);
              }}
            />
          ) : (
            <View style={[styles.cardImageFallback, { backgroundColor: fallbackBg }]}>
              <Text style={[styles.cardImageFallbackInitial, { color: initialColor }]}>{initial}</Text>
            </View>
          )}
          {distance != null && (
            <Pressable
              style={({ pressed }) => [styles.cardImageDistanceBadge, pressed && { opacity: 0.7 }]}
              onPress={handleDirections}
              hitSlop={8}
            >
              <Navigation size={11} color={C.accent} strokeWidth={2.4} />
              <Text style={styles.cardImageDistanceText}>{distance}</Text>
            </Pressable>
          )}

          {/* A subtle scrim, only behind the category row — just enough to
              guarantee the pills stay legible over whatever the photo looks
              like, not a decorative wash over the whole image. */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.16)']}
            style={styles.cardImageScrim}
            pointerEvents="none"
          />
          <View style={styles.cardImageCategoryRow}>
            {categoriesLoading ? (
              <>
                <SkeletonPulse width={64} height={26} radius={13} />
                <SkeletonPulse width={72} height={26} radius={13} />
              </>
            ) : categoryNames ? (
              <>
                {categoryNames.slice(0, 3).map((name) => (
                  <View key={name} style={styles.categoryTag}>
                    <Text style={styles.categoryTagText} numberOfLines={1}>{name}</Text>
                  </View>
                ))}
                {categoryNames.length > 3 && (
                  <View style={[styles.categoryTag, styles.categoryTagMore]}>
                    <Text style={[styles.categoryTagText, styles.categoryTagMoreText]}>
                      +{categoryNames.length - 3}
                    </Text>
                  </View>
                )}
              </>
            ) : (
              <View style={styles.categoryTag}>
                <Text style={styles.categoryTagText}>{store.category}</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Body — name, address, then price below a divider, in
            generous vertical rhythm ────────────────────────────────── */}
        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={2}>{store.name}</Text>

          {store.address ? (
            <View style={styles.cardAddressRow}>
              <MapPin size={13} color="#6B7280" strokeWidth={2.2} />
              <Text style={styles.cardAddress} numberOfLines={1}>{store.address}</Text>
            </View>
          ) : null}

          {lowestPrice != null && (
            <>
              <View style={styles.cardDivider} />
              <View style={styles.priceBlock}>
                <Text style={styles.priceLabel}>Starting from</Text>
                <Text style={styles.priceValue} numberOfLines={1}>
                  {fmtPrice(lowestPrice)}
                  <Text style={styles.priceUnit}> / card</Text>
                </Text>
              </View>
            </>
          )}
        </View>
      </PressableScale>
    </FadeInView>
  );
}

// ─── Filter Chips ──────────────────────────────────────────────────────────────
//
// Each chip has exactly ONE job:
//   Filters   → opens the complete sheet (Sort by / Availability / Category)
//   Near Me   → directly toggles nearest-first sorting, no popover
//   Price     → opens a PRICE-ONLY popover (never the complete sheet)
//   Open Now  → directly toggles the open-now attribute filter, no popover

function FilterChipsBar({
  categoryCount,
  onOpenFilters,
  openNowOnly,
  onToggleOpenNow,
  sortMode,
  onToggleNearMe,
  onOpenPriceSort,
  hasActiveFilters,
  onClear,
}: {
  categoryCount: number;
  onOpenFilters: () => void;
  openNowOnly: boolean;
  onToggleOpenNow: () => void;
  sortMode: SortMode;
  onToggleNearMe: () => void;
  onOpenPriceSort: () => void;
  hasActiveFilters: boolean;
  onClear: () => void;
}) {
  const nearMeActive = sortMode === 'nearMe';
  const priceActive = sortMode === 'priceLowHigh' || sortMode === 'priceHighLow';
  const PriceIcon = sortMode === 'priceLowHigh' ? ArrowUp : sortMode === 'priceHighLow' ? ArrowDown : ArrowUpDown;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.filterBar}
      contentContainerStyle={styles.filterBarContent}
    >
      <Pressable
        style={[styles.filterChip, categoryCount > 0 && styles.filterChipActive]}
        onPress={() => { tapSelect(); onOpenFilters(); }}
        hitSlop={4}
      >
        <SlidersHorizontal size={14} color={categoryCount > 0 ? '#FFFFFF' : C.secondary} strokeWidth={2.3} />
        <Text style={[styles.filterChipText, categoryCount > 0 && styles.filterChipTextActive]}>
          {categoryCount > 0 ? `Filters · ${categoryCount}` : 'Filters'}
        </Text>
      </Pressable>

      <Pressable
        style={[styles.filterChip, nearMeActive && styles.filterChipActive]}
        onPress={() => { tapSelect(); onToggleNearMe(); }}
        hitSlop={4}
      >
        <Navigation size={14} color={nearMeActive ? '#FFFFFF' : C.secondary} strokeWidth={2.3} />
        <Text style={[styles.filterChipText, nearMeActive && styles.filterChipTextActive]}>
          Near Me
        </Text>
      </Pressable>

      {/* Opens a price-only popover — never the complete Filters sheet. */}
      <Pressable
        style={[styles.filterChip, priceActive && styles.filterChipActive]}
        onPress={() => { tapSelect(); onOpenPriceSort(); }}
        hitSlop={4}
      >
        <PriceIcon size={14} color={priceActive ? '#FFFFFF' : C.secondary} strokeWidth={2.3} />
        <Text style={[styles.filterChipText, priceActive && styles.filterChipTextActive]}>
          {sortMode === 'priceLowHigh' ? 'Low to High' : sortMode === 'priceHighLow' ? 'High to Low' : 'Price'}
        </Text>
      </Pressable>

      <Pressable
        style={[styles.filterChip, openNowOnly && styles.filterChipActive]}
        onPress={() => { tapSelect(); onToggleOpenNow(); }}
        hitSlop={4}
      >
        <Clock size={14} color={openNowOnly ? '#FFFFFF' : C.secondary} strokeWidth={2.3} />
        <Text style={[styles.filterChipText, openNowOnly && styles.filterChipTextActive]}>
          Open Now
        </Text>
      </Pressable>

      {hasActiveFilters && (
        <Pressable style={styles.filterClearChip} onPress={() => { tapSelect(); onClear(); }} hitSlop={4}>
          <X size={12} color={C.accent} strokeWidth={2.6} />
          <Text style={styles.filterClearChipText}>Clear</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

// ─── Price Sort Sheet (Price chip's OWN popover — price choices only) ─────────

function PriceSortSheet({
  visible,
  onClose,
  sortMode,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  sortMode: SortMode;
  onSelect: (mode: SortMode) => void;
}) {
  const sheetTranslateY = useRef(new Animated.Value(400)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(sheetTranslateY, {
          toValue: 0, useNativeDriver: true, damping: 22, stiffness: 280, mass: 0.8,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1, duration: 260, easing: Easing.out(Easing.ease), useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(sheetTranslateY, {
          toValue: 400, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, sheetTranslateY, backdropOpacity]);

  const handleSelect = (mode: SortMode) => {
    tapSelect();
    onSelect(mode);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.filterSheetWrap}>
        <Animated.View style={[styles.sheetBackdrop, { opacity: backdropOpacity }]} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View style={[styles.filterSheet, { transform: [{ translateY: sheetTranslateY }], paddingBottom: 28 }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.filterSheetHeader}>
            <Text style={styles.filterSheetTitle}>Sort by Price</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.filterSheetCloseBtn}>
              <X size={16} color={C.secondary} strokeWidth={2.4} />
            </Pressable>
          </View>

          <RadioRow label="Lowest to Highest" selected={sortMode === 'priceLowHigh'} onPress={() => handleSelect('priceLowHigh')} />
          <RadioRow label="Highest to Lowest" selected={sortMode === 'priceHighLow'} onPress={() => handleSelect('priceHighLow')} />
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Filters Sheet (Sort + Availability + Category, with Select All) ──────────

function RadioRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.filterOptionRow} onPress={() => { tapSelect(); onPress(); }}>
      <View style={[styles.radioCircle, selected && styles.radioCircleActive]}>
        {selected && <View style={styles.radioDot} />}
      </View>
      <Text style={styles.filterOptionLabel}>{label}</Text>
    </Pressable>
  );
}

function CheckRow({ label, checked, onPress }: { label: string; checked: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.filterOptionRow} onPress={() => { tapSelect(); onPress(); }}>
      <View style={[styles.checkBox, checked && styles.checkBoxActive]}>
        {checked && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
      </View>
      <Text style={styles.filterOptionLabel}>{label}</Text>
    </Pressable>
  );
}

function FiltersSheet({
  visible,
  onClose,
  categories,
  sortMode,
  openNowOnly,
  selectedCategories,
  onApply,
  onClearAll,
}: {
  visible: boolean;
  onClose: () => void;
  categories: string[];
  sortMode: SortMode;
  openNowOnly: boolean;
  selectedCategories: string[];
  onApply: (sort: SortMode, openNow: boolean, cats: string[]) => void;
  onClearAll: () => void;
}) {
  const [draftSort, setDraftSort] = useState<SortMode>(sortMode);
  const [draftOpenNow, setDraftOpenNow] = useState(openNowOnly);
  const [draftCategories, setDraftCategories] = useState<string[]>(selectedCategories);

  const sheetTranslateY = useRef(new Animated.Value(600)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setDraftSort(sortMode);
      setDraftOpenNow(openNowOnly);
      setDraftCategories(selectedCategories);
      Animated.parallel([
        Animated.spring(sheetTranslateY, {
          toValue: 0, useNativeDriver: true, damping: 22, stiffness: 280, mass: 0.8,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1, duration: 260, easing: Easing.out(Easing.ease), useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(sheetTranslateY, {
          toValue: 600, duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const allCategoriesSelected = draftCategories.length === 0;

  const handleToggleCategory = useCallback((cat: string) => {
    setDraftCategories((prev) => {
      if (prev.length === 0) return [cat];
      if (prev.includes(cat)) return prev.filter((c) => c !== cat);
      return [...prev, cat];
    });
  }, []);

  const handleApply = () => {
    tapSelect();
    onApply(draftSort, draftOpenNow, draftCategories);
  };

  const handleClearAll = () => {
    tapSelect();
    setDraftSort('default');
    setDraftOpenNow(false);
    setDraftCategories([]);
    onClearAll();
  };

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.filterSheetWrap}>
        <Animated.View style={[styles.sheetBackdrop, { opacity: backdropOpacity }]} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View style={[styles.filterSheet, { transform: [{ translateY: sheetTranslateY }] }]}>
          <View style={styles.sheetHandle} />

          <View style={styles.filterSheetHeader}>
            <Text style={styles.filterSheetTitle}>Filters</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.filterSheetCloseBtn}>
              <X size={16} color={C.secondary} strokeWidth={2.4} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} bounces={false} style={{ maxHeight: '70%' }}>
            <Text style={styles.filterSectionLabel}>Sort by</Text>
            <RadioRow label="Recommended" selected={draftSort === 'default'} onPress={() => setDraftSort('default')} />
            <RadioRow label="Nearest" selected={draftSort === 'nearMe'} onPress={() => setDraftSort('nearMe')} />
            <RadioRow label="Price: Low to High" selected={draftSort === 'priceLowHigh'} onPress={() => setDraftSort('priceLowHigh')} />
            <RadioRow label="Price: High to Low" selected={draftSort === 'priceHighLow'} onPress={() => setDraftSort('priceHighLow')} />

            <View style={styles.filterSectionDivider} />

            <Text style={styles.filterSectionLabel}>Availability</Text>
            <CheckRow label="Open Now" checked={draftOpenNow} onPress={() => setDraftOpenNow((v) => !v)} />

            {categories.length > 0 && (
              <>
                <View style={styles.filterSectionDivider} />
                <Text style={styles.filterSectionLabel}>Category</Text>
                <CheckRow
                  label="Select All"
                  checked={allCategoriesSelected}
                  onPress={() => setDraftCategories([])}
                />
                {categories.map((cat) => (
                  <CheckRow
                    key={cat}
                    label={cat}
                    checked={allCategoriesSelected || draftCategories.includes(cat)}
                    onPress={() => handleToggleCategory(cat)}
                  />
                ))}
              </>
            )}
            <View style={{ height: 8 }} />
          </ScrollView>

          <View style={styles.filterSheetFooter}>
            <Pressable style={styles.filterClearAllBtn} onPress={handleClearAll} hitSlop={8}>
              <Text style={styles.filterClearAllBtnText}>Clear All</Text>
            </Pressable>
            <PressableScale style={styles.filterApplyBtn} onPress={handleApply}>
              <Text style={styles.filterApplyBtnText}>Apply Filters</Text>
            </PressableScale>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({ title, count, icon }: {
  title: string;
  count?: number;
  icon?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      {icon ? <View style={styles.sectionIcon}>{icon}</View> : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {count != null ? (
        <View style={styles.sectionCountPill}>
          <Text style={styles.sectionCountText}>{count}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ─── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <FadeInView>
      <View style={styles.emptyWrap}>
        <View style={styles.emptyIconWrap}>
          <Sparkles size={20} color={C.muted} strokeWidth={1.5} />
        </View>
        <Text style={styles.emptyTitle}>{title}</Text>
        {subtitle ? <Text style={styles.emptySub}>{subtitle}</Text> : null}
        {actionLabel && onAction ? (
          <PressableScale style={styles.emptyActionBtn} onPress={onAction}>
            <Text style={styles.emptyActionBtnText}>{actionLabel}</Text>
          </PressableScale>
        ) : null}
      </View>
    </FadeInView>
  );
}

// ─── Location Permission Banner ────────────────────────────────────────────────

function LocationPermissionBanner({
  status,
  onRequestPermission,
  onOpenSettings,
  onContinueWithAll,
  onRetry,
}: {
  status: string;
  onRequestPermission: () => void;
  onOpenSettings: () => void;
  onContinueWithAll: () => void;
  onRetry: () => void;
}) {
  const configs: Record<string, {
    icon: React.ReactNode;
    iconBg: string;
    title: string;
    sub: string;
    action: () => void;
    actionLabel: string;
    borderColor?: string;
  }> = {
    denied: {
      icon: <MapPin size={16} color={C.accent} strokeWidth={2} />,
      iconBg: C.accentSoft,
      title: 'Enable location',
      sub: 'Discover stores near you',
      action: onRequestPermission,
      actionLabel: 'Enable',
    },
    blocked: {
      icon: <Settings size={16} color={C.accent} strokeWidth={2} />,
      iconBg: C.accentSoft,
      title: 'Location disabled',
      sub: 'Enable in device settings',
      action: onOpenSettings,
      actionLabel: 'Settings',
    },
    error: {
      icon: <AlertCircle size={16} color={C.warning} strokeWidth={2} />,
      iconBg: C.warningBg,
      title: 'Location unavailable',
      sub: 'Could not detect GPS position',
      action: onRetry,
      actionLabel: 'Retry',
      borderColor: '#FDDCBA',
    },
  };

  const cfg = configs[status];
  if (!cfg) return null;

  return (
    <FadeInView style={{ marginHorizontal: 16, marginTop: 18 }}>
      <View style={[styles.permissionCard, cfg.borderColor ? { borderColor: cfg.borderColor } : {}]}>
        <View style={styles.permissionLeft}>
          <View style={[styles.permissionIconWrap, { backgroundColor: cfg.iconBg }]}>
            {cfg.icon}
          </View>
          <View style={styles.permissionText}>
            <Text style={styles.permissionTitle}>{cfg.title}</Text>
            <Text style={styles.permissionSub}>{cfg.sub}</Text>
          </View>
        </View>
        <View style={styles.permissionActions}>
          <PressableScale style={styles.permissionBtn} onPress={cfg.action}>
            <Text style={styles.permissionBtnText}>{cfg.actionLabel}</Text>
          </PressableScale>
          <Pressable onPress={onContinueWithAll} style={styles.permissionSkip}>
            <Text style={styles.permissionSkipText}>Skip</Text>
          </Pressable>
        </View>
      </View>
    </FadeInView>
  );
}

// ─── Active Location Sheet ─────────────────────────────────────────────────────

type SheetView = 'options' | 'search';
type SearchPhase = 'idle' | 'waiting' | 'loading' | 'done' | 'error';

function ActiveLocationSheet({
  visible,
  history,
  onClose,
  onDetect,
  onSelectHistory,
}: {
  visible: boolean;
  history: RecentLocation[];
  onClose: () => void;
  onDetect: () => void;
  onSelectHistory: (lat: number, lng: number, name: string) => void;
}) {
  const [searchFocused, setSearchFocused] = useState(false);
  const searchFocusAnim = useRef(new Animated.Value(0)).current;
  const [view, setView] = useState<SheetView>('options');
  const [searchQuery, setSearchQuery] = useState('');
  const [geoResults, setGeoResults] = useState<LocationSearchResult[]>([]);
  const [searchPhase, setSearchPhase] = useState<SearchPhase>('idle');
  // Key of the suggestion currently being resolved to lat/lng via Place
  // Details (Google results only — Nominatim results already have coords).
  const [resolvingKey, setResolvingKey] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState(false);

  const sheetTranslateY = useRef(new Animated.Value(600)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const searchInputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchGenRef = useRef(0);
  const searchAbortRef = useRef<AbortController | null>(null);
  // One Google "session" = everything from opening search to picking a
  // result (or giving up) — bundles Autocomplete + the closing Place Details
  // call into a single billing session, materially cheaper than per-request.
  const sessionTokenRef = useRef(generateSessionToken());

  // Sheet enter/exit animation
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(sheetTranslateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 22,
          stiffness: 280,
          mass: 0.8,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(sheetTranslateY, {
          toValue: 600,
          duration: 260,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setView('options');
        setSearchQuery('');
        setGeoResults([]);
        setSearchPhase('idle');
        setResolvingKey(null);
        setResolveError(false);
        searchAbortRef.current?.abort();
        sessionTokenRef.current = generateSessionToken();
      });
    }
  }, [visible]);

  useEffect(() => {
    Animated.timing(searchFocusAnim, {
      toValue: searchFocused ? 1 : 0,
      duration: 200,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false, // driving borderColor/shadowOpacity, not transform/opacity
    }).start();
  }, [searchFocused, searchFocusAnim]);

  const handleOpenSearch = useCallback(() => {
    setView('search');
    setTimeout(() => searchInputRef.current?.focus(), 200);
  }, []);

  const handleBackToOptions = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    searchGenRef.current += 1;
    searchAbortRef.current?.abort();
    setView('options');
    setSearchQuery('');
    setGeoResults([]);
    setSearchPhase('idle');
    setResolveError(false);
  }, []);

  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    setResolveError(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    searchAbortRef.current?.abort();
    if (text.trim().length < 2) {
      setGeoResults([]);
      setSearchPhase('idle');
      return;
    }
    setSearchPhase('waiting');
    debounceRef.current = setTimeout(async () => {
      const gen = ++searchGenRef.current;
      const controller = new AbortController();
      searchAbortRef.current = controller;
      setSearchPhase('loading');
      try {
        const results = await searchArea(text, sessionTokenRef.current, controller.signal);
        if (gen !== searchGenRef.current) return;
        setGeoResults(results);
        setSearchPhase('done');
      } catch (err) {
        if (gen !== searchGenRef.current || isAbortError(err)) return;
        console.log('[LocationSearch] provider error', err);
        setGeoResults([]);
        setSearchPhase('error');
      }
    }, 400);
  }, []);

  // A Google suggestion has no coordinates yet — resolve Place Details by
  // placeId first. A Nominatim (fallback) result already has them inline.
  const handleSelectResult = useCallback(
    async (r: LocationSearchResult) => {
      if (r.source === 'nominatim') {
        onSelectHistory(r.latitude!, r.longitude!, r.name);
        onClose();
        return;
      }

      setResolveError(false);
      setResolvingKey(r.key);
      try {
        const details = await getPlaceDetails(r.placeId!, sessionTokenRef.current);
        onSelectHistory(details.latitude, details.longitude, details.name || r.name);
        onClose();
      } catch (err) {
        console.error('[LocationSearch] Place Details failed:', err);
        setResolveError(true);
      } finally {
        setResolvingKey(null);
      }
    },
    [onSelectHistory, onClose],
  );

  const renderOptions = () => (
    <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
      <FadeInView translateYFrom={8}>
        <View style={styles.sheetTitleBlock}>
          <Text style={styles.sheetTitle}>Set location</Text>
          <Text style={styles.sheetSubtitle}>
            Browse stores and subscriptions in any area
          </Text>
        </View>
      </FadeInView>

      <FadeInView delay={40} translateYFrom={14}>
        <PressableScale
          style={styles.optionCard}
          onPress={() => { onDetect(); onClose(); }}
        >
          <LinearGradient colors={[C.blue, '#1D4ED8']} style={styles.optionIconGrad}>
            <Navigation size={19} color="#FFFFFF" strokeWidth={2.2} />
          </LinearGradient>
          <View style={styles.sheetOptionContent}>
            <Text style={styles.sheetOptionLabel}>Use my location</Text>
            <Text style={styles.sheetOptionSub}>Detect GPS position</Text>
          </View>
          <ChevronRight size={16} color={C.muted} strokeWidth={2} />
        </PressableScale>
      </FadeInView>

      <FadeInView delay={90} translateYFrom={14}>
        <PressableScale style={styles.optionCard} onPress={handleOpenSearch}>
          <LinearGradient colors={[C.green, '#0E7A38']} style={styles.optionIconGrad}>
            <Search size={19} color="#FFFFFF" strokeWidth={2.2} />
          </LinearGradient>
          <View style={styles.sheetOptionContent}>
            <Text style={styles.sheetOptionLabel}>Search an area</Text>
            <Text style={styles.sheetOptionSub}>Locality, landmark, or city</Text>
          </View>
          <ChevronRight size={16} color={C.muted} strokeWidth={2} />
        </PressableScale>
      </FadeInView>

      {history.length > 0 && (
        <FadeInView delay={190} translateYFrom={14} style={styles.sheetRecentSection}>
          <Text style={styles.sheetSectionLabel}>Recent</Text>
          {history.map((loc) => (
            <Pressable
              key={`${loc.latitude}-${loc.longitude}`}
              style={({ pressed }) => [
                styles.sheetRecentRow,
                pressed && { backgroundColor: C.divider },
              ]}
              onPress={() => {
                onSelectHistory(loc.latitude, loc.longitude, loc.name ?? '');
                onClose();
              }}
            >
              <View style={styles.sheetRecentIconWrap}>
                <MapPin size={13} color={C.accent} strokeWidth={2} />
              </View>
              <Text style={styles.sheetRecentName} numberOfLines={1}>{loc.name}</Text>
              <ChevronRight size={13} color={C.muted} strokeWidth={2} />
            </Pressable>
          ))}
        </FadeInView>
      )}
      <View style={{ height: 8 }} />
    </ScrollView>
  );

  const renderSearch = () => (
    <>
      <View style={styles.sheetSearchHeader}>
        <Pressable onPress={handleBackToOptions} style={styles.sheetBackBtn} hitSlop={12}>
          <ChevronLeft size={20} color={C.primary} strokeWidth={2.5} />
        </Pressable>
        <Animated.View
          style={[
            styles.sheetSearchBar,
            {
              borderColor: searchFocusAnim.interpolate({ inputRange: [0, 1], outputRange: [C.border, C.accent] }),
              shadowOpacity: searchFocusAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.16] }),
            },
          ]}
        >
          <Search size={15} color={searchFocused ? C.accent : C.muted} strokeWidth={2} />
          <TextInput
            ref={searchInputRef}
            style={styles.sheetSearchInput}
            placeholder="Locality, landmark, or city…"
            placeholderTextColor={C.placeholder}
            value={searchQuery}
            onChangeText={handleSearchChange}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            returnKeyType="search"
            autoCapitalize="words"
            autoCorrect={false}
          />
          {searchQuery.length > 0 ? (
            <Pressable
              onPress={() => {
                if (debounceRef.current) clearTimeout(debounceRef.current);
                searchGenRef.current += 1;
                searchAbortRef.current?.abort();
                setSearchQuery('');
                setGeoResults([]);
                setSearchPhase('idle');
                setResolveError(false);
              }}
              hitSlop={8}
            >
              <View style={styles.searchClearCircle}>
                <X size={10} color={C.surface} strokeWidth={3} />
              </View>
            </Pressable>
          ) : null}
        </Animated.View>
      </View>

      {resolveError ? (
        <View style={styles.sheetInlineLoading}>
          <Text style={[styles.sheetInlineLoadingText, { color: C.danger }]}>
            Couldn't get that location — try again
          </Text>
        </View>
      ) : null}

      <ScrollView
        style={styles.sheetSearchResults}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {geoResults.length > 0 ? (
          <>
            {geoResults.map((r) => {
              const resolving = resolvingKey === r.key;
              return (
                <Pressable
                  key={r.key}
                  disabled={resolving}
                  style={({ pressed }) => [
                    styles.sheetGeoRow,
                    pressed && { backgroundColor: C.divider },
                    resolving && { opacity: 0.5 },
                  ]}
                  onPress={() => void handleSelectResult(r)}
                >
                  <View style={styles.sheetGeoIconWrap}>
                    {resolving
                      ? <ActivityIndicator size="small" color={C.accent} />
                      : <MapPin size={13} color={C.accent} strokeWidth={2} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetGeoName}>{r.name}</Text>
                    <Text style={styles.sheetGeoSub} numberOfLines={1}>{r.displayName}</Text>
                  </View>
                  <ChevronRight size={12} color={C.muted} strokeWidth={2} />
                </Pressable>
              );
            })}
            {searchPhase === 'loading' ? (
              <View style={styles.sheetInlineLoading}>
                <ActivityIndicator size="small" color={C.muted} />
                <Text style={styles.sheetInlineLoadingText}>Updating…</Text>
              </View>
            ) : null}
          </>
        ) : searchPhase === 'loading' ? (
          <View style={styles.sheetSearchStatus}>
            <ActivityIndicator size="small" color={C.accent} />
            <Text style={styles.sheetSearchStatusText}>Searching…</Text>
          </View>
        ) : searchPhase === 'done' ? (
          <View style={styles.sheetSearchStatus}>
            <Text style={styles.sheetSearchStatusTitle}>No results found</Text>
            <Text style={styles.sheetSearchStatusText}>Try a different name or spelling</Text>
          </View>
        ) : searchPhase === 'error' ? (
          <View style={styles.sheetSearchStatus}>
            <Text style={styles.sheetSearchStatusTitle}>Couldn't search right now</Text>
            <Text style={styles.sheetSearchStatusText}>Check your connection and try again</Text>
          </View>
        ) : (
          <View style={styles.sheetSearchStatus}>
            <Text style={styles.sheetSearchStatusText}>
              Type a locality, landmark, or city
            </Text>
          </View>
        )}
      </ScrollView>
    </>
  );

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingScreen style={styles.sheetKAV}>
        {/* Animated frosted backdrop — blur is iOS-only: expo-blur's Android
            implementation re-captures on every parent re-render (every
            keystroke while searching triggers one), which reads as visible
            flicker on Android. A flat dim overlay does the same job there. */}
        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: backdropOpacity }]}
          pointerEvents="box-none"
        >
          {Platform.OS === 'ios' && <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />}
          <View style={[StyleSheet.absoluteFill, styles.sheetBackdrop]} />
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        {/* Animated sheet */}
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY: sheetTranslateY }] }]}
        >
          <View style={styles.sheetHandle} />
          {view === 'options' ? renderOptions() : renderSearch()}
        </Animated.View>
      </KeyboardAvoidingScreen>
    </Modal>
  );
}

// ─── Home Screen ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const { locationStatus, coords, locationName, locationSynced } = useAppStore();
  const { initLocation, requestPermissionAndLocate, openSettings, refresh, applyLocation } = useLocation();
  const invalidateStores = useInvalidateStores();
  // Backend is the source of truth — never inferred from local state. FCM
  // foreground messages invalidate this query directly (notificationService's
  // onMessage handler), so it updates live without polling; the global
  // focus-refetch (QueryProvider) covers app-foreground/screen revisit.
  const { data: unreadCount = 0 } = useUnreadNotificationCount();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [skipLocation, setSkipLocation] = useState(false);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [locationHistory, setLocationHistory] = useState<RecentLocation[]>([]);
  // Empty array = "Select All" / no restriction — matches every store's category.
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('default');
  const storeSectionCopy = getStoreSectionCopy(sortMode);
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [priceSheetVisible, setPriceSheetVisible] = useState(false);
  // Distinct from selectedCategories above (that's the Filters sheet's multi-select,
  // matched against Store.category). This is the home-screen category-icon row, matched
  // against each store's actual MENU categories via useStoresByCategory.
  const [selectedHomeCategory, setSelectedHomeCategory] = useState<string | null>(null);

  const searchBarFocused = useRef(false);
  const headerScale = useRef(new Animated.Value(1)).current;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(text), 400);
  }, []);

  const clearSearch = useCallback(() => {
    setQuery('');
    setDebouncedQuery('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  useEffect(() => {
    if (useAppStore.getState().locationStatus === 'idle') {
      void initLocation();
    }
  }, [initLocation]);

  const openLocationPicker = useCallback(async () => {
    const history = await storageService.getLocationHistory();
    setLocationHistory(history);
    setLocationPickerVisible(true);
  }, []);

  const handlePickerDetect = useCallback(() => {
    setLocationPickerVisible(false);
    setSkipLocation(false);
    void refresh();
  }, [refresh]);

  // Also covers a Google/Nominatim search selection — ActiveLocationSheet's
  // onSelectHistory prop is shared by both the "Recent" list and a resolved
  // search result. An explicit location choice always supersedes an earlier
  // "continue without location" — otherwise locationReady (gated on
  // !skipLocation) would stay stuck false and nearby/search would never use
  // the location the user just picked.
  const handlePickerSelectHistory = useCallback(
    (lat: number, lng: number, name: string) => {
      setLocationPickerVisible(false);
      setSkipLocation(false);
      void applyLocation(lat, lng, name);
    },
    [applyLocation],
  );

  const locationReady = locationStatus === 'ready' && !skipLocation;
  const isLocating =
    locationStatus === 'checking' || locationStatus === 'requesting' ||
    locationStatus === 'detecting' || locationStatus === 'updating';
  const isLocationReady = locationStatus === 'ready' && !!coords;
  const showPermissionBanner =
    !skipLocation &&
    (locationStatus === 'denied' || locationStatus === 'blocked' || locationStatus === 'error');

  const {
    data: allStores, isLoading: allLoading, error: allError, refetch: refetchAll,
  } = useAllStores();

  const storesById = useMemo(
    () => Object.fromEntries((allStores ?? []).map((s) => [s.id, s])) as Record<number, Store>,
    [allStores],
  );

  // Wait for locationSynced too, not just locationReady — GPS resolving
  // doesn't mean the backend has the location on file yet (see appStore's
  // locationSynced doc comment). Without this, a brand-new account's very
  // first nearby-stores fetch can race the location PATCH and 400.
  // Only consumed here for its authoritative per-store distanceKm (merged
  // into storesWithDistance below) — there's no separate "Nearby" section
  // or list on the home screen any more.
  const { data: nearbyStores } = useNearbyStores({ enabled: locationReady && locationSynced });

  // Location-aware search: sends the user's latest known coordinates directly
  // with each request whenever GPS has resolved, so results come back
  // distance-filtered and nearest-first — falls back to a plain keyword
  // search (coords undefined) when location was skipped/denied/not-yet-ready.
  const isSearching = debouncedQuery.trim().length >= 2;
  const { data: searchResults, isLoading: searchLoading } = useSearchStores(
    debouncedQuery,
    locationReady && coords ? coords.latitude : undefined,
    locationReady && coords ? coords.longitude : undefined,
  );

  const {
    data: homeCategoryStores, isLoading: homeCategoryLoading, error: homeCategoryError,
    refetch: refetchHomeCategory,
  } = useStoresByCategory(selectedHomeCategory);

  const handleSelectHomeCategory = useCallback((name: string) => {
    setSelectedHomeCategory((prev) => (prev === name ? null : name));
    clearSearch();
  }, [clearSearch]);

  // "Starting from ₹X" needs the cheapest PURCHASABLE CARD per store (card-service),
  // not a menu item price — batched across every store currently on screen.
  const visibleStoreIds = useMemo(() => {
    const ids = new Set<number>();
    (allStores ?? []).forEach((s) => ids.add(s.id));
    (searchResults ?? []).forEach((s) => ids.add(s.id));
    (homeCategoryStores ?? []).forEach((s) => ids.add(s.id));
    return Array.from(ids);
  }, [allStores, searchResults, homeCategoryStores]);
  const { data: lowestPrices } = useLowestCardPricesByStores(visibleStoreIds);

  // Single unified store list for the home screen (no more separate
  // "Nearby" / "All stores" arrays). Every store gets a real distanceKm
  // when possible: the authoritative backend value from /nearby/me where
  // available, otherwise computed client-side via haversine from the
  // store's own lat/lng and the user's current coords — never invented,
  // never hardcoded. This is what makes "Near Me" actually reorder the
  // full list instead of only the handful of stores /nearby/me happens
  // to return.
  //
  // Once a distance is known, it's also capped to DEFAULT_RADIUS_KM here —
  // GET /api/user/stores (allStores) is a plain, unfiltered list of every
  // active store with no location awareness at all, so without this a store
  // 50km away rendered right alongside one 500m away, in whatever order the
  // backend happened to return them, with nothing to do with actual
  // distance unless the user manually tapped "Near Me" to sort (not filter)
  // the same unfiltered list. A store this can't compute a distance for at
  // all (no coords on either side, or location not resolved yet) is left
  // in rather than hidden — an unknown distance is not evidence it's far.
  const storesWithDistance = useMemo(() => {
    // Plain object, not a JS Map — `Map` here would resolve to the lucide-react-native
    // icon imported under that same name above, not the built-in collection.
    const nearbyDistanceById: Record<number, number> = {};
    (nearbyStores ?? []).forEach((s) => {
      if (s.distanceKm != null) nearbyDistanceById[s.id] = s.distanceKm;
    });

    // Defensive de-dupe by id — a store appearing twice in the raw API
    // response (seed/test data, a backend pagination overlap, etc.) would
    // otherwise render two <StoreCard key={s.id}> siblings with the same
    // key, which is exactly the "two children with the same key" warning.
    // This only drops exact-duplicate records; it doesn't filter, sort, or
    // otherwise touch which real stores are shown.
    const seenIds = new Set<number>();
    const dedupedStores = (allStores ?? []).filter((s) => {
      if (seenIds.has(s.id)) return false;
      seenIds.add(s.id);
      return true;
    });

    const withDistance = dedupedStores.map((s) => {
      const backendDist = nearbyDistanceById[s.id];
      if (backendDist != null) {
        return backendDist === s.distanceKm ? s : { ...s, distanceKm: backendDist };
      }
      if (s.distanceKm == null && coords && s.latitude != null && s.longitude != null) {
        return { ...s, distanceKm: haversineDistanceKm(coords.latitude, coords.longitude, s.latitude, s.longitude) };
      }
      return s;
    });

    if (!locationReady || !coords) return withDistance;
    return withDistance.filter((s) => s.distanceKm == null || s.distanceKm <= DEFAULT_RADIUS_KM);
  }, [allStores, nearbyStores, coords, locationReady]);

  // ── Filters (category + open-now) ─────────────────────────────────────────

  const categories = useMemo(() => {
    const set = new Set<string>();
    (allStores ?? []).forEach((s) => { if (s.category) set.add(s.category); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allStores]);

  // Filters that actually remove stores from a list — kept separate from
  // sortMode (which only reorders) so the "no stores match your filters"
  // empty state doesn't fire just because a sort pill is active.
  const hasActiveFilters = selectedCategories.length > 0 || openNowOnly;
  const hasActiveFiltersOrSort = hasActiveFilters || sortMode !== 'default';

  const matchesFilters = useCallback((s: Store) => {
    if (selectedCategories.length > 0 && !selectedCategories.includes(s.category)) return false;
    if (openNowOnly && !isStoreOpenNow(s)) return false;
    return true;
  }, [selectedCategories, openNowOnly]);

  const handleToggleNearMe = useCallback(() => {
    setSortMode((m) => (m === 'nearMe' ? 'default' : 'nearMe'));
  }, []);

  const handleOpenPriceSort = useCallback(() => {
    setPriceSheetVisible(true);
  }, []);

  const handleOpenFilters = useCallback(() => {
    setFilterSheetVisible(true);
  }, []);

  const handleApplyFiltersSheet = useCallback((sort: SortMode, openNow: boolean, cats: string[]) => {
    setSortMode(sort);
    setOpenNowOnly(openNow);
    setSelectedCategories(cats);
    setFilterSheetVisible(false);
  }, []);

  // The exact array the home screen's store cards render: attribute filters
  // (category / open-now) first, then the active sort mode. This is
  // the only list rendered for the default home view — no separate "Nearby"
  // array feeding a second, independently-filtered section any more.
  const visibleStores = useMemo(() => {
    const base = hasActiveFilters ? storesWithDistance.filter(matchesFilters) : storesWithDistance;
    return sortStores(base, sortMode, lowestPrices);
  }, [storesWithDistance, matchesFilters, hasActiveFilters, sortMode, lowestPrices]);
  const filteredSearchResults = useMemo(() => {
    const base = hasActiveFilters ? searchResults?.filter(matchesFilters) : searchResults;
    return base ? sortStores(base, sortMode, lowestPrices) : base;
  }, [searchResults, matchesFilters, hasActiveFilters, sortMode, lowestPrices]);

  const clearFilters = useCallback(() => {
    setSelectedCategories([]);
    setOpenNowOnly(false);
    setSortMode('default');
    setFilterSheetVisible(false);
    setPriceSheetVisible(false);
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh(), invalidateStores()]);
    } finally {
      setRefreshing(false);
    }
  }, [refresh, invalidateStores]);

  // ── Header ─────────────────────────────────────────────────────────────────

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <Text style={styles.greeting}>{getGreeting()}</Text>

        {isLocating ? (
          <View style={styles.locationRow}>
            <ActivityIndicator size="small" color={C.accent} style={{ marginRight: 6 }} />
            <Text style={styles.locationLoading}>Detecting…</Text>
          </View>
        ) : isLocationReady ? (
          <Pressable
            style={({ pressed }) => [styles.locationRow, pressed && { opacity: 0.6 }]}
            onPress={() => void openLocationPicker()}
            hitSlop={8}
          >
            <View style={styles.locationPinWrap}>
              <MapPin size={12} color={C.accent} strokeWidth={2.4} />
            </View>
            <Text style={styles.locationName} numberOfLines={1}>
              {locationName ?? 'Current Location'}
            </Text>
            <View style={styles.locationChevronWrap}>
              <ChevronDown size={13} color={C.secondary} strokeWidth={2.5} />
            </View>
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.locationRow, pressed && { opacity: 0.6 }]}
            onPress={() => void openLocationPicker()}
            hitSlop={8}
          >
            <Text style={styles.locationEmpty}>Set browsing area</Text>
            <View style={styles.locationChevronWrap}>
              <ChevronDown size={13} color={C.muted} strokeWidth={2} />
            </View>
          </Pressable>
        )}

        {isLocationReady && (
          <Text style={styles.locationContext}>Viewing stores in this area</Text>
        )}
      </View>

      <PressableScale style={styles.bellBtn} onPress={() => router.push(ROUTES.NOTIFICATIONS as never)}>
        <Bell size={19} color={C.primary} strokeWidth={1.7} />
        {unreadCount > 0 ? (
          <View style={styles.bellBadge}>
            <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
          </View>
        ) : null}
      </PressableScale>
    </View>
  );

  // ── Search Bar ─────────────────────────────────────────────────────────────

  const renderSearchBar = () => (
    <View style={styles.searchWrap}>
      <View style={styles.searchBar}>
        <Search size={17} color={query ? C.accent : C.muted} strokeWidth={2} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search for stores or categories"
          placeholderTextColor={C.placeholder}
          value={query}
          onChangeText={handleQueryChange}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="never"
        />
        {query.length > 0 ? (
          <Pressable onPress={clearSearch} hitSlop={8}>
            {searchLoading ? (
              <ActivityIndicator size="small" color={C.accent} />
            ) : (
              <View style={styles.searchClearCircle}>
                <X size={10} color={C.surface} strokeWidth={3} />
              </View>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  // ── Filter Bar (sits directly above the Nearby list, not the sticky header) ─

  const renderFilterBar = () => (
    <View style={styles.filterBarSection}>
      <FilterChipsBar
        categoryCount={selectedCategories.length}
        onOpenFilters={handleOpenFilters}
        openNowOnly={openNowOnly}
        onToggleOpenNow={() => setOpenNowOnly((v) => !v)}
        sortMode={sortMode}
        onToggleNearMe={handleToggleNearMe}
        onOpenPriceSort={handleOpenPriceSort}
        hasActiveFilters={hasActiveFiltersOrSort}
        onClear={clearFilters}
      />
    </View>
  );

  // ── List helpers ───────────────────────────────────────────────────────────

  const renderSkeletons = (count = 3) =>
    Array.from({ length: count }).map((_, i) => <StoreCardSkeleton key={i} />);

  const renderStoreList = (
    stores: Store[] | undefined,
    loading: boolean,
    error: unknown,
    emptyTitle: string,
    emptySub?: string,
    onRetry?: () => void,
    filteredOutOf?: number,
  ) => {
    if (loading) return <>{renderSkeletons()}</>;
    if (error) {
      return (
        <View style={styles.errorWrap}>
          <View style={styles.errorIconWrap}>
            <AlertCircle size={20} color={C.muted} strokeWidth={1.5} />
          </View>
          <Text style={styles.errorText}>
            {(error as Error)?.message ?? 'Failed to load stores.'}
          </Text>
          <PressableScale style={styles.retryBtn} onPress={() => void (onRetry ?? refetchAll)()}>
            <RefreshCw size={13} color={C.accent} strokeWidth={2} />
            <Text style={styles.retryBtnText}>Try again</Text>
          </PressableScale>
        </View>
      );
    }
    if (!stores || stores.length === 0) {
      // Underlying (pre-filter) list had items — the filters are what emptied it.
      if (filteredOutOf) {
        return (
          <EmptyState
            title="No stores match your filters"
            subtitle="Try a different category or clear filters to see everything"
            actionLabel="Clear filters"
            onAction={clearFilters}
          />
        );
      }
      return <EmptyState title={emptyTitle} subtitle={emptySub} />;
    }
    return stores.map((s, i) => <StoreCard key={s.id} store={s} index={i} lowestPrice={lowestPrices?.[s.id]} />);
  };

  // ── Search Results ─────────────────────────────────────────────────────────

  const renderSearchResults = () => (
    <View style={styles.section}>
      <SectionHeader
        title="Results"
        count={filteredSearchResults?.length}
        icon={<Search size={14} color={C.accent} strokeWidth={2} />}
      />
      {searchLoading
        ? renderSkeletons(2)
        : !filteredSearchResults || filteredSearchResults.length === 0
        ? hasActiveFilters && searchResults && searchResults.length > 0
          ? (
            <EmptyState
              title="No stores match your filters"
              subtitle="Try a different category or clear filters to see everything"
              actionLabel="Clear filters"
              onAction={clearFilters}
            />
          )
          : <EmptyState title="No stores found" subtitle={`Nothing matched "${debouncedQuery}"`} />
        : filteredSearchResults.map((s, i) => (
            <StoreCard key={s.id} store={s} index={i} lowestPrice={lowestPrices?.[s.id]} />
          ))
      }
    </View>
  );

  // ── Home Category Results ─────────────────────────────────────────────────

  const renderHomeCategoryResults = () => (
    <View style={styles.section}>
      <View style={styles.homeCategoryHeaderRow}>
        <View style={{ flex: 1 }}>
          <SectionHeader
            title={selectedHomeCategory ?? ''}
            count={homeCategoryStores?.length}
            icon={<UtensilsCrossed size={14} color={C.accent} strokeWidth={2} />}
          />
        </View>
        <Pressable
          style={styles.homeCategoryClearBtn}
          onPress={() => setSelectedHomeCategory(null)}
          hitSlop={8}
        >
          <X size={12} color={C.secondary} strokeWidth={2.5} />
          <Text style={styles.homeCategoryClearText}>Clear</Text>
        </Pressable>
      </View>
      {homeCategoryLoading
        ? renderSkeletons(2)
        : homeCategoryError
        ? (
          <View style={styles.errorWrap}>
            <View style={styles.errorIconWrap}>
              <AlertCircle size={20} color={C.muted} strokeWidth={1.5} />
            </View>
            <Text style={styles.errorText}>
              {(homeCategoryError as Error)?.message ?? 'Failed to load stores.'}
            </Text>
            <PressableScale style={styles.retryBtn} onPress={() => void refetchHomeCategory()}>
              <RefreshCw size={13} color={C.accent} strokeWidth={2} />
              <Text style={styles.retryBtnText}>Try again</Text>
            </PressableScale>
          </View>
        )
        : !homeCategoryStores || homeCategoryStores.length === 0
        ? (
          <EmptyState
            title="No stores in this category yet"
            subtitle="Check back soon, or browse everything instead"
            actionLabel="Clear filter"
            onAction={() => setSelectedHomeCategory(null)}
          />
        )
        : homeCategoryStores.map((s, i) => (
            <StoreCard key={s.id} store={s} index={i} lowestPrice={lowestPrices?.[s.id]} />
          ))
      }
    </View>
  );

  // ── Main Content ───────────────────────────────────────────────────────────

  const renderContent = () => {
    if (isSearching) return renderSearchResults();

    return (
      <>
        <CategoriesRow selectedCategory={selectedHomeCategory} onSelectCategory={handleSelectHomeCategory} />

        {selectedHomeCategory ? renderHomeCategoryResults() : (
          <>
            <BannerCarousel storesById={storesById} />

            {showPermissionBanner && (
              <LocationPermissionBanner
                status={locationStatus}
                onRequestPermission={() => void requestPermissionAndLocate()}
                onOpenSettings={openSettings}
                onContinueWithAll={() => setSkipLocation(true)}
                onRetry={() => void refresh()}
              />
            )}

            {renderFilterBar()}

            {/* Single unified list — no "Nearby" section, no separate
                "All stores" section. The filter bar above controls exactly
                this array (see visibleStores). The heading reflects the
                active sort, not a permanent "Nearby"/rating-based label. */}
            <View style={styles.section}>
              <View style={styles.storeSectionHeader}>
                <Text style={styles.storeSectionTitle}>{storeSectionCopy.title}</Text>
                {storeSectionCopy.subtitle ? (
                  <Text style={styles.storeSectionSubtitle}>{storeSectionCopy.subtitle}</Text>
                ) : null}
              </View>
              {renderStoreList(
                visibleStores,
                allLoading,
                allError,
                'No stores found',
                'Check back soon — new stores are added regularly',
                () => void refetchAll(),
                hasActiveFilters ? storesWithDistance.length : undefined,
              )}
            </View>
          </>
        )}
      </>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AnimatedHomeBackground />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        stickyHeaderIndices={[2]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void handleRefresh()}
            tintColor={C.accent}
            colors={[C.accent]}
          />
        }
      >
        {renderHeader()}
        <PurchasedCardsCarousel storesById={storesById} />
        {renderSearchBar()}
        <View style={styles.content}>{renderContent()}</View>
        <View style={styles.footerBrand}>
          <Text style={styles.footerBrandName}>STRIKE</Text>
          <Text style={styles.footerBrandCredit}>designed by scalatechnologies</Text>
        </View>
      </ScrollView>

      <ActiveLocationSheet
        visible={locationPickerVisible}
        history={locationHistory}
        onClose={() => setLocationPickerVisible(false)}
        onDetect={handlePickerDetect}
        onSelectHistory={handlePickerSelectHistory}
      />

      <FiltersSheet
        visible={filterSheetVisible}
        onClose={() => setFilterSheetVisible(false)}
        categories={categories}
        sortMode={sortMode}
        openNowOnly={openNowOnly}
        selectedCategories={selectedCategories}
        onApply={handleApplyFiltersSheet}
        onClearAll={clearFilters}
      />

      <PriceSortSheet
        visible={priceSheetVisible}
        onClose={() => setPriceSheetVisible(false)}
        sortMode={sortMode}
        onSelect={setSortMode}
      />
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scroll: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    flexGrow: 1,
  },

  // ── Footer branding ──
  footerBrand: {
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 20,
    backgroundColor: C.surface,
  },
  footerBrandName: {
    fontSize: 15,
    fontFamily: ManropeWeights.extraBold,
    color: C.muted,
    letterSpacing: 3,
  },
  footerBrandCredit: {
    fontSize: 11,
    fontFamily: ManropeWeights.medium,
    color: C.muted,
    marginTop: 4,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: C.surface,
    paddingHorizontal: SPACING.page,
    paddingTop: 14,
    paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    ...TYPE.eyebrow,
    color: C.muted,
    marginBottom: 6,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  locationPinWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.accentSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationName: {
    ...TYPE.heroTitle,
    color: C.primary,
    flexShrink: 1,
  },
  locationLoading: {
    fontSize: 20,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
    color: C.secondary,
    letterSpacing: -0.4,
  },
  locationEmpty: {
    fontSize: 20,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
    color: C.secondary,
    letterSpacing: -0.4,
  },
  locationChevronWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationContext: {
    fontSize: 12,
    color: C.muted,
    fontWeight: '400',
    fontFamily: ManropeWeights.regular,
    marginTop: 4,
    letterSpacing: 0.1,
  },
  bellBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 14,
    marginTop: 4,
    position: 'relative',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: { elevation: 1 },
    }),
  },
  bellBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: C.accent,
    borderWidth: 1.5,
    borderColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bellBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },

  // ── Search Bar ──
  searchWrap: {
    backgroundColor: C.surface,
    paddingHorizontal: SPACING.page,
    paddingTop: 22,
    paddingBottom: 12,
    marginTop: -12,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
    }),
  },
  // Premium search field — a white surface with a soft shadow doing the
  // work, not a flat gray fill. The pale/basic look came from sitting on
  // C.bg (the page background) with almost no elevation of its own.
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 18,
    height: 52,
    paddingHorizontal: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: C.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
      android: { elevation: 2 },
    }),
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: ManropeWeights.medium,
    color: C.primary,
    paddingVertical: 0,
  },
  searchClearCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.muted,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Filter Bar section (sits between the banners and the store list) ──
  filterBarSection: {
    marginTop: 20,
    marginBottom: 12,
  },
  filterBar: {},
  filterBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: SPACING.page,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 38,
    paddingHorizontal: 15,
    borderRadius: 19,
    backgroundColor: C.surface,
    borderWidth: 1.3,
    borderColor: C.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
      android: { elevation: 1 },
    }),
  },
  filterChipActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
    ...Platform.select({
      ios: { shadowColor: C.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  filterChipText: {
    ...TYPE.buttonText,
    color: C.secondary,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  filterClearChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 37,
    paddingHorizontal: 13,
    borderRadius: 18,
    backgroundColor: C.accentSoft,
  },
  filterClearChipText: {
    fontSize: 12.5,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.accent,
  },

  // ── Filters Sheet ──
  filterSheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  filterSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: SPACING.page,
    maxHeight: '82%',
    paddingBottom: Platform.OS === 'ios' ? 32 : 24,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
      },
      android: { elevation: 12 },
    }),
  },
  filterSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  filterSheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    letterSpacing: -0.4,
  },
  filterSheetCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.muted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 8,
  },
  filterSectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginTop: 14,
  },
  filterOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  filterOptionLabel: {
    fontSize: 14.5,
    fontFamily: ManropeWeights.medium,
    color: C.primary,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.6,
    borderColor: C.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleActive: {
    borderColor: C.accent,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.accent,
  },
  checkBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.6,
    borderColor: C.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkBoxActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  filterSheetFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  filterClearAllBtn: {
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  filterClearAllBtnText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.secondary,
  },
  filterApplyBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: C.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterApplyBtnText: {
    fontSize: 14.5,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: '#FFFFFF',
  },

  // ── Content ──
  content: { paddingBottom: 52, backgroundColor: C.surface },
  section: { marginTop: 4 },
  storeSectionHeader: {
    paddingHorizontal: SPACING.page,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 2,
  },
  storeSectionTitle: {
    ...TYPE.title,
    color: C.primary,
  },
  storeSectionSubtitle: {
    ...TYPE.secondary,
    color: C.muted,
  },
  homeCategoryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  homeCategoryClearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 20,
    backgroundColor: C.bg,
    borderRadius: 20,
  },
  homeCategoryClearText: {
    fontSize: 12,
    fontFamily: ManropeWeights.semiBold,
    color: C.secondary,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.page,
    paddingTop: 26,
    paddingBottom: 14,
    gap: 8,
  },
  sectionIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: C.accentSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    ...TYPE.title,
    color: C.primary,
  },
  sectionCountPill: {
    backgroundColor: C.bg,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    minWidth: 26,
    alignItems: 'center',
  },
  sectionCountText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
    color: C.muted,
  },

  // ── Store Card ──
  cardWrapper: {
    marginHorizontal: SPACING.page,
    marginBottom: 16,
  },
  // A tall vertical card — full-width hero image on top, content below.
  // PressableScale wraps children in its own unstyled inner Animated.View,
  // which defaults to flexDirection:'column' — exactly what a stacked
  // (image, then body) layout needs, so no row-layout workaround is
  // required here the way the earlier horizontal design needed one.
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F1F1F1',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: { elevation: 2 },
    }),
  },
  // Closed stores render as one disabled unit — true black & white via a
  // grayscale filter over the whole card (photo, chips, everything), plus a
  // slight opacity fade. Not a separate "Closed" chip.
  cardClosed: {
    filter: [{ grayscale: 1 }],
    opacity: 0.7,
  },
  // Full-width hero image — dominates the top of the card. `overflow:hidden`
  // on `card` above gives it the same top corner radius automatically.
  cardImageWrap: {
    width: '100%',
    height: 200,
    position: 'relative',
    backgroundColor: C.skeleton,
  },
  cardImageFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardImageFallbackInitial: {
    fontSize: 40,
    fontFamily: ManropeWeights.bold,
    letterSpacing: -1,
  },
  // Distance/directions — an overlay pill on the image, top-right. Still
  // the same real distanceKm and the same openDirections() tap behavior.
  cardImageDistanceBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.14, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  cardImageDistanceText: {
    fontSize: 12,
    fontFamily: ManropeWeights.bold,
    color: '#111827',
  },
  // Scrim lives only behind the category row (bottom third of the image),
  // not across the whole photo — a legibility aid, not a decorative wash.
  cardImageScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '45%',
  },
  cardImageCategoryRow: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  categoryTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: RADIUS.pill,
    paddingHorizontal: 11,
    paddingVertical: 5.5,
    maxWidth: 120,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
      android: { elevation: 1 },
    }),
  },
  categoryTagMore: {
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  categoryTagText: {
    fontSize: 12,
    fontFamily: ManropeWeights.medium,
    color: '#E5484D',
    textTransform: 'capitalize',
  },
  categoryTagMoreText: {
    color: C.secondary,
  },
  cardBody: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
  },
  cardName: {
    fontSize: 19,
    lineHeight: 24,
    fontFamily: ManropeWeights.semiBold,
    color: '#111827',
    marginBottom: 6,
  },
  cardAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 16,
  },
  cardAddress: {
    fontSize: 13.5,
    lineHeight: 19,
    fontFamily: ManropeWeights.regular,
    color: '#6B7280',
    flexShrink: 1,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F1F1',
    marginBottom: 14,
  },
  priceBlock: {},
  priceLabel: {
    fontSize: 11,
    fontFamily: ManropeWeights.semiBold,
    color: '#6B7280',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  priceValue: {
    fontSize: 21,
    fontFamily: ManropeWeights.bold,
    color: C.accent,
    letterSpacing: -0.4,
  },
  priceUnit: {
    fontSize: 14,
    fontFamily: ManropeWeights.medium,
    color: '#6B7280',
  },

  // ── Location Permission Banner ──
  permissionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.surface,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  permissionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  permissionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  permissionText: { flex: 1, gap: 2 },
  permissionTitle: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.primary,
  },
  permissionSub: {
    fontSize: 12,
    color: C.muted,
    fontFamily: ManropeWeights.regular,
  },
  permissionActions: {
    alignItems: 'flex-end',
    gap: 6,
  },
  permissionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: C.accent,
    borderRadius: 10,
  },
  permissionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: '#FFF',
    letterSpacing: 0.1,
  },
  permissionSkip: { paddingVertical: 2 },
  permissionSkipText: {
    fontSize: 11,
    color: C.muted,
    fontFamily: ManropeWeights.regular,
  },

  // ── Active Location Sheet ──
  sheetKAV: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    // iOS also has a BlurView layered beneath this doing most of the "dim
    // the background" work, so it can stay lighter there; Android has no
    // blur (see the backdrop's render — flicker risk, not just a look), so
    // this alone needs to read as a real dimmed backdrop.
    backgroundColor: Platform.OS === 'ios' ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.45)',
  },
  sheet: {
    flex: 1,
    backgroundColor: C.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: SPACING.page,
    maxHeight: '88%',
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
      },
      android: { elevation: 12 },
    }),
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 22,
  },
  sheetTitleBlock: {
    marginBottom: 22,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  sheetSubtitle: {
    fontSize: 13,
    color: C.muted,
    lineHeight: 18,
    fontFamily: ManropeWeights.regular,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: C.surface,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 2 },
    }),
  },
  optionIconGrad: {
    width: 42,
    height: 42,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetOptionContent: { flex: 1 },
  sheetOptionLabel: {
    fontSize: 14.5,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
    color: C.primary,
    marginBottom: 2,
  },
  sheetOptionSub: {
    fontSize: 12,
    color: C.muted,
    fontFamily: ManropeWeights.regular,
  },
  sheetRecentSection: {
    marginTop: 6,
    marginBottom: 4,
  },
  sheetSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.muted,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },
  sheetRecentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: C.bg,
    marginBottom: 6,
  },
  sheetRecentIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: C.accentSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetRecentName: {
    fontSize: 14,
    color: C.primary,
    fontWeight: '500',
    fontFamily: ManropeWeights.medium,
    flex: 1,
  },

  // ── Sheet search view ──
  sheetSearchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  sheetBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  sheetSearchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.bg,
    borderRadius: 14,
    height: 46,
    paddingHorizontal: 12,
    gap: 8,
    borderWidth: 1.5,
    borderColor: C.border,
    shadowColor: C.accent,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  sheetSearchInput: {
    flex: 1,
    fontSize: 15,
    color: C.primary,
    paddingVertical: 0,
    fontFamily: ManropeWeights.regular,
  },
  sheetSearchResults: {
    flex: 1,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  sheetGeoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: C.bg,
    marginBottom: 6,
  },
  sheetGeoIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: C.accentSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetGeoName: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
    color: C.primary,
    marginBottom: 2,
  },
  sheetGeoSub: {
    fontSize: 12,
    color: C.muted,
    fontFamily: ManropeWeights.regular,
  },
  sheetSearchStatus: {
    paddingVertical: 36,
    alignItems: 'center',
    gap: 6,
  },
  sheetSearchStatusTitle: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
    color: C.secondary,
  },
  sheetSearchStatusText: {
    fontSize: 13,
    color: C.muted,
    textAlign: 'center',
    fontFamily: ManropeWeights.regular,
  },
  sheetInlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  sheetInlineLoadingText: {
    fontSize: 12,
    color: C.muted,
    fontFamily: ManropeWeights.regular,
  },

  // ── Empty State ──
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
    color: C.secondary,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 13,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 18,
    fontFamily: ManropeWeights.regular,
  },
  emptyActionBtn: {
    marginTop: 6,
    backgroundColor: C.accentSoft,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  emptyActionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.accent,
  },

  // ── Error State ──
  errorWrap: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 24,
    gap: 10,
  },
  errorIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: C.dangerBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 13,
    color: C.secondary,
    textAlign: 'center',
    fontFamily: ManropeWeights.regular,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 22,
    height: 42,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.accent,
    marginTop: 4,
  },
  retryBtnText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
    color: C.accent,
  },
});
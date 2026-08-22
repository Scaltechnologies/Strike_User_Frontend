import { Image } from 'expo-image';
import {
  AlertCircle,
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Map,
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
  Keyboard,
  KeyboardAvoidingView,
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
import { formatDistance, openDirections } from '@/utils/maps';
import { useMediaSource, logMediaError } from '@/utils/media';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedHomeBackground } from '@/components/home/AnimatedHomeBackground';
import { BannerCarousel } from '@/components/home/BannerCarousel';
import { CategoriesRow } from '@/components/home/CategoriesRow';
import { PurchasedCardsCarousel } from '@/components/home/PurchasedCardsCarousel';
import { PressableScale } from '@/components/ui/PressableScale';
import { FadeInView } from '@/components/ui/FadeInView';
import { useLocation } from '@/hooks/useLocation';
import { useNotificationHistory } from '@/hooks/useNotificationHistory';
import {
  useAllStores, useInvalidateStores, useNearbyStores, useSearchStores, useStoreMenu, useStoresByCategory,
} from '@/hooks/useStores';
import { useLowestCardPricesByStores } from '@/hooks/useCards';
import { ROUTES } from '@/constants/routes';
import { ManropeWeights } from '@/constants/theme';
import type { RecentLocation } from '@/services/storageService';
import { storageService } from '@/services/storageService';
import { useAppStore } from '@/store/appStore';
import { isStoreOpenNow } from '@/utils/storeTiming';
import type { Store, StoreTiming } from '@/types/store';

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

function getTodayTiming(timings: StoreTiming[]): string | null {
  if (!timings || timings.length === 0) return null;
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const today = days[new Date().getDay()];
  const t = timings.find((x) => x.dayOfWeek === today);
  if (!t) return null;
  if (t.isClosed) return 'Closed today';
  if (!t.openTime || !t.closeTime) return null;
  const fmt = (s: string) => {
    const [h, m] = s.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
  };
  return `${fmt(t.openTime)} – ${fmt(t.closeTime)}`;
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

// Open stores first, nearest first within each group — closed stores sink to
// the bottom instead of interrupting the "closest to you" ordering.
function sortStoresByAvailability(stores: Store[]): Store[] {
  return [...stores].sort((a, b) => {
    const aOpen = isStoreOpenNow(a) ? 0 : 1;
    const bOpen = isStoreOpenNow(b) ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    const aDist = a.distanceKm ?? Number.POSITIVE_INFINITY;
    const bDist = b.distanceKm ?? Number.POSITIVE_INFINITY;
    return aDist - bDist;
  });
}

// ─── Area Search (Nominatim) ───────────────────────────────────────────────────

interface GeoResult {
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
}

async function searchArea(query: string): Promise<GeoResult[]> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?format=json` +
      `&q=${encodeURIComponent(query)}` +
      `&countrycodes=in` +
      `&limit=8` +
      `&addressdetails=1` +
      `&dedupe=1` +
      `&email=inquire.scalatechnologies%40gmail.com`;

    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return [];

    const data = (await res.json()) as Array<{
      display_name: string;
      lat: string;
      lon: string;
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
      .map((item) => {
        const a = item.address;
        const name =
          a?.neighbourhood ?? a?.quarter ?? a?.suburb ?? a?.hamlet ??
          a?.locality ?? a?.municipality ?? a?.city_district ??
          a?.city ?? a?.town ?? a?.village ?? a?.county ??
          item.display_name.split(',')[0];
        const cityOrTown = a?.city ?? a?.town ?? a?.municipality ?? a?.county;
        const parts = [name, cityOrTown, a?.state].filter(Boolean);
        const displayName = parts.length > 1 ? parts.join(', ') : item.display_name;
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        if (isNaN(lat) || isNaN(lon)) return null;
        return {
          name: (name ?? item.display_name.split(',')[0]).trim(),
          displayName: displayName.trim(),
          latitude: lat,
          longitude: lon,
        };
      })
      .filter((r): r is GeoResult => r !== null && r.name.length > 0);
  } catch {
    return [];
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
    <View style={[styles.card, { overflow: 'hidden' }]}>
      <SkeletonPulse height={124} radius={0} style={{ width: '100%' }} />
      <View style={styles.cardBody}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
          <SkeletonPulse height={14} width="55%" />
          <SkeletonPulse height={14} width="20%" />
        </View>
        <SkeletonPulse height={19} width="30%" style={{ borderRadius: 6, marginBottom: 9 }} />
        <SkeletonPulse height={11} width="55%" />
      </View>
    </View>
  );
}

// ─── Store Card ────────────────────────────────────────────────────────────────

function StoreCard({ store, index = 0, lowestPrice }: { store: Store; index?: number; lowestPrice?: number }) {
  const router = useRouter();
  const isOpen = isStoreOpenNow(store);
  const timing = getTodayTiming(store.timings);
  const distance = store.distanceKm != null ? formatDistance(store.distanceKm) : null;
  const initial = store.name.charAt(0).toUpperCase();
  const fallbackBg = getStoreFallbackColor(store.name);
  const initialColor = getStoreInitialColor(store.name);
  const [imgFailed, setImgFailed] = useState(false);
  const bannerSource = useMediaSource(store.logoUrl);
  const showPhoto = !!bannerSource && !imgFailed;

  // Vendor-defined menu categories (e.g. "Mains", "Beverages") — falls back
  // to the store's single business category if the vendor hasn't set up a
  // menu yet, so a card never renders with no tag at all.
  const { data: menuCategories, isLoading: categoriesLoading } = useStoreMenu(store.id);
  const categoryNames = menuCategories && menuCategories.length > 0
    ? menuCategories.map((c) => c.name)
    : null;

  return (
    <FadeInView delay={index * 60} style={styles.cardWrapper}>
      <PressableScale
        style={[styles.card, !isOpen && styles.cardClosed]}
        onPress={() => router.push(`/store/${store.id}` as never)}
      >
        {/* ── Banner ─────────────────────────────────── */}
        <View style={styles.banner}>
          {showPhoto && bannerSource ? (
            <Image
              source={bannerSource}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={200}
              onError={(e) => {
                logMediaError('store card banner', bannerSource.uri, e.error);
                setImgFailed(true);
              }}
            />
          ) : (
            <View style={[styles.bannerFallback, { backgroundColor: fallbackBg }]}>
              <View style={[styles.bannerInitialCircle, { backgroundColor: `${initialColor}22` }]}>
                <Text style={[styles.bannerFallbackInitial, { color: initialColor }]}>
                  {initial}
                </Text>
              </View>
              <Text style={styles.bannerFallbackLabel} numberOfLines={1}>
                {store.name}
              </Text>
            </View>
          )}

          {/* Subtle scrim for photos */}
          {showPhoto ? <View style={styles.bannerPhotoScrim} /> : null}
        </View>

        {/* ── Card Body ──────────────────────────────── */}
        <View style={styles.cardBody}>
          {/* Name + category row */}
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardName} numberOfLines={1}>{store.name}</Text>
          </View>

          <View style={styles.categoryChipRow}>
            {categoriesLoading ? (
              <>
                <SkeletonPulse width={52} height={19} radius={6} />
                <SkeletonPulse width={66} height={19} radius={6} />
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

          {lowestPrice != null && (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Starting from</Text>
              <Text style={styles.priceValue}>{fmtPrice(lowestPrice)}</Text>
            </View>
          )}

          {/* Footer: timing / address + Directions button */}
          <View style={styles.cardFooter}>
            <View style={styles.cardMeta}>
              {distance != null ? (
                <View style={styles.metaItem}>
                  <MapPin size={10} color={C.accent} strokeWidth={2} />
                  <Text style={[styles.metaText, styles.metaDistance]}>{distance}</Text>
                </View>
              ) : timing != null ? (
                <View style={styles.metaItem}>
                  <Clock size={10} color={C.muted} strokeWidth={2} />
                  <Text style={styles.metaText}>{timing}</Text>
                </View>
              ) : store.address ? (
                <Text style={styles.cardAddress} numberOfLines={1}>{store.address}</Text>
              ) : null}
            </View>

            {store.latitude != null && store.longitude != null ? (
              <Pressable
                style={styles.cardDirectionsBtn}
                onPress={() => openDirections(store.latitude!, store.longitude!)}
                hitSlop={6}
              >
                <Navigation size={12} color={C.accent} strokeWidth={2.2} />
                <Text style={styles.cardDirectionsBtnText}>Directions</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </PressableScale>
    </FadeInView>
  );
}

// ─── Filter Chips ──────────────────────────────────────────────────────────────

function FilterChipsBar({
  categories,
  selectedCategory,
  onSelectCategory,
  openNowOnly,
  onToggleOpenNow,
  hasActiveFilters,
  onClear,
}: {
  categories: string[];
  selectedCategory: string | null;
  onSelectCategory: (c: string | null) => void;
  openNowOnly: boolean;
  onToggleOpenNow: () => void;
  hasActiveFilters: boolean;
  onClear: () => void;
}) {
  if (categories.length === 0) return null;

  return (
    <View style={styles.filterBarRow}>
      <View style={[styles.filterBarIconWrap, hasActiveFilters && styles.filterBarIconWrapActive]}>
        <SlidersHorizontal
          size={14}
          color={hasActiveFilters ? '#FFFFFF' : C.accent}
          strokeWidth={2.2}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterBarContent}
      >
        <Pressable
          style={[styles.filterChip, openNowOnly && styles.filterChipActive]}
          onPress={onToggleOpenNow}
          hitSlop={4}
        >
          <Clock size={12} color={openNowOnly ? '#FFFFFF' : C.secondary} strokeWidth={2.4} />
          <Text style={[styles.filterChipText, openNowOnly && styles.filterChipTextActive]}>
            Open Now
          </Text>
        </Pressable>

        <Pressable
          style={[styles.filterChip, selectedCategory === null && styles.filterChipActive]}
          onPress={() => onSelectCategory(null)}
          hitSlop={4}
        >
          <Text style={[styles.filterChipText, selectedCategory === null && styles.filterChipTextActive]}>
            All
          </Text>
        </Pressable>

        {categories.map((cat) => {
          const active = selectedCategory === cat;
          return (
            <Pressable
              key={cat}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => onSelectCategory(active ? null : cat)}
              hitSlop={4}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]} numberOfLines={1}>
                {cat}
              </Text>
            </Pressable>
          );
        })}

        {hasActiveFilters && (
          <Pressable style={styles.filterClearChip} onPress={onClear} hitSlop={4}>
            <X size={12} color={C.accent} strokeWidth={2.6} />
            <Text style={styles.filterClearChipText}>Clear</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
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
type SearchPhase = 'idle' | 'waiting' | 'loading' | 'done';

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
  const [view, setView] = useState<SheetView>('options');
  const [searchQuery, setSearchQuery] = useState('');
  const [geoResults, setGeoResults] = useState<GeoResult[]>([]);
  const [searchPhase, setSearchPhase] = useState<SearchPhase>('idle');
  const [kbHeight, setKbHeight] = useState(0);

  const sheetTranslateY = useRef(new Animated.Value(600)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const searchInputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchGenRef = useRef(0);

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
        setKbHeight(0);
      });
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKbHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, [visible]);

  const handleOpenSearch = useCallback(() => {
    setView('search');
    setTimeout(() => searchInputRef.current?.focus(), 200);
  }, []);

  const handleBackToOptions = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    searchGenRef.current += 1;
    setView('options');
    setSearchQuery('');
    setGeoResults([]);
    setSearchPhase('idle');
  }, []);

  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 2) {
      setGeoResults([]);
      setSearchPhase('idle');
      return;
    }
    setSearchPhase('waiting');
    debounceRef.current = setTimeout(async () => {
      const gen = ++searchGenRef.current;
      setSearchPhase('loading');
      const results = await searchArea(text);
      if (gen !== searchGenRef.current) return;
      setGeoResults(results);
      setSearchPhase('done');
    }, 400);
  }, []);

  const handleSelectResult = useCallback(
    (r: GeoResult) => {
      onSelectHistory(r.latitude, r.longitude, r.name);
      onClose();
    },
    [onSelectHistory, onClose],
  );

  const renderOptions = () => (
    <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
      <View style={styles.sheetTitleBlock}>
        <Text style={styles.sheetTitle}>Set location</Text>
        <Text style={styles.sheetSubtitle}>
          Browse stores and subscriptions in any area
        </Text>
      </View>

      <View style={styles.sheetOptionGroup}>
        <PressableScale
          style={styles.sheetOptionRow}
          onPress={() => { onDetect(); onClose(); }}
        >
          <View style={[styles.sheetOptionIcon, { backgroundColor: C.blueBg }]}>
            <Navigation size={16} color={C.blue} strokeWidth={2} />
          </View>
          <View style={styles.sheetOptionContent}>
            <Text style={styles.sheetOptionLabel}>Use my location</Text>
            <Text style={styles.sheetOptionSub}>Detect GPS position</Text>
          </View>
          <ChevronRight size={14} color={C.muted} strokeWidth={2} />
        </PressableScale>

        <View style={styles.sheetOptionDivider} />

        <PressableScale style={styles.sheetOptionRow} onPress={handleOpenSearch}>
          <View style={[styles.sheetOptionIcon, { backgroundColor: C.greenBg }]}>
            <Search size={16} color={C.green} strokeWidth={2} />
          </View>
          <View style={styles.sheetOptionContent}>
            <Text style={styles.sheetOptionLabel}>Search an area</Text>
            <Text style={styles.sheetOptionSub}>Locality, landmark, or city</Text>
          </View>
          <ChevronRight size={14} color={C.muted} strokeWidth={2} />
        </PressableScale>

        <View style={styles.sheetOptionDivider} />

        <View style={[styles.sheetOptionRow, { opacity: 0.42 }]}>
          <View style={[styles.sheetOptionIcon, { backgroundColor: C.bg }]}>
            <Map size={16} color={C.muted} strokeWidth={2} />
          </View>
          <View style={styles.sheetOptionContent}>
            <Text style={styles.sheetOptionLabel}>Pick on map</Text>
            <Text style={styles.sheetOptionSub}>Pin a location manually</Text>
          </View>
          <View style={styles.comingSoonBadge}>
            <Text style={styles.comingSoonText}>Soon</Text>
          </View>
        </View>
      </View>

      {history.length > 0 && (
        <View style={styles.sheetRecentSection}>
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
                <MapPin size={12} color={C.accent} strokeWidth={2} />
              </View>
              <Text style={styles.sheetRecentName} numberOfLines={1}>{loc.name}</Text>
              <ChevronRight size={12} color={C.muted} strokeWidth={2} />
            </Pressable>
          ))}
        </View>
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
        <View style={styles.sheetSearchBar}>
          <Search size={15} color={C.muted} strokeWidth={2} />
          <TextInput
            ref={searchInputRef}
            style={styles.sheetSearchInput}
            placeholder="Locality, landmark, or city…"
            placeholderTextColor={C.placeholder}
            value={searchQuery}
            onChangeText={handleSearchChange}
            returnKeyType="search"
            autoCapitalize="words"
            autoCorrect={false}
          />
          {searchQuery.length > 0 ? (
            <Pressable
              onPress={() => {
                if (debounceRef.current) clearTimeout(debounceRef.current);
                searchGenRef.current += 1;
                setSearchQuery('');
                setGeoResults([]);
                setSearchPhase('idle');
              }}
              hitSlop={8}
            >
              <View style={styles.searchClearCircle}>
                <X size={10} color={C.surface} strokeWidth={3} />
              </View>
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        style={styles.sheetSearchResults}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {geoResults.length > 0 ? (
          <>
            {geoResults.map((r, i) => (
              <Pressable
                key={i}
                style={({ pressed }) => [
                  styles.sheetGeoRow,
                  pressed && { backgroundColor: C.divider },
                ]}
                onPress={() => handleSelectResult(r)}
              >
                <View style={styles.sheetGeoIconWrap}>
                  <MapPin size={13} color={C.accent} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetGeoName}>{r.name}</Text>
                  <Text style={styles.sheetGeoSub} numberOfLines={1}>{r.displayName}</Text>
                </View>
                <ChevronRight size={12} color={C.muted} strokeWidth={2} />
              </Pressable>
            ))}
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
      <KeyboardAvoidingView
        style={[
          styles.sheetKAV,
          Platform.OS === 'android' && kbHeight > 0 && { paddingBottom: kbHeight },
        ]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Animated backdrop */}
        <Animated.View
          style={[styles.sheetBackdrop, { opacity: backdropOpacity }]}
          pointerEvents="box-none"
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        {/* Animated sheet */}
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY: sheetTranslateY }] }]}
        >
          <View style={styles.sheetHandle} />
          {view === 'options' ? renderOptions() : renderSearch()}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Home Screen ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const { locationStatus, coords, locationName, locationSynced } = useAppStore();
  const { initLocation, requestPermissionAndLocate, openSettings, refresh, applyLocation } = useLocation();
  const invalidateStores = useInvalidateStores();
  const { unreadCount } = useNotificationHistory();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [skipLocation, setSkipLocation] = useState(false);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [locationHistory, setLocationHistory] = useState<RecentLocation[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [openNowOnly, setOpenNowOnly] = useState(false);
  // Distinct from selectedCategory above (that's the store-level FilterChipsBar filter,
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
    void refresh();
  }, [refresh]);

  const handlePickerSelectHistory = useCallback(
    (lat: number, lng: number, name: string) => {
      setLocationPickerVisible(false);
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
  const {
    data: nearbyStores, isLoading: nearbyLoading, error: nearbyError, refetch: refetchNearby,
  } = useNearbyStores({ enabled: locationReady && locationSynced });

  const isSearching = debouncedQuery.trim().length >= 2;
  const { data: searchResults, isLoading: searchLoading } = useSearchStores(debouncedQuery);

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

  // "All stores" is every store in the catalogue, which always includes
  // whatever's in "Nearby" — filter those out so a store doesn't render
  // twice on the home screen.
  const otherStores = useMemo(() => {
    if (!locationReady || !nearbyStores?.length) return allStores;
    const nearbyIds = new Set(nearbyStores.map((s) => s.id));
    return (allStores ?? []).filter((s) => !nearbyIds.has(s.id));
  }, [allStores, nearbyStores, locationReady]);

  // ── Filters (category + open-now) ─────────────────────────────────────────

  const categories = useMemo(() => {
    const set = new Set<string>();
    (allStores ?? []).forEach((s) => { if (s.category) set.add(s.category); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allStores]);

  const hasActiveFilters = selectedCategory != null || openNowOnly;

  const matchesFilters = useCallback((s: Store) => {
    if (selectedCategory && s.category !== selectedCategory) return false;
    if (openNowOnly && !isStoreOpenNow(s)) return false;
    return true;
  }, [selectedCategory, openNowOnly]);

  const filteredNearby = useMemo(() => {
    const base = hasActiveFilters ? nearbyStores?.filter(matchesFilters) : nearbyStores;
    return base ? sortStoresByAvailability(base) : base;
  }, [nearbyStores, matchesFilters, hasActiveFilters]);
  const filteredOthers = useMemo(() => {
    const base = hasActiveFilters ? otherStores?.filter(matchesFilters) : otherStores;
    return base ? sortStoresByAvailability(base) : base;
  }, [otherStores, matchesFilters, hasActiveFilters]);
  const filteredSearchResults = useMemo(() => {
    const base = hasActiveFilters ? searchResults?.filter(matchesFilters) : searchResults;
    return base ? sortStoresByAvailability(base) : base;
  }, [searchResults, matchesFilters, hasActiveFilters]);

  const clearFilters = useCallback(() => {
    setSelectedCategory(null);
    setOpenNowOnly(false);
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
        {unreadCount > 0 && <View style={styles.bellDot} />}
      </PressableScale>
    </View>
  );

  // ── Search Bar ─────────────────────────────────────────────────────────────

  const renderSearchBar = () => (
    <View style={styles.searchWrap}>
      <View style={styles.searchBar}>
        <Search size={15} color={query ? C.accent : C.muted} strokeWidth={2} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search stores or categories"
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

      <FilterChipsBar
        categories={categories}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        openNowOnly={openNowOnly}
        onToggleOpenNow={() => setOpenNowOnly((v) => !v)}
        hasActiveFilters={hasActiveFilters}
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
            <BannerCarousel />

            {showPermissionBanner && (
              <LocationPermissionBanner
                status={locationStatus}
                onRequestPermission={() => void requestPermissionAndLocate()}
                onOpenSettings={openSettings}
                onContinueWithAll={() => setSkipLocation(true)}
                onRetry={() => void refresh()}
              />
            )}

            {locationReady && (
              <View style={styles.section}>
                <SectionHeader
                  title="Nearby"
                  count={filteredNearby?.length}
                  icon={<MapPin size={14} color={C.accent} strokeWidth={2} />}
                />
                {renderStoreList(
                  filteredNearby,
                  // useNearbyStores is disabled (isLoading:false) while it waits
                  // on locationSynced — without this, that wait would flash the
                  // "No stores nearby" empty state instead of a loading skeleton.
                  nearbyLoading || !locationSynced,
                  nearbyError,
                  'No stores nearby',
                  'Try searching an area or browse all stores below',
                  () => void refetchNearby(),
                  hasActiveFilters ? nearbyStores?.length : undefined,
                )}
              </View>
            )}

            <View style={styles.section}>
              <SectionHeader
                title="All stores"
                count={filteredOthers?.length}
              />
              {renderStoreList(
                filteredOthers,
                allLoading,
                allError,
                'No stores available',
                'Check back soon — new stores are added regularly',
                () => void refetchAll(),
                hasActiveFilters ? otherStores?.length : undefined,
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
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily: ManropeWeights.medium,
    color: C.muted,
    letterSpacing: 0.2,
    marginBottom: 5,
    textTransform: 'uppercase',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  locationName: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    flexShrink: 1,
    letterSpacing: -0.7,
    lineHeight: 26,
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
  bellDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: C.accent,
    borderWidth: 1.5,
    borderColor: C.bg,
  },

  // ── Search Bar ──
  searchWrap: {
    backgroundColor: C.surface,
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 10,
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.bg,
    borderRadius: 16,
    height: 48,
    paddingHorizontal: 14,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: ManropeWeights.regular,
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

  // ── Filter chips ──
  filterBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 10,
  },
  filterBarIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: C.accentSoft,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  filterBarIconWrapActive: {
    backgroundColor: C.accent,
  },
  filterBar: {
    flex: 1,
  },
  filterBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    backgroundColor: C.surface,
    borderWidth: 1.2,
    borderColor: C.border,
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
    fontSize: 12.5,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.secondary,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  filterClearChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: C.accentSoft,
  },
  filterClearChipText: {
    fontSize: 12.5,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.accent,
  },

  // ── Content ──
  content: { paddingBottom: 52, backgroundColor: C.surface },
  section: { marginTop: 4 },
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
    paddingHorizontal: 20,
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
    fontSize: 17,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    letterSpacing: -0.4,
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
    marginHorizontal: 16,
    marginBottom: 14,
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: { elevation: 3 },
    }),
  },
  // Closed stores render as one disabled unit — true black & white via a
  // grayscale filter over the whole card (photo, chips, Directions button,
  // everything), plus a slight opacity fade. Not a separate "Closed" chip.
  cardClosed: {
    filter: [{ grayscale: 1 }],
    opacity: 0.7,
    ...Platform.select({
      ios: { shadowOpacity: 0.02 },
      android: { elevation: 1 },
    }),
  },
  banner: {
    height: 124,
    position: 'relative',
    overflow: 'hidden',
  },
  bannerFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 7,
  },
  bannerInitialCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerFallbackInitial: {
    fontSize: 24,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    letterSpacing: -1,
    lineHeight: 28,
  },
  bannerFallbackLabel: {
    fontSize: 11,
    fontWeight: '500',
    fontFamily: ManropeWeights.medium,
    color: 'rgba(0,0,0,0.3)',
    letterSpacing: 0.3,
  },
  bannerPhotoScrim: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  cardBody: {
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 12,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  cardName: {
    fontSize: 14.5,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    letterSpacing: -0.3,
    flex: 1,
  },
  categoryChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 5,
    marginBottom: 8,
  },
  categoryTag: {
    alignSelf: 'flex-start',
    backgroundColor: C.accentSoft,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    maxWidth: 140,
  },
  categoryTagMore: {
    backgroundColor: C.bg,
  },
  categoryTagText: {
    fontSize: 10.5,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
    color: C.accentDeep,
    textTransform: 'capitalize',
    letterSpacing: 0.2,
  },
  categoryTagMoreText: {
    color: C.secondary,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
    marginTop: 8,
  },
  priceLabel: {
    fontSize: 11,
    fontFamily: ManropeWeights.medium,
    color: C.secondary,
  },
  priceValue: {
    fontSize: 15,
    fontFamily: ManropeWeights.extraBold,
    color: C.accent,
    letterSpacing: -0.2,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 7,
  },
  cardMeta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    overflow: 'hidden',
  },
  cardDirectionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2EF',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 9,
    flexShrink: 0,
  },
  cardDirectionsBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: '#D63527',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 11.5,
    color: C.secondary,
    fontFamily: ManropeWeights.regular,
  },
  metaDistance: {
    color: C.primary,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
  },
  metaDivider: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: C.muted,
  },
  cardAddress: {
    fontSize: 11.5,
    color: C.muted,
    fontFamily: ManropeWeights.regular,
    flex: 1,
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
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: C.overlay,
  },
  sheet: {
    flex: 1,
    backgroundColor: C.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 20,
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
  sheetOptionGroup: {
    backgroundColor: C.bg,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  sheetOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  sheetOptionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginLeft: 66,
  },
  sheetOptionIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetOptionContent: { flex: 1 },
  sheetOptionLabel: {
    fontSize: 14,
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
  comingSoonBadge: {
    backgroundColor: C.divider,
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  comingSoonText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
    color: C.muted,
  },
  sheetRecentSection: {
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
    paddingHorizontal: 10,
    borderRadius: 14,
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
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
    paddingHorizontal: 10,
    borderRadius: 14,
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
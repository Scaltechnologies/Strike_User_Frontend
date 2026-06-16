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
  Sparkles,
  X,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLocation } from '@/hooks/useLocation';
import { useAllStores, useInvalidateStores, useNearbyStores, useSearchStores } from '@/hooks/useStores';
import type { RecentLocation } from '@/services/storageService';
import { storageService } from '@/services/storageService';
import { useAppStore } from '@/store/appStore';
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

// ─── Animated Pressable ────────────────────────────────────────────────────────

function ScalePressable({
  children,
  style,
  onPress,
  hitSlop,
  disabled,
}: {
  children: React.ReactNode;
  style?: object | object[];
  onPress?: () => void;
  hitSlop?: number;
  disabled?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () =>
    Animated.spring(scale, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();

  const onPressOut = () =>
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      hitSlop={hitSlop}
      disabled={disabled}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

// ─── Fade-In Wrapper ───────────────────────────────────────────────────────────

function FadeIn({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: object;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 380,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 380,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
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
      <SkeletonPulse height={188} radius={0} style={{ width: '100%' }} />
      <View style={styles.cardBody}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
          <SkeletonPulse height={15} width="55%" />
          <SkeletonPulse height={15} width="20%" />
        </View>
        <SkeletonPulse height={22} width="30%" style={{ borderRadius: 8, marginBottom: 12 }} />
        <SkeletonPulse height={12} width="62%" />
      </View>
    </View>
  );
}

// ─── Store Card ────────────────────────────────────────────────────────────────

function StoreCard({ store, index = 0 }: { store: Store; index?: number }) {
  const router = useRouter();
  const isOpen = store.status === 'ACTIVE';
  const timing = getTodayTiming(store.timings);
  const distance = store.distanceKm != null ? formatDistance(store.distanceKm) : null;
  const initial = store.name.charAt(0).toUpperCase();
  const fallbackBg = getStoreFallbackColor(store.name);
  const initialColor = getStoreInitialColor(store.name);
  return (
    <FadeIn delay={index * 60} style={styles.cardWrapper}>
      <ScalePressable style={styles.card} onPress={() => router.push(`/store/${store.id}` as never)}>
        {/* ── Banner ─────────────────────────────────── */}
        <View style={styles.banner}>
          {store.logoUrl ? (
            <Image
              source={{ uri: store.logoUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={300}
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
          {store.logoUrl ? <View style={styles.bannerPhotoScrim} /> : null}

          {/* Status chip */}
          <View style={[styles.statusChip, isOpen ? styles.statusChipOpen : styles.statusChipClosed]}>
            <View style={[styles.statusDot, { backgroundColor: isOpen ? C.success : C.danger }]} />
            <Text style={[styles.statusChipText, { color: isOpen ? C.successText : C.dangerText }]}>
              {isOpen ? 'Open' : 'Closed'}
            </Text>
          </View>

          {/* Distance badge top-left */}
          {distance != null && (
            <View style={styles.distanceBadge}>
              <MapPin size={10} color={C.accent} strokeWidth={2.5} />
              <Text style={styles.distanceBadgeText}>{distance}</Text>
            </View>
          )}
        </View>

        {/* ── Card Body ──────────────────────────────── */}
        <View style={styles.cardBody}>
          {/* Name + category row */}
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardName} numberOfLines={1}>{store.name}</Text>
          </View>

          <View style={styles.categoryTag}>
            <Text style={styles.categoryTagText}>{store.category}</Text>
          </View>

          {/* Footer: timing / address + Directions button */}
          <View style={styles.cardFooter}>
            <View style={styles.cardMeta}>
              {distance != null ? (
                <View style={styles.metaItem}>
                  <MapPin size={11} color={C.accent} strokeWidth={2} />
                  <Text style={[styles.metaText, styles.metaDistance]}>{distance}</Text>
                </View>
              ) : timing != null ? (
                <View style={styles.metaItem}>
                  <Clock size={11} color={C.muted} strokeWidth={2} />
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
                <Navigation size={13} color={C.accent} strokeWidth={2.2} />
                <Text style={styles.cardDirectionsBtnText}>Directions</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </ScalePressable>
    </FadeIn>
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

function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <FadeIn>
      <View style={styles.emptyWrap}>
        <View style={styles.emptyIconWrap}>
          <Sparkles size={20} color={C.muted} strokeWidth={1.5} />
        </View>
        <Text style={styles.emptyTitle}>{title}</Text>
        {subtitle ? <Text style={styles.emptySub}>{subtitle}</Text> : null}
      </View>
    </FadeIn>
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
    <FadeIn style={{ marginHorizontal: 16, marginTop: 18 }}>
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
          <ScalePressable style={styles.permissionBtn} onPress={cfg.action}>
            <Text style={styles.permissionBtnText}>{cfg.actionLabel}</Text>
          </ScalePressable>
          <Pressable onPress={onContinueWithAll} style={styles.permissionSkip}>
            <Text style={styles.permissionSkipText}>Skip</Text>
          </Pressable>
        </View>
      </View>
    </FadeIn>
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
        <ScalePressable
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
        </ScalePressable>

        <View style={styles.sheetOptionDivider} />

        <ScalePressable style={styles.sheetOptionRow} onPress={handleOpenSearch}>
          <View style={[styles.sheetOptionIcon, { backgroundColor: C.greenBg }]}>
            <Search size={16} color={C.green} strokeWidth={2} />
          </View>
          <View style={styles.sheetOptionContent}>
            <Text style={styles.sheetOptionLabel}>Search an area</Text>
            <Text style={styles.sheetOptionSub}>Locality, landmark, or city</Text>
          </View>
          <ChevronRight size={14} color={C.muted} strokeWidth={2} />
        </ScalePressable>

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
  const { locationStatus, coords, locationName } = useAppStore();
  const { initLocation, requestPermissionAndLocate, openSettings, refresh, applyLocation } = useLocation();
  const invalidateStores = useInvalidateStores();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [skipLocation, setSkipLocation] = useState(false);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [locationHistory, setLocationHistory] = useState<RecentLocation[]>([]);

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

  const {
    data: nearbyStores, isLoading: nearbyLoading, error: nearbyError,
  } = useNearbyStores({ enabled: locationReady });

  const isSearching = debouncedQuery.trim().length >= 2;
  const { data: searchResults, isLoading: searchLoading } = useSearchStores(debouncedQuery);

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

      <ScalePressable style={styles.bellBtn}>
        <Bell size={19} color={C.primary} strokeWidth={1.7} />
        {/* Notification dot */}
        <View style={styles.bellDot} />
      </ScalePressable>
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
          <ScalePressable style={styles.retryBtn} onPress={() => void refetchAll()}>
            <RefreshCw size={13} color={C.accent} strokeWidth={2} />
            <Text style={styles.retryBtnText}>Try again</Text>
          </ScalePressable>
        </View>
      );
    }
    if (!stores || stores.length === 0) {
      return <EmptyState title={emptyTitle} subtitle={emptySub} />;
    }
    return stores.map((s, i) => <StoreCard key={s.id} store={s} index={i} />);
  };

  // ── Search Results ─────────────────────────────────────────────────────────

  const renderSearchResults = () => (
    <View style={styles.section}>
      <SectionHeader
        title="Results"
        count={searchResults?.length}
        icon={<Search size={14} color={C.accent} strokeWidth={2} />}
      />
      {searchLoading
        ? renderSkeletons(2)
        : !searchResults || searchResults.length === 0
        ? <EmptyState title="No stores found" subtitle={`Nothing matched "${debouncedQuery}"`} />
        : searchResults.map((s, i) => <StoreCard key={s.id} store={s} index={i} />)
      }
    </View>
  );

  // ── Main Content ───────────────────────────────────────────────────────────

  const renderContent = () => {
    if (isSearching) return renderSearchResults();

    return (
      <>
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
              count={nearbyStores?.length}
              icon={<MapPin size={14} color={C.accent} strokeWidth={2} />}
            />
            {renderStoreList(
              nearbyStores,
              nearbyLoading,
              nearbyError,
              'No stores nearby',
              'Try searching an area or browse all stores below',
            )}
          </View>
        )}

        <View style={styles.section}>
          <SectionHeader
            title="All stores"
            count={allStores?.length}
          />
          {renderStoreList(
            allStores,
            allLoading,
            allError,
            'No stores available',
            'Check back soon — new stores are added regularly',
          )}
        </View>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        stickyHeaderIndices={[1]}
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
        {renderSearchBar()}
        <View style={styles.content}>{renderContent()}</View>
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
    backgroundColor: C.surface,
  },
  scroll: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scrollContent: {
    flexGrow: 1,
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
    color: C.primary,
    flexShrink: 1,
    letterSpacing: -0.7,
    lineHeight: 26,
  },
  locationLoading: {
    fontSize: 20,
    fontWeight: '600',
    color: C.secondary,
    letterSpacing: -0.4,
  },
  locationEmpty: {
    fontSize: 20,
    fontWeight: '600',
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
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.07,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
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

  // ── Content ──
  content: { paddingBottom: 52 },
  section: { marginTop: 4 },
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
    color: C.muted,
  },

  // ── Store Card ──
  cardWrapper: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 18,
      },
      android: { elevation: 4 },
    }),
  },
  banner: {
    height: 188,
    position: 'relative',
    overflow: 'hidden',
  },
  bannerFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  bannerInitialCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerFallbackInitial: {
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -1,
    lineHeight: 40,
  },
  bannerFallbackLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(0,0,0,0.3)',
    letterSpacing: 0.3,
  },
  bannerPhotoScrim: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  statusChip: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
    }),
  },
  statusChipOpen: { backgroundColor: C.successBg },
  statusChipClosed: { backgroundColor: C.dangerBg },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  distanceBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
    }),
  },
  distanceBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.primary,
    letterSpacing: 0.1,
  },
  cardBody: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardName: {
    fontSize: 16,
    fontWeight: '700',
    color: C.primary,
    letterSpacing: -0.4,
    flex: 1,
  },
  categoryTag: {
    alignSelf: 'flex-start',
    backgroundColor: C.accentSoft,
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 10,
  },
  categoryTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.accentDeep,
    textTransform: 'capitalize',
    letterSpacing: 0.2,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
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
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    flexShrink: 0,
  },
  cardDirectionsBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D63527',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: C.secondary,
  },
  metaDistance: {
    color: C.primary,
    fontWeight: '600',
  },
  metaDivider: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: C.muted,
  },
  cardAddress: {
    fontSize: 12,
    color: C.muted,
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
    color: C.primary,
  },
  permissionSub: {
    fontSize: 12,
    color: C.muted,
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
    color: '#FFF',
    letterSpacing: 0.1,
  },
  permissionSkip: { paddingVertical: 2 },
  permissionSkipText: {
    fontSize: 11,
    color: C.muted,
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
    color: C.primary,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  sheetSubtitle: {
    fontSize: 13,
    color: C.muted,
    lineHeight: 18,
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
    color: C.primary,
    marginBottom: 2,
  },
  sheetOptionSub: {
    fontSize: 12,
    color: C.muted,
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
    color: C.muted,
  },
  sheetRecentSection: {
    marginBottom: 4,
  },
  sheetSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
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
    color: C.primary,
    marginBottom: 2,
  },
  sheetGeoSub: {
    fontSize: 12,
    color: C.muted,
  },
  sheetSearchStatus: {
    paddingVertical: 36,
    alignItems: 'center',
    gap: 6,
  },
  sheetSearchStatusTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: C.secondary,
  },
  sheetSearchStatusText: {
    fontSize: 13,
    color: C.muted,
    textAlign: 'center',
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
    color: C.secondary,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 13,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 18,
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
    color: C.accent,
  },
});
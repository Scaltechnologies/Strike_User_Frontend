import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
import { SafeAreaView } from 'react-native-safe-area-context';
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
  X,
} from 'lucide-react-native';

import { useAppStore } from '@/store/appStore';
import { useLocation } from '@/hooks/useLocation';
import { useAllStores, useNearbyStores, useSearchStores, useInvalidateStores } from '@/hooks/useStores';
import { storageService } from '@/services/storageService';
import type { RecentLocation } from '@/services/storageService';
import type { Store, StoreTiming } from '@/types/store';

// ─── Design Tokens ─────────────────────────────────────────────────────────────

const C = {
  accent:      '#D63527',
  accentSoft:  '#FEF2EF',
  bg:          '#F2F2F7',    // iOS system grouped background
  surface:     '#FFFFFF',
  border:      '#E8E8ED',
  divider:     '#F0F0F5',    // lighter than border – for internal dividers
  primary:     '#0D0D0D',
  secondary:   '#6C6C6C',
  muted:       '#AEAEB2',
  success:     '#34C759',
  successBg:   '#EDFAF2',
  successText: '#1A7A35',
  danger:      '#FF3B30',
  dangerBg:    '#FEF0EE',
  dangerText:  '#C0261A',
  skeleton:    '#E5E5EA',
  warning:     '#FF9500',
  warningBg:   '#FFF5E0',
  blue:        '#2563EB',
  blueBg:      '#EFF7FF',
  green:       '#16A34A',
  greenBg:     '#F0FDF4',
} as const;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDistance(km: number | null): string {
  if (km == null) return '';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
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

// Deterministic soft color from store name for the banner fallback
function getStoreFallbackColor(name: string): string {
  const palette = ['#E8EDF5', '#E5EFF5', '#EDF5E8', '#F5EEE8', '#EEE8F5', '#E8F2F5', '#F5EDE8'];
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

    // Do NOT set User-Agent here. React Native's native layer controls that
    // header and on some Android builds throws TypeError: Unsafe header
    // "User-Agent", which the catch block silently swallows returning [].
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

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
        // Walk from most-specific to least-specific. Indian localities appear
        // under widely varying keys depending on how OSM contributors tagged them.
        const name =
          a?.neighbourhood ??
          a?.quarter ??
          a?.suburb ??
          a?.hamlet ??
          a?.locality ??
          a?.municipality ??
          a?.city_district ??
          a?.city ??
          a?.town ??
          a?.village ??
          a?.county ??
          item.display_name.split(',')[0];

        // Short display: "Locality, City, State" — trim verbose OSM suffixes
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

function SkeletonPulse({ width, height, style }: {
  width?: number | string;
  height: number;
  style?: object;
}) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.35, duration: 950, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1,    duration: 950, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { backgroundColor: C.skeleton, borderRadius: 8, height, opacity },
        width != null ? { width } : { flex: 1 },
        style,
      ]}
    />
  );
}

function StoreCardSkeleton() {
  return (
    <View style={[styles.card, { overflow: 'hidden' }]}>
      <SkeletonPulse height={180} style={{ borderRadius: 0, width: '100%' }} />
      <View style={styles.cardBody}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
          <SkeletonPulse height={16} width="56%" />
          <SkeletonPulse height={16} width="18%" />
        </View>
        <SkeletonPulse height={22} width="28%" style={{ borderRadius: 6, marginBottom: 12 }} />
        <SkeletonPulse height={12} width="64%" />
      </View>
    </View>
  );
}

// ─── Store Card ────────────────────────────────────────────────────────────────

function StoreCard({ store }: { store: Store }) {
  const isOpen = store.status === 'ACTIVE';
  const timing = getTodayTiming(store.timings);
  const distance = store.distanceKm != null ? formatDistance(store.distanceKm) : null;
  const initial = store.name.charAt(0).toUpperCase();
  const fallbackBg = getStoreFallbackColor(store.name);

  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      {/* ── Banner ─────────────────────────────────────────────── */}
      <View style={styles.banner}>
        {store.logoUrl ? (
          <Image
            source={{ uri: store.logoUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={250}
          />
        ) : (
          <View style={[styles.bannerFallback, { backgroundColor: fallbackBg }]}>
            <Text style={styles.bannerFallbackInitial}>{initial}</Text>
            <Text style={styles.bannerFallbackLabel} numberOfLines={1}>
              {store.name}
            </Text>
          </View>
        )}
        {/* Subtle scrim over photos only */}
        {store.logoUrl ? (
          <View style={styles.bannerPhotoScrim} />
        ) : null}

        {/* Status chip */}
        <View style={[styles.statusChip, isOpen ? styles.statusChipOpen : styles.statusChipClosed]}>
          <View style={[styles.statusDot, { backgroundColor: isOpen ? C.success : C.danger }]} />
          <Text style={[styles.statusChipText, { color: isOpen ? C.successText : C.dangerText }]}>
            {isOpen ? 'Open' : 'Closed'}
          </Text>
        </View>
      </View>

      {/* ── Card Body ──────────────────────────────────────────── */}
      <View style={styles.cardBody}>
        {/* Row 1: name + distance */}
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardName} numberOfLines={1}>{store.name}</Text>
          {distance != null && (
            <View style={styles.distancePill}>
              <MapPin size={9} color={C.muted} strokeWidth={2} />
              <Text style={styles.distancePillText}>{distance}</Text>
            </View>
          )}
        </View>

        {/* Row 2: category tag */}
        <View style={styles.categoryTag}>
          <Text style={styles.categoryTagText}>{store.category}</Text>
        </View>

        {/* Row 3: timing + address */}
        {(timing != null || store.address) ? (
          <View style={styles.cardFooter}>
            {timing != null && (
              <View style={styles.metaItem}>
                <Clock size={11} color={C.muted} strokeWidth={2} />
                <Text style={styles.metaText}>{timing}</Text>
              </View>
            )}
            {timing != null && store.address ? (
              <Text style={styles.metaDot}>·</Text>
            ) : null}
            {store.address ? (
              <Text style={styles.cardAddress} numberOfLines={1}>{store.address}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

// ─── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>
        {title}
        {count != null ? (
          <Text style={styles.sectionCountInline}>{`  ${count} places`}</Text>
        ) : null}
      </Text>
    </View>
  );
}

// ─── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.emptySub}>{subtitle}</Text> : null}
    </View>
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
  if (status === 'denied') {
    return (
      <View style={styles.permissionCard}>
        <View style={styles.permissionLeft}>
          <View style={styles.permissionIconWrap}>
            <MapPin size={16} color={C.accent} strokeWidth={2} />
          </View>
          <View style={styles.permissionText}>
            <Text style={styles.permissionTitle}>Enable location</Text>
            <Text style={styles.permissionSub}>Discover stores near you</Text>
          </View>
        </View>
        <View style={styles.permissionActions}>
          <Pressable style={styles.permissionBtn} onPress={onRequestPermission}>
            <Text style={styles.permissionBtnText}>Enable</Text>
          </Pressable>
          <Pressable onPress={onContinueWithAll} style={styles.permissionSkip}>
            <Text style={styles.permissionSkipText}>Skip</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (status === 'blocked') {
    return (
      <View style={styles.permissionCard}>
        <View style={styles.permissionLeft}>
          <View style={styles.permissionIconWrap}>
            <Settings size={16} color={C.accent} strokeWidth={2} />
          </View>
          <View style={styles.permissionText}>
            <Text style={styles.permissionTitle}>Location disabled</Text>
            <Text style={styles.permissionSub}>Enable in device Settings</Text>
          </View>
        </View>
        <View style={styles.permissionActions}>
          <Pressable style={styles.permissionBtn} onPress={onOpenSettings}>
            <Text style={styles.permissionBtnText}>Settings</Text>
          </Pressable>
          <Pressable onPress={onContinueWithAll} style={styles.permissionSkip}>
            <Text style={styles.permissionSkipText}>Skip</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={[styles.permissionCard, { borderColor: '#FDDCBA' }]}>
        <View style={styles.permissionLeft}>
          <View style={[styles.permissionIconWrap, { backgroundColor: C.warningBg }]}>
            <AlertCircle size={16} color={C.warning} strokeWidth={2} />
          </View>
          <View style={styles.permissionText}>
            <Text style={styles.permissionTitle}>Location unavailable</Text>
            <Text style={styles.permissionSub}>Could not detect GPS position</Text>
          </View>
        </View>
        <View style={styles.permissionActions}>
          <Pressable style={styles.permissionBtn} onPress={onRetry}>
            <Text style={styles.permissionBtnText}>Retry</Text>
          </Pressable>
          <Pressable onPress={onContinueWithAll} style={styles.permissionSkip}>
            <Text style={styles.permissionSkipText}>Skip</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return null;
}

// ─── Active Location Sheet ─────────────────────────────────────────────────────

type SheetView = 'options' | 'search';

// Four discrete phases for the search flow:
//   idle    – query < 2 chars, no search started
//   waiting – query >= 2 chars, inside debounce window, fetch not yet sent
//   loading – fetch in flight
//   done    – fetch completed (results may be empty)
//
// "No results found" must ONLY show in 'done'. Showing it in 'waiting' (the old
// bug) caused it to flash on every keystroke before the debounce fired.
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

  const searchInputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonically increasing counter so each debounced callback can verify it
  // is still the latest dispatched request before applying its results.
  const searchGenRef = useRef(0);

  // Reset all search state when the sheet is dismissed.
  useEffect(() => {
    if (!visible) {
      setView('options');
      setSearchQuery('');
      setGeoResults([]);
      setSearchPhase('idle');
      setKbHeight(0);
    }
  }, [visible]);

  // Android: KAV with behavior={undefined} does nothing inside a Modal.
  // Manually track keyboard height and apply it as paddingBottom on the KAV
  // so the sheet slides up above the keyboard when it opens.
  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) =>
      setKbHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
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

    // Move to 'waiting' — debounce window is open, fetch not yet sent.
    // This is the key fix: the render shows the neutral hint in 'waiting',
    // NOT "No results found". Previously geoLoading=false here caused that
    // premature message to flash on every keystroke.
    setSearchPhase('waiting');

    debounceRef.current = setTimeout(async () => {
      const gen = ++searchGenRef.current;
      setSearchPhase('loading');
      const results = await searchArea(text);
      if (gen !== searchGenRef.current) return; // stale — newer request in flight
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
      {/* Title block */}
      <View style={styles.sheetTitleBlock}>
        <Text style={styles.sheetTitle}>Active Location</Text>
        <Text style={styles.sheetSubtitle}>
          Browse stores and subscriptions in any area — not just where you are.
        </Text>
      </View>

      {/* Option group */}
      <View style={styles.sheetOptionGroup}>
        {/* GPS */}
        <Pressable
          style={({ pressed }) => [styles.sheetOptionRow, pressed && styles.sheetOptionPressed]}
          onPress={() => { onDetect(); onClose(); }}
        >
          <View style={[styles.sheetOptionIcon, { backgroundColor: C.blueBg }]}>
            <Navigation size={16} color={C.blue} strokeWidth={2} />
          </View>
          <View style={styles.sheetOptionContent}>
            <Text style={styles.sheetOptionLabel}>Use Current Location</Text>
            <Text style={styles.sheetOptionSub}>Detect my GPS position</Text>
          </View>
          <ChevronRight size={15} color={C.muted} strokeWidth={2} />
        </Pressable>

        <View style={styles.sheetOptionDivider} />

        {/* Search area */}
        <Pressable
          style={({ pressed }) => [styles.sheetOptionRow, pressed && styles.sheetOptionPressed]}
          onPress={handleOpenSearch}
        >
          <View style={[styles.sheetOptionIcon, { backgroundColor: C.greenBg }]}>
            <Search size={16} color={C.green} strokeWidth={2} />
          </View>
          <View style={styles.sheetOptionContent}>
            <Text style={styles.sheetOptionLabel}>Search an Area</Text>
            <Text style={styles.sheetOptionSub}>Locality, landmark or city</Text>
          </View>
          <ChevronRight size={15} color={C.muted} strokeWidth={2} />
        </Pressable>

        <View style={styles.sheetOptionDivider} />

        {/* Map – deferred */}
        <View style={[styles.sheetOptionRow, { opacity: 0.45 }]}>
          <View style={[styles.sheetOptionIcon, { backgroundColor: C.bg }]}>
            <Map size={16} color={C.muted} strokeWidth={2} />
          </View>
          <View style={styles.sheetOptionContent}>
            <Text style={styles.sheetOptionLabel}>Select on Map</Text>
            <Text style={styles.sheetOptionSub}>Pin a location manually</Text>
          </View>
          <View style={styles.comingSoonBadge}>
            <Text style={styles.comingSoonText}>Soon</Text>
          </View>
        </View>
      </View>

      {/* Recent locations */}
      {history.length > 0 && (
        <View style={styles.sheetRecentSection}>
          <Text style={styles.sheetSectionLabel}>Recent</Text>
          {history.map((loc) => (
            <Pressable
              key={`${loc.latitude}-${loc.longitude}`}
              style={({ pressed }) => [styles.sheetRecentRow, pressed && styles.sheetOptionPressed]}
              onPress={() => {
                onSelectHistory(loc.latitude, loc.longitude, loc.name ?? '');
                onClose();
              }}
            >
              <View style={styles.sheetRecentIconWrap}>
                <MapPin size={12} color={C.muted} strokeWidth={2} />
              </View>
              <Text style={styles.sheetRecentName} numberOfLines={1}>{loc.name}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={{ height: 8 }} />
    </ScrollView>
  );

  const renderSearch = () => (
    <>
      {/* Search header */}
      <View style={styles.sheetSearchHeader}>
        <Pressable onPress={handleBackToOptions} style={styles.sheetBackBtn} hitSlop={12}>
          <ChevronLeft size={22} color={C.primary} strokeWidth={2.5} />
        </Pressable>
        <View style={styles.sheetSearchBar}>
          <Search size={15} color={C.muted} strokeWidth={2} />
          <TextInput
            ref={searchInputRef}
            style={styles.sheetSearchInput}
            placeholder="Locality, landmark or city…"
            placeholderTextColor={C.muted}
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
              <X size={14} color={C.muted} strokeWidth={2.5} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Results
          Render priority order:
            1. Show existing results (even while a follow-up search is loading)
            2. Full spinner only when loading with NO results yet
            3. "No results" only in 'done' phase — never in 'waiting'
            4. Neutral hint for 'idle' and 'waiting'                          */}
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
                style={({ pressed }) => [styles.sheetGeoRow, pressed && styles.sheetOptionPressed]}
                onPress={() => handleSelectResult(r)}
              >
                <View style={styles.sheetRecentIconWrap}>
                  <MapPin size={12} color={C.accent} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetGeoName}>{r.name}</Text>
                  <Text style={styles.sheetGeoSub} numberOfLines={1}>{r.displayName}</Text>
                </View>
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
          // 'idle' or 'waiting' — same neutral prompt, no premature "no results"
          <View style={styles.sheetSearchStatus}>
            <Text style={styles.sheetSearchStatusText}>
              Type a locality, landmark, or city name
            </Text>
          </View>
        )}
      </ScrollView>
    </>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/*
        iOS: behavior="padding" pushes the KAV bottom up by the keyboard height,
        lifting the sheet above the keyboard.
        Android: KAV behavior is unreliable inside a Modal. Instead we track the
        keyboard height via Keyboard.addListener and apply it as paddingBottom
        directly on the KAV style — same net effect, no KAV internals involved.
      */}
      <KeyboardAvoidingView
        style={[
          styles.sheetKAV,
          Platform.OS === 'android' && kbHeight > 0 && { paddingBottom: kbHeight },
        ]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.sheetBackdrop} onPress={onClose} />
        {/*
          Single consistent sheet height for both views. The old conditional
          maxHeight (75% → 90%) caused an instant layout snap when switching
          from options to search — no animation, just a visible jump.
        */}
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          {view === 'options' ? renderOptions() : renderSearch()}
        </View>
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
    locationStatus === 'checking' ||
    locationStatus === 'requesting' ||
    locationStatus === 'detecting' ||
    locationStatus === 'updating';
  const isLocationReady = locationStatus === 'ready' && !!coords;
  const showPermissionBanner =
    !skipLocation &&
    (locationStatus === 'denied' || locationStatus === 'blocked' || locationStatus === 'error');

  const {
    data: allStores,
    isLoading: allLoading,
    error: allError,
    refetch: refetchAll,
  } = useAllStores();

  const {
    data: nearbyStores,
    isLoading: nearbyLoading,
    error: nearbyError,
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
            style={({ pressed }) => [styles.locationRow, pressed && styles.locationRowPressed]}
            onPress={() => void openLocationPicker()}
            hitSlop={8}
          >
            <Text style={styles.locationName} numberOfLines={1}>
              {locationName ?? 'Current Location'}
            </Text>
            <ChevronDown size={15} color={C.secondary} strokeWidth={2.5} />
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.locationRow, pressed && styles.locationRowPressed]}
            onPress={() => void openLocationPicker()}
            hitSlop={8}
          >
            <Text style={styles.locationEmpty}>Set browsing area</Text>
            <ChevronDown size={15} color={C.muted} strokeWidth={2} />
          </Pressable>
        )}

        {isLocationReady && (
          <Text style={styles.locationContext}>Viewing stores in this area</Text>
        )}
      </View>

      <Pressable
        style={({ pressed }) => [styles.bellBtn, pressed && styles.bellBtnPressed]}
        hitSlop={12}
      >
        <Bell size={20} color={C.primary} strokeWidth={1.7} />
      </Pressable>
    </View>
  );

  // ── Search Bar ─────────────────────────────────────────────────────────────

  const renderSearchBar = () => (
    <View style={styles.searchWrap}>
      <View style={styles.searchBar}>
        <Search size={16} color={C.secondary} strokeWidth={2} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search stores or categories"
          placeholderTextColor={C.muted}
          value={query}
          onChangeText={handleQueryChange}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="never"
        />
        {query.length > 0 ? (
          <Pressable onPress={clearSearch} hitSlop={8} style={styles.searchClearBtn}>
            {searchLoading ? (
              <ActivityIndicator size="small" color={C.accent} />
            ) : (
              <X size={14} color={C.muted} strokeWidth={2.5} />
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
          <AlertCircle size={18} color={C.muted} strokeWidth={1.5} />
          <Text style={styles.errorText}>
            {(error as Error)?.message ?? 'Failed to load stores.'}
          </Text>
          <Pressable onPress={() => void refetchAll()} style={styles.retryBtn}>
            <RefreshCw size={13} color={C.accent} strokeWidth={2} />
            <Text style={styles.retryBtnText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    if (!stores || stores.length === 0) {
      return <EmptyState title={emptyTitle} subtitle={emptySub} />;
    }
    return stores.map((s) => <StoreCard key={s.id} store={s} />);
  };

  // ── Search Results ─────────────────────────────────────────────────────────

  const renderSearchResults = () => (
    <View style={styles.section}>
      <SectionHeader title="Search Results" count={searchResults?.length} />
      {searchLoading
        ? renderSkeletons(2)
        : !searchResults || searchResults.length === 0
        ? <EmptyState title="No stores found" subtitle={`No results for "${debouncedQuery}"`} />
        : searchResults.map((s) => <StoreCard key={s.id} store={s} />)
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
            <SectionHeader title="Nearby" count={nearbyStores?.length} />
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
          <SectionHeader title="All Stores" count={allStores?.length} />
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
    paddingTop: 10,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: 11,
    fontWeight: '400',
    color: C.muted,
    letterSpacing: 0.1,
    marginBottom: 3,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationRowPressed: { opacity: 0.6 },
  locationName: {
    fontSize: 20,
    fontWeight: '700',
    color: C.primary,
    flexShrink: 1,
    letterSpacing: -0.6,
    lineHeight: 24,
  },
  locationLoading: {
    fontSize: 18,
    fontWeight: '600',
    color: C.secondary,
    letterSpacing: -0.3,
  },
  locationEmpty: {
    fontSize: 18,
    fontWeight: '600',
    color: C.secondary,
    letterSpacing: -0.3,
  },
  locationContext: {
    fontSize: 12,
    color: C.muted,
    fontWeight: '400',
    marginTop: 3,
    letterSpacing: 0.1,
  },
  bellBtn: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 14,
    marginTop: 2,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      android: { elevation: 1 },
    }),
  },
  bellBtnPressed: { backgroundColor: C.border },

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
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
    }),
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.bg,
    borderRadius: 14,
    height: 46,
    paddingHorizontal: 14,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: C.primary,
    paddingVertical: 0,
  },
  searchClearBtn: { padding: 4 },

  // ── Content ──
  content: { paddingBottom: 52 },
  section: { marginTop: 4 },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: C.primary,
    letterSpacing: -0.4,
  },
  sectionCountInline: {
    fontSize: 13,
    fontWeight: '400',
    color: C.muted,
    letterSpacing: 0,
  },

  // ── Store Card ──
  card: {
    backgroundColor: C.surface,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 18,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.09,
        shadowRadius: 14,
      },
      android: { elevation: 3 },
    }),
  },
  cardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  banner: {
    height: 180,
    position: 'relative',
    overflow: 'hidden',
  },
  bannerFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  bannerFallbackInitial: {
    fontSize: 52,
    fontWeight: '700',
    color: 'rgba(0,0,0,0.15)',
    letterSpacing: -2,
    lineHeight: 56,
  },
  bannerFallbackLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(0,0,0,0.25)',
    letterSpacing: 0.3,
  },
  bannerPhotoScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.04)',
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
        shadowOpacity: 0.1,
        shadowRadius: 3,
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
  cardBody: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardName: {
    fontSize: 16,
    fontWeight: '700',
    color: C.primary,
    letterSpacing: -0.4,
    flex: 1,
    marginRight: 8,
  },
  distancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  distancePillText: {
    fontSize: 12,
    fontWeight: '500',
    color: C.muted,
  },
  categoryTag: {
    alignSelf: 'flex-start',
    backgroundColor: C.bg,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 10,
  },
  categoryTagText: {
    fontSize: 11,
    fontWeight: '500',
    color: C.secondary,
    textTransform: 'capitalize',
    letterSpacing: 0.2,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  metaDot: {
    fontSize: 12,
    color: C.border,
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
    marginHorizontal: 16,
    marginTop: 20,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
      },
      android: { elevation: 1 },
    }),
  },
  permissionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  permissionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.accentSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  permissionText: { flex: 1, gap: 2 },
  permissionTitle: {
    fontSize: 13,
    fontWeight: '600',
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
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    flex: 1,  // required so children with flex:1 (the results ScrollView) have a parent dimension to fill
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    // Same height for both options and search views — no layout snap on switch.
    // 88% gives enough room for the keyboard + results without the sheet
    // dominating the whole screen when showing options.
    maxHeight: '88%',
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#C8C8CE',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetTitleBlock: {
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.primary,
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  sheetSubtitle: {
    fontSize: 13,
    color: C.muted,
    lineHeight: 18,
  },
  sheetOptionGroup: {
    backgroundColor: C.bg,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
  },
  sheetOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  sheetOptionPressed: {
    backgroundColor: C.divider,
  },
  sheetOptionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginLeft: 62,
  },
  sheetOptionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
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
    backgroundColor: C.bg,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: C.border,
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
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },
  sheetRecentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  sheetRecentIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: C.bg,
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
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetSearchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.bg,
    borderRadius: 12,
    height: 44,
    paddingHorizontal: 12,
    gap: 8,
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
    paddingHorizontal: 8,
    borderRadius: 12,
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
    paddingVertical: 32,
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
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: C.secondary,
    textAlign: 'center',
    marginBottom: 4,
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
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 8,
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
    paddingHorizontal: 20,
    height: 40,
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

import { useCallback, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertCircle, ArrowLeft } from 'lucide-react-native';
import { useStoreDetail, useStoreMenu } from '@/hooks/useStores';
import { StoreHeader } from '@/components/store/StoreHeader';
import { StoreInfoSection } from '@/components/store/StoreInfoSection';
import { CategoryTabs } from '@/components/store/CategoryTabs';
import { MenuItemCard } from '@/components/store/MenuItemCard';
import { StoreSkeleton } from '@/components/store/StoreSkeleton';
import { C, BANNER_HEIGHT } from '@/components/store/theme';
import type { MenuCategory } from '@/types/store';

// ── Top bar ───────────────────────────────────────────────────────────────────
// Title fades in after the user scrolls past the banner.
// Back button is always visible.

interface TopBarProps {
  title: string | undefined;
  titleOpacity: Animated.AnimatedInterpolation<number>;
  onBack: () => void;
}

function TopBar({ title, titleOpacity, onBack }: TopBarProps) {
  return (
    <View style={styles.topBar}>
      <Pressable style={styles.backBtn} onPress={onBack} hitSlop={12}>
        <ArrowLeft size={20} color={C.primary} strokeWidth={2} />
      </Pressable>
      {title ? (
        <Animated.Text
          style={[styles.topBarTitle, { opacity: titleOpacity }]}
          numberOfLines={1}
        >
          {title}
        </Animated.Text>
      ) : null}
    </View>
  );
}

// ── Error state ───────────────────────────────────────────────────────────────

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.center}>
      <AlertCircle size={36} color={C.muted} strokeWidth={1.5} />
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.errorSub}>{message}</Text>
      <Pressable style={styles.retryBtn} onPress={onRetry}>
        <Text style={styles.retryText}>Try again</Text>
      </Pressable>
    </View>
  );
}

// ── Menu section ──────────────────────────────────────────────────────────────

function MenuSection({
  categories,
  selectedId,
}: {
  categories: MenuCategory[];
  selectedId: number | null;
}) {
  const visible =
    selectedId === null
      ? categories
      : categories.filter((c) => c.id === selectedId);

  const hasItems = visible.some((c) => c.items.length > 0);

  if (!hasItems) {
    return (
      <View style={styles.menuEmpty}>
        <Text style={styles.menuEmptyText}>No items in this category</Text>
      </View>
    );
  }

  return (
    <>
      {visible.map((cat) =>
        cat.items.length === 0 ? null : (
          <View key={cat.id}>
            {selectedId === null && categories.length > 1 ? (
              <Text style={styles.catHeading}>{cat.name}</Text>
            ) : null}
            <View style={styles.menuCard}>
              {cat.items.map((item, idx) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  isLast={idx === cat.items.length - 1}
                />
              ))}
            </View>
          </View>
        ),
      )}
    </>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function StoreDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Scroll-aware top bar
  const scrollY = useRef(new Animated.Value(0)).current;
  const titleOpacity = scrollY.interpolate({
    inputRange: [BANNER_HEIGHT - 60, BANNER_HEIGHT - 10],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const {
    data: store,
    isLoading: storeLoading,
    isError: storeError,
    error: storeErr,
    refetch: refetchStore,
  } = useStoreDetail(id ?? '');

  const {
    data: categories,
    isLoading: menuLoading,
    isError: menuError,
    refetch: refetchMenu,
  } = useStoreMenu(id ?? '');

  const isLoading = storeLoading || menuLoading;

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([refetchStore(), refetchMenu()]);
    setIsRefreshing(false);
  }, [refetchStore, refetchMenu]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <TopBar
          title={undefined}
          titleOpacity={new Animated.Value(0)}
          onBack={handleBack}
        />
        <Animated.ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <StoreSkeleton />
        </Animated.ScrollView>
      </SafeAreaView>
    );
  }

  // ── Store error ───────────────────────────────────────────────────────────
  if (storeError || !store) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <TopBar
          title={undefined}
          titleOpacity={new Animated.Value(0)}
          onBack={handleBack}
        />
        <ErrorState
          message={(storeErr as Error)?.message ?? 'Could not load store details.'}
          onRetry={() => void refetchStore()}
        />
      </SafeAreaView>
    );
  }

  const cats = categories ?? [];

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Top bar — back always visible; title fades in after scroll */}
      <TopBar
        title={store.name}
        titleOpacity={titleOpacity}
        onBack={handleBack}
      />

      <Animated.ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        // stickyHeaderIndices: [2] is always CategoryTabs.
        // StoreInfoSection is wrapped in a View at [1] so the index never shifts.
        stickyHeaderIndices={cats.length > 0 ? [2] : undefined}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void handleRefresh()}
            tintColor={C.accent}
            colors={[C.accent]}
          />
        }
      >
        {/* [0] Banner + name + status + address + directions */}
        <StoreHeader store={store} />

        {/* [1] Timings + description + phone — wrapped in View so [2] is stable */}
        <View>
          <StoreInfoSection store={store} />
        </View>

        {/* [2] Category tabs — sticky */}
        <CategoryTabs
          categories={cats}
          selectedId={selectedCategoryId}
          onSelect={setSelectedCategoryId}
        />

        {/* [3] Menu */}
        {menuError ? (
          <View style={styles.menuErrorWrap}>
            <Text style={styles.menuErrorText}>Could not load menu</Text>
            <Pressable onPress={() => void refetchMenu()}>
              <Text style={styles.menuErrorRetry}>Retry</Text>
            </Pressable>
          </View>
        ) : cats.length === 0 ? (
          <View style={styles.menuEmpty}>
            <Text style={styles.menuEmptyText}>No menu available</Text>
          </View>
        ) : (
          <MenuSection categories={cats} selectedId={selectedCategoryId} />
        )}

        <View style={styles.bottomPad} />
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
    gap: 12,
    minHeight: 52,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 },
      android: { elevation: 3 },
    }),
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: C.primary,
    flex: 1,
    letterSpacing: -0.2,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },

  // Error / empty
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 40,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: C.primary,
    marginTop: 8,
  },
  errorSub: {
    fontSize: 13,
    color: C.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: 10,
    backgroundColor: C.accent,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 22,
  },
  retryText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // Menu
  catHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: C.primary,
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 6,
    letterSpacing: -0.1,
  },
  menuCard: {
    backgroundColor: C.surface,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  menuEmpty: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  menuEmptyText: {
    fontSize: 14,
    color: C.muted,
  },
  menuErrorWrap: {
    alignItems: 'center',
    paddingVertical: 36,
    gap: 8,
  },
  menuErrorText: {
    fontSize: 14,
    color: C.secondary,
  },
  menuErrorRetry: {
    fontSize: 14,
    fontWeight: '600',
    color: C.accent,
  },
  bottomPad: {
    height: 48,
  },
});

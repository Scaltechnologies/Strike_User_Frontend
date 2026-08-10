import { useCallback } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CreditCard } from 'lucide-react-native';
import { useStoreCards } from '@/hooks/useCards';
import { useMyActiveSubscriptions } from '@/hooks/useSubscriptions';
import { CardListItem } from '@/components/cards/CardListItem';
import { CardListSkeleton } from '@/components/cards/CardSkeleton';
import { C } from './theme';
import type { MenuCategory } from '@/types/store';
import type { CardDefinition } from '@/types/card';

interface Props {
  storeId: string | number;
  // Menu categories from the parent — used to resolve category names from card.categoryIds.
  // Already fetched upstream, so this adds no extra network calls.
  categories: MenuCategory[];
}

// ── Empty state ───────────────────────────────────────────────────────────────

function NoCardsState() {
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyText}>No meal cards available for this store yet.</Text>
    </View>
  );
}

// ── Error state ───────────────────────────────────────────────────────────────

function CardsErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyText}>Couldn't load cards.</Text>
      <Pressable onPress={onRetry} hitSlop={8}>
        <Text style={styles.retryText}>Retry</Text>
      </Pressable>
    </View>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

export function AvailableCardsSection({ storeId, categories }: Props) {
  const router = useRouter();

  const {
    data: cards,
    isLoading,
    isError,
    refetch,
  } = useStoreCards(storeId);

  const { data: activeSubscriptions } = useMyActiveSubscriptions();

  const ownedCardIds = new Set(
    (activeSubscriptions ?? []).map((s) => s.cardDefinitionId),
  );

  const activeCards = (cards ?? []).filter((c) => c.isActive);

  const renderCard = useCallback(
    ({ item }: { item: CardDefinition }) => (
      <CardListItem
        card={item}
        categories={categories}
        isOwned={ownedCardIds.has(item.id)}
        onPress={() => router.push(`/cards/${item.id}` as never)}
      />
    ),
    [categories, router, ownedCardIds],
  );

  return (
    <View style={styles.root}>
      {/* Section header */}
      <View style={styles.header}>
        <CreditCard size={15} color={C.accent} strokeWidth={2.2} />
        <Text style={styles.headerTitle}>Available Cards</Text>
      </View>

      {/* Content area */}
      {isLoading ? (
        <View style={styles.skeletonRow}>
          <CardListSkeleton />
          <CardListSkeleton />
        </View>
      ) : isError ? (
        <CardsErrorState onRetry={() => void refetch()} />
      ) : activeCards.length === 0 ? (
        <NoCardsState />
      ) : (
        <FlatList
          data={activeCards}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderCard}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          // Snap so cards feel deliberate, not chaotic
          snapToInterval={232}
          decelerationRate="fast"
          removeClippedSubviews={false}
        />
      )}

      {/* Divider toward menu */}
      <View style={styles.divider} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: C.bg,
    paddingTop: 20,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.primary,
    letterSpacing: -0.3,
  },

  // Horizontal list padding so first/last cards align with screen edge
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },

  // Skeleton row (before FlatList renders)
  skeletonRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },

  // Empty / error states
  emptyWrap: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    gap: 4,
  },
  emptyText: {
    fontSize: 13,
    color: C.muted,
    lineHeight: 19,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.accent,
  },

  // Visual separator before the menu tabs
  divider: {
    marginTop: 20,
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginHorizontal: 16,
  },
});

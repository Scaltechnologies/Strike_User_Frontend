import { memo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { MapPin, Navigation } from 'lucide-react-native';
import { formatDistance, openDirections } from '@/utils/maps';
import { C, BANNER_HEIGHT, storeFallbackColor } from './theme';
import type { Store } from '@/types/store';

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Store['status'] }) {
  const cfg = {
    ACTIVE:             { label: 'Open Now',           color: C.successText, bg: C.successBg  },
    INACTIVE:           { label: 'Closed',              color: C.dangerText,  bg: C.dangerBg   },
    TEMPORARILY_CLOSED: { label: 'Temporarily Closed',  color: C.warningText, bg: C.warningBg  },
  }[status];

  return (
    <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
      <View style={[styles.statusDot, { backgroundColor: cfg.color }]} />
      <Text style={[styles.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

// ── Banner ────────────────────────────────────────────────────────────────────

function Banner({ store }: { store: Store }) {
  if (store.logoUrl) {
    return (
      <Image
        source={{ uri: store.logoUrl }}
        style={styles.banner}
        contentFit="cover"
        transition={300}
      />
    );
  }
  // Fallback: deterministic pastel background + store initials
  const initials = store.name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <View style={[styles.banner, { backgroundColor: storeFallbackColor(store.name) }]}>
      <Text style={styles.fallbackInitials}>{initials}</Text>
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  store: Store;
}

export const StoreHeader = memo(function StoreHeader({ store }: Props) {
  return (
    <View>
      {/* Banner */}
      <View style={styles.bannerWrap}>
        <Banner store={store} />
      </View>

      {/* Meta */}
      <View style={styles.meta}>
        {/* Store name */}
        <Text style={styles.name} numberOfLines={2}>{store.name}</Text>

        {/* Status + category row */}
        <View style={styles.badgeRow}>
          <StatusBadge status={store.status} />
          <View style={styles.categoryPill}>
            <Text style={styles.categoryText}>{store.category}</Text>
          </View>
        </View>

        {/* Distance — prominent, right below status */}
        {store.distanceKm != null ? (
          <View style={styles.distanceRow}>
            <MapPin size={12} color={C.accent} strokeWidth={2} />
            <Text style={styles.distanceText}>{formatDistance(store.distanceKm)}</Text>
          </View>
        ) : null}

        {/* Divider */}
        <View style={styles.divider} />

        {/* Address + Directions */}
        <View style={styles.locationRow}>
          <View style={styles.locationLeft}>
            <View style={styles.addressLine}>
              <MapPin size={13} color={C.muted} strokeWidth={1.8} style={styles.pinIcon} />
              <Text style={styles.address} numberOfLines={2}>{store.address}</Text>
            </View>
          </View>

          {store.latitude != null && store.longitude != null ? (
            <Pressable
              style={styles.directionsBtn}
              onPress={() => openDirections(store.latitude!, store.longitude!)}
              android_ripple={{ color: C.accentSoft, borderless: false, radius: 12 }}
            >
              <Navigation size={14} color={C.accent} strokeWidth={2.2} />
              <Text style={styles.directionsBtnText}>Directions</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  bannerWrap: {
    height: BANNER_HEIGHT,
    overflow: 'hidden',
    backgroundColor: '#E8EDF5',
  },
  banner: {
    width: '100%',
    height: '100%',
  },
  fallbackInitials: {
    position: 'absolute',
    alignSelf: 'center',
    top: '28%',
    fontSize: 56,
    fontWeight: '800',
    color: '#3A3A4A',
    opacity: 0.18,
    letterSpacing: 4,
  },
  meta: {
    backgroundColor: C.surface,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
    ...Platform.select({
      android: { elevation: 2 },
    }),
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: C.primary,
    letterSpacing: -0.4,
    lineHeight: 28,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  categoryPill: {
    backgroundColor: C.bg,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '500',
    color: C.secondary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginVertical: 16,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  locationLeft: {
    flex: 1,
    gap: 5,
  },
  addressLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  pinIcon: {
    marginTop: 2,
    flexShrink: 0,
  },
  address: {
    fontSize: 13,
    color: C.secondary,
    flex: 1,
    lineHeight: 19,
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
  },
  distanceText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.secondary,
  },
  directionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: C.accentSoft,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    flexShrink: 0,
    alignSelf: 'flex-start',
  },
  directionsBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.accent,
  },
});

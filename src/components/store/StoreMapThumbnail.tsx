// Small map-preview affordance beside the store name. This is a deliberately
// illustrated card, not a live map: tile.openstreetmap.org started returning
// its 403 "blocked" tile image (their usage policy disallows hotlinking raw
// tiles like this without heavy caching), and the keyless staticmap mirror
// tried before that was flaky too. An illustration needs no network call, so
// it always renders instantly and never shows a broken/blocked state.
// Tapping it still opens real turn-by-turn directions.

import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { Navigation } from 'lucide-react-native';
import { openDirections } from '@/utils/maps';
import { C, MAP_THUMB_SIZE } from './theme';

interface Props {
  latitude: number;
  longitude: number;
}

const ROAD = 'rgba(85, 104, 145, 0.16)';
const ROAD_SOFT = 'rgba(85, 104, 145, 0.09)';

export const StoreMapThumbnail = memo(function StoreMapThumbnail({ latitude, longitude }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
      onPress={() => openDirections(latitude, longitude)}
      hitSlop={4}
    >
      <LinearGradient
        colors={['#EAF0FB', '#F7EFEC']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Abstract streets + city blocks — decorative, not a real map */}
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        style={StyleSheet.absoluteFill}
      >
        <Path d="M-4,32 C22,18 44,48 104,30" stroke={ROAD} strokeWidth={3.2} strokeLinecap="round" fill="none" />
        <Path d="M68,-4 C56,24 88,52 62,104" stroke={ROAD} strokeWidth={3.2} strokeLinecap="round" fill="none" />
        <Path d="M-4,78 C24,68 30,88 60,80" stroke={ROAD_SOFT} strokeWidth={2.4} strokeLinecap="round" fill="none" />
        <Path d="M8,50 L20,50 L20,62 L8,62 Z" fill={ROAD_SOFT} />
        <Path d="M74,66 L90,66 L90,80 L74,80 Z" fill={ROAD_SOFT} />
        {/* Dashed route sweeping in toward the pin */}
        <Path
          d="M6,92 Q34,74 49,54"
          stroke={C.accent}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeDasharray="1.5,6.5"
          fill="none"
          opacity={0.55}
        />
      </Svg>

      {/* Location pulse marker */}
      <View style={styles.markerWrap} pointerEvents="none">
        <View style={styles.markerRing} />
        <LinearGradient
          colors={[C.accent, C.accentDeep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.markerDot}
        >
          <View style={styles.markerCore} />
        </LinearGradient>
      </View>

      <View style={styles.navBadge}>
        <Navigation size={11} color="#FFFFFF" strokeWidth={2.6} />
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  wrap: {
    width: MAP_THUMB_SIZE,
    height: MAP_THUMB_SIZE,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E3E9F7',
    flexShrink: 0,
    shadowColor: '#3A4A6B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  pressed: { opacity: 0.92 },
  markerWrap: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 36,
    height: 36,
    marginLeft: -18,
    marginTop: -18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  markerRing: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(214, 53, 39, 0.16)',
  },
  markerDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  markerCore: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  navBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.accent,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
});

// Full-screen "Pick on map" flow for Set Location. The pin stays fixed at
// screen center while the map pans underneath it (the standard Uber/Swiggy-
// style picker pattern) — onRegionChangeComplete reverse-geocodes the
// settled center via the same device-native geocoder useLocation.ts already
// uses, and Confirm hands the result to the exact same applyLocation() path
// as every other Set Location source (history, search) — no separate sync
// logic here.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Modal, Platform, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import * as ExpoLocation from 'expo-location';
import { BlurView } from 'expo-blur';
import { Locate, MapPin, X } from 'lucide-react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { FadeInView } from '@/components/ui/FadeInView';
import { useAppStore } from '@/store/appStore';
import { tapLight, tapSelect } from '@/utils/haptics';
import { ManropeWeights } from '@/constants/theme';

// Kept in sync with the palette defined locally in app/(tabs)/index.tsx —
// duplicated rather than imported since that file doesn't export its C/
// SPACING consts (same tradeoff FadeInView/PressableScale's header comments
// already document for this codebase).
const C = {
  accent: '#D63527',
  accentDeep: '#B02A1E',
  primary: '#0D0D0D',
  secondary: '#5C5C5C',
  muted: '#AEAEB2',
  surface: '#FFFFFF',
  border: '#E5E5EA',
  bg: '#F2F2F7',
} as const;

const DEFAULT_CENTER = { latitude: 20.5937, longitude: 78.9629 }; // India, country-level fallback
const PICK_DELTA = 0.05; // ~5km-wide initial view — close enough to read street/locality names
const RECENTER_DELTA = 0.01;

interface MapLocationPickerProps {
  visible: boolean;
  initialCoords: { latitude: number; longitude: number } | null;
  onClose: () => void;
  onConfirm: (latitude: number, longitude: number, name: string) => void;
}

export function MapLocationPicker({ visible, initialCoords, onClose, onConfirm }: MapLocationPickerProps) {
  const mapRef = useRef<MapView>(null);
  const resolveGenRef = useRef(0);

  const [centerCoords, setCenterCoords] = useState(initialCoords ?? DEFAULT_CENTER);
  const [isMoving, setIsMoving] = useState(false);
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [locationPermissionGranted] = useState(
    () => useAppStore.getState().locationPermission === 'granted',
  );

  const pinLift = useRef(new Animated.Value(0)).current;

  // Fresh jump to the current known location every time the picker opens —
  // MapView stays mounted across opens (so Modal's own slide animation has
  // real content to animate), this just re-centers it instantly (duration 0)
  // rather than leaving it wherever the user last panned it to.
  useEffect(() => {
    if (!visible) return;
    const target = initialCoords ?? DEFAULT_CENTER;
    setCenterCoords(target);
    setResolvedName(null);
    setResolving(false);
    mapRef.current?.animateToRegion({ ...target, latitudeDelta: PICK_DELTA, longitudeDelta: PICK_DELTA }, 0);
  }, [visible, initialCoords]);

  useEffect(() => {
    Animated.spring(pinLift, {
      toValue: isMoving ? 1 : 0,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6,
    }).start();
  }, [isMoving, pinLift]);

  const handleRegionChange = useCallback(() => setIsMoving(true), []);

  const handleRegionChangeComplete = useCallback(async (region: Region) => {
    const { latitude, longitude } = region;
    setCenterCoords({ latitude, longitude });
    setIsMoving(false);

    const gen = ++resolveGenRef.current;
    setResolving(true);
    try {
      const [place] = await ExpoLocation.reverseGeocodeAsync({ latitude, longitude });
      if (gen !== resolveGenRef.current) return;
      const name = place?.district ?? place?.subregion ?? place?.city ?? place?.region ?? null;
      setResolvedName(name);
    } catch {
      if (gen !== resolveGenRef.current) return;
      setResolvedName(null);
    } finally {
      if (gen === resolveGenRef.current) setResolving(false);
    }
  }, []);

  const handleRecenter = useCallback(async () => {
    tapLight();
    const stored = useAppStore.getState().coords;
    if (stored) {
      mapRef.current?.animateToRegion(
        { ...stored, latitudeDelta: RECENTER_DELTA, longitudeDelta: RECENTER_DELTA }, 500,
      );
      return;
    }
    try {
      const loc = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced });
      mapRef.current?.animateToRegion(
        {
          latitude: loc.coords.latitude, longitude: loc.coords.longitude,
          latitudeDelta: RECENTER_DELTA, longitudeDelta: RECENTER_DELTA,
        },
        500,
      );
    } catch {
      // Recenter is a convenience, not critical — silent no-op on failure.
    }
  }, []);

  const handleConfirm = useCallback(async () => {
    tapSelect();
    setConfirming(true);
    let name = resolvedName;
    if (!name) {
      try {
        const [place] = await ExpoLocation.reverseGeocodeAsync(centerCoords);
        name = place?.district ?? place?.subregion ?? place?.city ?? place?.region ?? null;
      } catch {
        name = null;
      }
    }
    setConfirming(false);
    onConfirm(centerCoords.latitude, centerCoords.longitude, name ?? 'Selected location');
  }, [centerCoords, resolvedName, onConfirm]);

  const pinTranslateY = pinLift.interpolate({ inputRange: [0, 1], outputRange: [0, -16] });
  const shadowScale = pinLift.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] });
  const shadowOpacity = pinLift.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.12] });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          provider={PROVIDER_GOOGLE}
          initialRegion={{ ...(initialCoords ?? DEFAULT_CENTER), latitudeDelta: PICK_DELTA, longitudeDelta: PICK_DELTA }}
          onRegionChange={handleRegionChange}
          onRegionChangeComplete={handleRegionChangeComplete}
          showsUserLocation={locationPermissionGranted}
          showsMyLocationButton={false}
          showsCompass={false}
          rotateEnabled={false}
        />

        {/* Fixed center pin — the map moves, this doesn't. Pin renders above
            its own shadow ellipse (column layout, in that order) so it reads
            as "dropped onto" the point beneath it; both lift/shrink together
            while panning, then settle back down on release. */}
        <View style={styles.pinWrap} pointerEvents="none">
          <Animated.View style={[styles.pin, { transform: [{ translateY: pinTranslateY }] }]}>
            <MapPin size={40} color="#FFFFFF" fill={C.accent} strokeWidth={1.5} />
          </Animated.View>
          <Animated.View style={[styles.pinShadow, { opacity: shadowOpacity, transform: [{ scale: shadowScale }] }]} />
        </View>

        <SafeAreaView style={styles.topBar} edges={['top']} pointerEvents="box-none">
          <Pressable onPress={onClose} hitSlop={12}>
            <BlurView intensity={60} tint="light" style={styles.closeBtn}>
              <X size={18} color={C.primary} strokeWidth={2.5} />
            </BlurView>
          </Pressable>
        </SafeAreaView>

        <SafeAreaView style={styles.bottomArea} edges={['bottom']} pointerEvents="box-none">
          <Pressable onPress={handleRecenter} hitSlop={10} style={styles.recenterBtn}>
            <BlurView intensity={70} tint="light" style={styles.recenterBlur}>
              <Locate size={19} color={C.accent} strokeWidth={2.2} />
            </BlurView>
          </Pressable>

          <FadeInView style={styles.confirmCard} translateYFrom={16}>
            <View style={styles.confirmLabelRow}>
              {resolving ? (
                <>
                  <ActivityIndicator size="small" color={C.muted} />
                  <Text style={styles.confirmLabelMuted}>Finding address…</Text>
                </>
              ) : (
                <Text style={styles.confirmLabel} numberOfLines={1}>
                  {resolvedName ?? 'Drag the map to set a pin'}
                </Text>
              )}
            </View>
            <PressableScale style={styles.confirmBtn} onPress={handleConfirm} disabled={confirming}>
              {confirming ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmBtnText}>Confirm this location</Text>
              )}
            </PressableScale>
          </FadeInView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const PIN_SIZE = 40; // matches the MapPin icon's `size` prop above

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  topBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  closeBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  pinWrap: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    alignItems: 'center',
    // The icon's own tip (its bottom point) — not the wrapping group's
    // bottom — is what needs to land on screen center, so this only
    // offsets by the pin's own height; the shadow sits just below that.
    marginTop: -PIN_SIZE,
  },
  pin: {
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 6 },
    }),
  },
  pinShadow: {
    width: 16,
    height: 6,
    borderRadius: 8,
    backgroundColor: '#000000',
    marginTop: 6,
  },
  bottomArea: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    paddingHorizontal: 20,
    alignItems: 'flex-end',
  },
  recenterBtn: {
    marginBottom: 14,
  },
  recenterBlur: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  confirmCard: {
    width: '100%',
    backgroundColor: C.surface,
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: -4 } },
      android: { elevation: 10 },
    }),
  },
  confirmLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    minHeight: 18,
  },
  confirmLabel: {
    fontSize: 14,
    fontFamily: ManropeWeights.semiBold,
    color: C.primary,
    flex: 1,
  },
  confirmLabelMuted: {
    fontSize: 13,
    fontFamily: ManropeWeights.regular,
    color: C.muted,
  },
  confirmBtn: {
    backgroundColor: C.accent,
    borderRadius: 16,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmBtnText: {
    fontSize: 14.5,
    fontFamily: ManropeWeights.bold,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});

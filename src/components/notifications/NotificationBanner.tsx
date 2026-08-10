// Global toast-style banner rendered once at the app root. Reacts to
// notificationStore's queue and shows one item at a time, sliding down from
// under the status bar, auto-dismissing after its duration (or on tap).

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, Bell, CheckCircle2, XCircle } from 'lucide-react-native';
import { useNotificationStore, type NotificationBannerItem, type NotificationType } from '@/store/notificationStore';

const TYPE_CONFIG: Record<NotificationType, { color: string; soft: string; Icon: typeof Bell }> = {
  success: { color: '#1C7A3C', soft: '#EAF7EF', Icon: CheckCircle2 },
  error:   { color: '#C0261A', soft: '#FEF0EE', Icon: XCircle },
  warning: { color: '#946200', soft: '#FFF5E0', Icon: AlertTriangle },
  info:    { color: '#0369A1', soft: '#EFF6FF', Icon: Bell },
};

export function NotificationBanner() {
  const queue = useNotificationStore((s) => s.queue);
  const dismiss = useNotificationStore((s) => s.dismiss);
  const insets = useSafeAreaInsets();

  const [current, setCurrent] = useState<NotificationBannerItem | null>(null);
  const translateY = useRef(new Animated.Value(-160)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pull the next queued item once the current one has fully exited.
  useEffect(() => {
    if (!current && queue.length > 0) {
      setCurrent(queue[0]);
    }
  }, [queue, current]);

  useEffect(() => {
    if (!current) return;

    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();

    timerRef.current = setTimeout(() => handleDismiss(current.id), current.duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [current]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleDismiss(id: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.parallel([
      Animated.timing(translateY, { toValue: -160, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => {
      dismiss(id);
      setCurrent(null);
    });
  }

  if (!current) return null;

  const { color, soft, Icon } = TYPE_CONFIG[current.type];

  return (
    <View style={[styles.wrap, { top: insets.top + 8 }]} pointerEvents="box-none">
      <Animated.View style={[styles.card, { opacity, transform: [{ translateY }] }]}>
        <Pressable style={styles.pressable} onPress={() => handleDismiss(current.id)}>
          <View style={[styles.iconWrap, { backgroundColor: soft }]}>
            <Icon size={20} color={color} strokeWidth={2.2} />
          </View>
          <View style={styles.textWrap}>
            <Text style={styles.title} numberOfLines={1}>{current.title}</Text>
            {current.message ? (
              <Text style={styles.message} numberOfLines={2}>{current.message}</Text>
            ) : null}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  card: {
    width: '92%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 20,
      },
      android: { elevation: 10 },
    }),
  },
  pressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  textWrap: { flex: 1, gap: 2 },
  title: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0D0D0D',
    letterSpacing: -0.2,
  },
  message: {
    fontSize: 12.5,
    color: '#6C6C6C',
    fontWeight: '500',
    lineHeight: 17,
  },
});

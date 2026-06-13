// Entry point — branded splash during auth bootstrap, then redirects.
// Enforces a minimum display time so the brand mark is always visible.

import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect } from 'expo-router';

import { ROUTES } from '@/constants/routes';
import { useAuthStore } from '@/store/authStore';

const MIN_SPLASH_MS = 1200;

export default function Index() {
  const { isBootstrapping, isAuthenticated } = useAuthStore();
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();

    const t = setTimeout(() => setMinTimeElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(t);
  }, [fadeAnim]);

  if (!isBootstrapping && minTimeElapsed) {
    return isAuthenticated
      ? <Redirect href={ROUTES.TABS.HOME} />
      : <Redirect href={ROUTES.AUTH.LOGIN} />;
  }

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.logoBlock, { opacity: fadeAnim }]}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>S</Text>
        </View>
        <Text style={styles.appName}>STRIKE</Text>
        <Text style={styles.tagline}>Meal Cards. Simplified.</Text>
      </Animated.View>

      <ActivityIndicator
        size="small"
        color="#C0392B"
        style={styles.spinner}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF0E6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoBlock: {
    alignItems: 'center',
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#C0392B',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#C0392B',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  badgeText: {
    fontSize: 38,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1A1A1A',
    letterSpacing: 6,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 14,
    color: '#888888',
    letterSpacing: 0.5,
  },
  spinner: {
    position: 'absolute',
    bottom: 80,
  },
});

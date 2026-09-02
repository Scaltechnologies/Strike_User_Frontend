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
import { Image } from 'expo-image';
import { Redirect } from 'expo-router';

import { ROUTES, buildRoute } from '@/constants/routes';
import { useAuthStore } from '@/store/authStore';
import { storageService } from '@/services/storageService';

const MIN_SPLASH_MS = 1200;

export default function Index() {
  const { isBootstrapping, isAuthenticated } = useAuthStore();
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [resumeChecked, setResumeChecked] = useState(false);
  const [resumePaymentId, setResumePaymentId] = useState<number | null>(null);
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

  // Resume an in-flight Pay-at-Store checkout after a cold launch — the QR/code only ever
  // exist locally (the backend never re-serves them), so this is the one place that can
  // recover them instead of stranding the user on a payment they can no longer see. Only
  // auto-jumps in when there's exactly ONE open payment — with several, land on Home instead
  // and let the persistent tracker bar (which surfaces all of them) handle it, rather than
  // guessing which one the user wants first.
  useEffect(() => {
    if (isBootstrapping) return;
    if (!isAuthenticated) {
      setResumeChecked(true);
      return;
    }
    storageService.getPayAtStoreSessions().then((sessions) => {
      setResumePaymentId(sessions.length === 1 ? sessions[0].paymentId : null);
      setResumeChecked(true);
    });
  }, [isBootstrapping, isAuthenticated]);

  if (!isBootstrapping && minTimeElapsed && resumeChecked) {
    if (!isAuthenticated) return <Redirect href={ROUTES.AUTH.LOGIN} />;
    if (resumePaymentId != null) {
      return <Redirect href={buildRoute.payAtStore(resumePaymentId)} />;
    }
    return <Redirect href={ROUTES.TABS.HOME} />;
  }

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.logoBlock, { opacity: fadeAnim }]}>
        <Image
          source={require('@/assets/images/icon.png')}
          style={styles.badge}
          contentFit="contain"
        />
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

import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CalendarClock,
  Gift,
  ShieldAlert,
  Ticket,
} from 'lucide-react-native';

import { useNotifications } from '@/hooks/useNotifications';
import { useAppStore } from '@/store/appStore';
import { notify } from '@/services/notificationService';
import { ManropeWeights } from '@/constants/theme';

// ── Design tokens — matches profile.tsx ────────────────────────────────────────

const C = {
  accent:     '#D63527',
  accentSoft: '#FEF2EF',
  bg:         '#F2F2F7',
  surface:    '#FFFFFF',
  border:     '#E8E8ED',
  divider:    '#F0F0F5',
  primary:    '#0D0D0D',
  secondary:  '#5C5C5C',
  muted:      '#AEAEB2',
  warnSoft:   '#FFF5E0',
  warnText:   '#946200',
  warnBorder: '#F5D98A',
} as const;

// ── Top bar ─────────────────────────────────────────────────────────────────────

function TopBar({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.topBar}>
      <Pressable style={styles.backBtn} onPress={onBack} hitSlop={12}>
        <ArrowLeft size={20} color={C.primary} strokeWidth={2} />
      </Pressable>
      <Text style={styles.topBarTitle}>Notifications</Text>
      <View style={styles.topBarSpacer} />
    </View>
  );
}

// ── Toggle switch ───────────────────────────────────────────────────────────────

function Toggle({
  value, onChange, disabled, loading,
}: {
  value: boolean;
  onChange: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: value ? 1 : 0,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const trackColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#E4E4E9', C.accent],
  });
  const knobPos = anim.interpolate({ inputRange: [0, 1], outputRange: [2, 22] });

  return (
    <Pressable onPress={onChange} disabled={disabled || loading} hitSlop={8}>
      <Animated.View style={[styles.toggleTrack, { backgroundColor: trackColor }]}>
        {loading ? (
          <ActivityIndicator size="small" color="#FFF" style={styles.toggleSpinner} />
        ) : (
          <Animated.View style={[styles.toggleKnob, { left: knobPos }]} />
        )}
      </Animated.View>
    </Pressable>
  );
}

// ── Info row (descriptive, non-interactive) ─────────────────────────────────────

function InfoRow({
  icon, iconBg, label, sub, dimmed,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  sub: string;
  dimmed?: boolean;
}) {
  return (
    <View style={[styles.infoRow, dimmed && { opacity: 0.4 }]}>
      <View style={[styles.infoIconWrap, { backgroundColor: iconBg }]}>{icon}</View>
      <View style={styles.infoBody}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoSub}>{sub}</Text>
      </View>
    </View>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────────

export default function NotificationsSettingsScreen() {
  const router = useRouter();
  const {
    enabled, permission, status,
    initNotificationSettings, enable, disable, openSettings,
  } = useNotifications();

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void initNotificationSettings();
  }, [initNotificationSettings]);

  const handleToggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (enabled) {
        disable();
        notify({
          title: 'Notifications turned off',
          message: "You won't get alerts until you turn this back on.",
          type: 'info',
        });
      } else {
        await enable();
        // Read fresh state directly — the hook's `permission` in this closure
        // is still the pre-await value until the next render.
        const result = useAppStore.getState().notificationPermission;
        if (result === 'granted') {
          notify({
            title: 'Notifications enabled',
            message: "You'll now get alerts for redemptions and more.",
            type: 'success',
          });
        } else if (result === 'denied') {
          notify({
            title: 'Permission denied',
            message: 'Allow notifications to get alerts for redemptions and offers.',
            type: 'warning',
          });
        }
        // 'blocked' already gets its own persistent notice below.
      }
    } finally {
      setBusy(false);
    }
  };

  const isBlocked = permission === 'blocked';
  const isDenied = permission === 'denied';
  const isChecking = status === 'checking';
  const isBusy = busy || status === 'requesting';

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <TopBar onBack={() => router.back()} />

      <View style={styles.content}>
        {/* ── Master toggle card ── */}
        <View style={styles.heroCard}>
          <View style={styles.heroRow}>
            <View style={styles.heroIconWrap}>
              <Bell size={20} color={C.accent} strokeWidth={2} />
            </View>
            <View style={styles.heroBody}>
              <Text style={styles.heroTitle}>Push Notifications</Text>
              <Text style={styles.heroSub}>
                {isBlocked
                  ? 'Blocked in system Settings'
                  : isDenied
                    ? 'Permission denied — tap to try again'
                    : enabled
                      ? 'Alerts and reminders are on'
                      : 'Get alerted about your cards and redemptions'}
              </Text>
            </View>
            {isChecking ? (
              <ActivityIndicator size="small" color={C.muted} />
            ) : (
              <Toggle
                value={enabled}
                onChange={handleToggle}
                disabled={isBlocked}
                loading={isBusy}
              />
            )}
          </View>
        </View>

        {/* ── Blocked-permission notice ── */}
        {isBlocked ? (
          <View style={styles.warnCard}>
            <AlertTriangle size={16} color={C.warnText} strokeWidth={2.2} />
            <Text style={styles.warnText}>
              You've turned off notifications for Cardz in system Settings. Enable them there to
              receive alerts.
            </Text>
            <Pressable style={styles.warnBtn} onPress={openSettings}>
              <Text style={styles.warnBtnText}>Open Settings</Text>
            </Pressable>
          </View>
        ) : null}

        {/* ── Denied-but-retryable notice ── */}
        {isDenied ? (
          <View style={styles.warnCard}>
            <AlertTriangle size={16} color={C.warnText} strokeWidth={2.2} />
            <Text style={styles.warnText}>
              Notification permission was denied. Turn the toggle back on to ask again.
            </Text>
          </View>
        ) : null}

        {/* ── What you'll be notified about ── */}
        <Text style={styles.sectionLabel}>YOU'LL BE NOTIFIED ABOUT</Text>
        <View style={styles.infoGroup}>
          <InfoRow
            icon={<Ticket size={16} color="#0369A1" strokeWidth={1.9} />}
            iconBg="#EFF6FF"
            label="Redemption updates"
            sub="Approvals, rejections, and pending requests"
            dimmed={!enabled}
          />
          <View style={styles.infoDivider} />
          <InfoRow
            icon={<CalendarClock size={16} color="#15803D" strokeWidth={1.9} />}
            iconBg="#F0FDF4"
            label="Subscription reminders"
            sub="Renewals and expiry alerts for your cards"
            dimmed={!enabled}
          />
          <View style={styles.infoDivider} />
          <InfoRow
            icon={<Gift size={16} color="#B45309" strokeWidth={1.9} />}
            iconBg="#FFFBEB"
            label="Offers & announcements"
            sub="New stores, deals, and app updates"
            dimmed={!enabled}
          />
          <View style={styles.infoDivider} />
          <InfoRow
            icon={<ShieldAlert size={16} color="#9333EA" strokeWidth={1.9} />}
            iconBg="#FDF4FF"
            label="Account security"
            sub="Sign-ins and changes to your account"
            dimmed={!enabled}
          />
        </View>

        <Text style={styles.footnote}>
          You can change this anytime. Turning notifications off here also stops the sound and
          in-app alerts Cardz shows for redemption updates.
        </Text>
      </View>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    letterSpacing: -0.2,
  },
  topBarSpacer: { width: 36 },

  content: { flex: 1, paddingHorizontal: 16, paddingTop: 20 },

  // ── Hero toggle card ──
  heroCard: {
    backgroundColor: C.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 16 },
      android: { elevation: 3 },
    }),
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: C.accentSoft,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  heroBody: { flex: 1, gap: 3 },
  heroTitle: { fontSize: 15.5, fontWeight: '700', fontFamily: ManropeWeights.bold, color: C.primary, letterSpacing: -0.2 },
  heroSub: { fontSize: 12.5, color: C.muted, fontWeight: '500', fontFamily: ManropeWeights.medium },

  // ── Toggle ──
  toggleTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
  },
  toggleKnob: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    top: 2,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2 },
      android: { elevation: 2 },
    }),
  },
  toggleSpinner: { alignSelf: 'center' },

  // ── Blocked warning ──
  warnCard: {
    backgroundColor: C.warnSoft,
    borderRadius: 16,
    padding: 14,
    marginTop: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.warnBorder,
    gap: 8,
  },
  warnText: { fontSize: 12.5, color: C.warnText, fontWeight: '500', fontFamily: ManropeWeights.medium, lineHeight: 18 },
  warnBtn: {
    alignSelf: 'flex-start',
    backgroundColor: C.warnText,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 2,
  },
  warnBtnText: { fontSize: 12.5, fontWeight: '700', fontFamily: ManropeWeights.bold, color: '#FFF' },

  // ── Info section ──
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.muted,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginTop: 28,
    marginBottom: 10,
  },
  infoGroup: {
    backgroundColor: C.surface,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  infoIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  infoBody: { flex: 1, gap: 2 },
  infoLabel: { fontSize: 13.5, fontWeight: '600', fontFamily: ManropeWeights.semiBold, color: C.primary },
  infoSub: { fontSize: 11.5, color: C.muted, fontFamily: ManropeWeights.regular },
  infoDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginLeft: 63,
  },

  footnote: {
    fontSize: 11.5,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 20,
    marginHorizontal: 8,
    fontFamily: ManropeWeights.regular,
  },
});

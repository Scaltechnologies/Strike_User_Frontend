import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Bell,
  Camera,
  ChevronRight,
  CreditCard,
  Edit2,
  FileText,
  HelpCircle,
  History,
  Image as ImageIcon,
  Lock,
  LogOut,
  Shield,
  Trash2,
  X,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { useProfile, useUpdateProfile, useUploadAvatar } from '@/hooks/useProfile';
import type { Gender } from '@/types/user';
import { useMyActiveSubscriptions } from '@/hooks/useSubscriptions';
import { useUserRedemptions } from '@/hooks/useRedemptions';
import { apiClient } from '@/api/client';
import { disableCurrentDevice } from '@/services/notificationService';
import { API_ENDPOINTS } from '@/constants/api';
import { ROUTES } from '@/constants/routes';
import { ManropeWeights } from '@/constants/theme';
import { useMediaSource, logMediaError } from '@/utils/media';
import { PressableScale } from '@/components/ui/PressableScale';
import { FadeInView } from '@/components/ui/FadeInView';
import { KeyboardAvoidingScreen } from '@/components/ui/KeyboardAvoidingScreen';
import { tapLight, tapWarning } from '@/utils/haptics';

// ── Design tokens ──────────────────────────────────────────────────────────────

const C = {
  accent:     '#D63527',
  accentSoft: '#FEF2EF',
  accentDeep: '#B02A1E',
  bg:         '#F2F2F7',
  surface:    '#FFFFFF',
  border:     '#E8E8ED',
  divider:    '#F0F0F5',
  primary:    '#0D0D0D',
  secondary:  '#5C5C5C',
  muted:      '#AEAEB2',
  placeholder:'#C7C7CC',
  danger:     '#FF3B30',
  dangerSoft: '#FFF0EE',
  skeleton:   '#E8E8ED',
  overlay:    'rgba(0,0,0,0.44)',
} as const;

// ── Helpers ────────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

const PALETTES: Array<{ bg: string; text: string }> = [
  { bg: '#EEF2FF', text: '#4F46E5' },
  { bg: '#F0FDF4', text: '#15803D' },
  { bg: '#FFF7ED', text: '#C2410C' },
  { bg: '#FDF4FF', text: '#9333EA' },
  { bg: '#F0F9FF', text: '#0369A1' },
  { bg: '#FFFBEB', text: '#B45309' },
  { bg: '#FEF2EF', text: '#D63527' },
];

function palette(name: string) {
  const idx = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTES.length;
  return PALETTES[idx];
}

function fmtPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length === 10) return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
  if (d.length === 12 && d.startsWith('91')) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  return phone;
}

function fmtSince(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
}

// ── Pulse Skeleton ─────────────────────────────────────────────────────────────

function Pulse({ w, h, r = 8, style }: { w?: number | string; h: number; r?: number; style?: object }) {
  const opacity = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.25, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.6, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[{ backgroundColor: C.skeleton, borderRadius: r, height: h, opacity }, w != null ? { width: w } : { flex: 1 }, style]}
    />
  );
}

// ── Avatar ─────────────────────────────────────────────────────────────────────

function Avatar({
  name,
  avatarUrl,
  uploading,
  onPress,
}: {
  name: string;
  avatarUrl: string | null;
  uploading: boolean;
  onPress: () => void;
}) {
  const pal = name ? palette(name) : { bg: C.bg, text: C.muted };
  const initials = name ? getInitials(name) : '?';
  const [imgFailed, setImgFailed] = useState(false);
  const source = useMediaSource(avatarUrl);

  // Reset the failure flag whenever the actual photo changes (e.g. after
  // uploading a new one) — otherwise an old failed load keeps the new,
  // perfectly valid photo hidden behind the initials fallback forever.
  useEffect(() => {
    setImgFailed(false);
  }, [source?.uri]);

  return (
    <Pressable onPress={() => { tapLight(); onPress(); }} style={styles.avatarWrap}>
      {source && !imgFailed ? (
        <Image
          source={source}
          style={styles.avatarImg}
          contentFit="cover"
          transition={200}
          onError={(e) => {
            logMediaError('avatar', source.uri, e.error);
            setImgFailed(true);
          }}
        />
      ) : (
        <View style={[styles.avatarImg, { backgroundColor: pal.bg, justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={[styles.avatarText, { color: pal.text }]}>{initials}</Text>
        </View>
      )}

      {/* Camera overlay badge */}
      <View style={styles.cameraBadge}>
        {uploading
          ? <ActivityIndicator size="small" color="#FFF" />
          : <Camera size={13} color="#FFF" strokeWidth={2.2} />
        }
      </View>
    </Pressable>
  );
}

// ── Section Label ──────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label}</Text>;
}

// ── Divider ────────────────────────────────────────────────────────────────────

function Divider() {
  return <View style={styles.divider} />;
}

// ── Menu Item ──────────────────────────────────────────────────────────────────

function MenuItem({
  icon, iconBg, label, sub, onPress, badge, danger = false, disabled = false,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  sub?: string;
  onPress?: () => void;
  badge?: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress ? () => { tapLight(); onPress(); } : undefined}
      disabled={disabled}
      style={({ pressed }) => [styles.menuItem, pressed && !disabled && { backgroundColor: C.divider }]}
    >
      <View style={[styles.menuIconWrap, { backgroundColor: iconBg }]}>{icon}</View>
      <View style={styles.menuBody}>
        <Text style={[styles.menuLabel, danger && { color: C.danger }, disabled && { color: C.muted }]}>
          {label}
        </Text>
        {sub ? <Text style={styles.menuSub}>{sub}</Text> : null}
      </View>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : (
        <ChevronRight size={16} color={disabled ? C.skeleton : C.muted} strokeWidth={1.8} />
      )}
    </Pressable>
  );
}

// ── Photo Action Sheet ─────────────────────────────────────────────────────────

function PhotoSheet({
  visible,
  hasPhoto,
  onPickLibrary,
  onRemove,
  onClose,
}: {
  visible: boolean;
  hasPhoto: boolean;
  onPickLibrary: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const ty = useRef(new Animated.Value(500)).current;
  const bdOp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(ty, { toValue: 0, useNativeDriver: true, damping: 24, stiffness: 300, mass: 0.7 }),
        Animated.timing(bdOp, { toValue: 1, duration: 240, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(ty, { toValue: 500, duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(bdOp, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[styles.sheetBackdrop, { opacity: bdOp }]} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[styles.photoSheet, { transform: [{ translateY: ty }] }]}>
        <View style={styles.sheetHandle} />
        <Text style={styles.photoSheetTitle}>Profile photo</Text>

        <PressableScale style={styles.photoOption} onPress={() => { onClose(); setTimeout(onPickLibrary, 220); }}>
          <View style={[styles.photoOptionIcon, { backgroundColor: '#EFF6FF' }]}>
            <ImageIcon size={18} color="#0369A1" strokeWidth={2} />
          </View>
          <Text style={styles.photoOptionLabel}>Choose from library</Text>
        </PressableScale>

        {hasPhoto && (
          <PressableScale style={styles.photoOption} onPress={() => { onClose(); setTimeout(onRemove, 220); }}>
            <View style={[styles.photoOptionIcon, { backgroundColor: C.dangerSoft }]}>
              <Trash2 size={18} color={C.danger} strokeWidth={2} />
            </View>
            <Text style={[styles.photoOptionLabel, { color: C.danger }]}>Remove photo</Text>
          </PressableScale>
        )}

        <Pressable style={styles.photoCancel} onPress={onClose}>
          <Text style={styles.photoCancelText}>Cancel</Text>
        </Pressable>

        <View style={{ height: Platform.OS === 'ios' ? 16 : 6 }} />
      </Animated.View>
    </Modal>
  );
}

// ── Edit Profile Sheet ─────────────────────────────────────────────────────────

function EditProfileSheet({
  visible, name, email, gender, onClose,
}: {
  visible: boolean;
  name: string;
  email: string | null;
  gender: Gender | null;
  onClose: () => void;
}) {
  const [nameVal, setNameVal] = useState('');
  const [emailVal, setEmailVal] = useState('');
  const [genderVal, setGenderVal] = useState<Gender | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);
  const emailRef = useRef<TextInput>(null);
  const { mutate, isPending, reset } = useUpdateProfile();

  const ty = useRef(new Animated.Value(700)).current;
  const bdOp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setNameVal(name);
      setEmailVal(email ?? '');
      setGenderVal(gender);
      setSyncFailed(false);
      reset();
      Animated.parallel([
        Animated.spring(ty, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 280, mass: 0.8 }),
        Animated.timing(bdOp, { toValue: 1, duration: 280, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(ty, { toValue: 700, duration: 260, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(bdOp, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const hasChanges =
    nameVal.trim() !== name ||
    (emailVal.trim() || null) !== email ||
    genderVal !== gender;

  const canSave = hasChanges && nameVal.trim().length > 0 && !isPending;

  const save = () => {
    if (!canSave) return;
    setSyncFailed(false);
    mutate(
      { name: nameVal.trim(), email: emailVal.trim() || undefined, gender: genderVal ?? undefined },
      {
        // onMutate already applied the optimistic update in the hook.
        // Close the sheet immediately — the hero card will already show the new name.
        onSuccess: onClose,
        onError: () => {
          // Optimistic data is kept in cache (hook does not rollback on error).
          // Close the sheet so the user sees their name displayed correctly.
          // Show a subtle non-blocking banner before closing.
          setSyncFailed(true);
          // Close after a brief moment so the user sees the notice
          setTimeout(onClose, 1400);
        },
      },
    );
  };

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingScreen style={styles.sheetKAV}>
        <Animated.View style={[styles.sheetBackdrop, { opacity: bdOp }]} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View style={[styles.sheet, { transform: [{ translateY: ty }] }]}>
          <View style={styles.sheetHandle} />

          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Edit Profile</Text>
            <Pressable onPress={onClose} hitSlop={12} style={styles.sheetClose}>
              <X size={18} color={C.secondary} strokeWidth={2.2} />
            </Pressable>
          </View>

          {/* Name */}
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Full name</Text>
            <TextInput
              style={[styles.fieldInput, nameVal.trim().length === 0 && styles.fieldInputError]}
              value={nameVal}
              onChangeText={setNameVal}
              placeholder="Enter your name"
              placeholderTextColor={C.placeholder}
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
              editable={!isPending && !syncFailed}
            />
          </View>

          {/* Gender */}
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Gender</Text>
            <View style={styles.genderRow}>
              {(['MALE', 'FEMALE'] as const).map((g) => (
                <Pressable
                  key={g}
                  style={[styles.genderOption, genderVal === g && styles.genderOptionSelected]}
                  onPress={() => setGenderVal(g)}
                  disabled={isPending || syncFailed}
                >
                  <Text style={[styles.genderOptionText, genderVal === g && styles.genderOptionTextSelected]}>
                    {g === 'MALE' ? 'Male' : 'Female'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Email */}
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>
              Email{'  '}
              <Text style={{ color: C.muted, fontWeight: '400', fontFamily: ManropeWeights.regular, textTransform: 'none', letterSpacing: 0 }}>
                optional
              </Text>
            </Text>
            <TextInput
              ref={emailRef}
              style={styles.fieldInput}
              value={emailVal}
              onChangeText={setEmailVal}
              placeholder="your@email.com"
              placeholderTextColor={C.placeholder}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={save}
              editable={!isPending && !syncFailed}
            />
          </View>

          {/* Sync warning — shown instead of blocking alert */}
          {syncFailed ? (
            <View style={styles.syncWarning}>
              <Text style={styles.syncWarningText}>
                Saved on device — couldn't sync to server right now.
              </Text>
            </View>
          ) : null}

          {/* Save button */}
          <PressableScale
            style={[styles.saveBtn, (!canSave || syncFailed) && styles.saveBtnDisabled]}
            onPress={save}
            disabled={!canSave || syncFailed}
          >
            {isPending
              ? <ActivityIndicator size="small" color="#FFF" />
              : <Text style={styles.saveBtnText}>Save changes</Text>
            }
          </PressableScale>

          <View style={{ height: Platform.OS === 'ios' ? 16 : 8 }} />
        </Animated.View>
      </KeyboardAvoidingScreen>
    </Modal>
  );
}

// ── Sign Out Confirm Dialog ─────────────────────────────────────────────────────

function LogoutConfirmDialog({
  visible, loading, onCancel, onConfirm,
}: {
  visible: boolean;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const scale = useRef(new Animated.Value(0.86)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const bdOp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(bdOp, { toValue: 1, duration: 200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 220, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 16, stiffness: 260, mass: 0.7 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(bdOp, { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 140, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.86, duration: 160, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={onCancel} statusBarTranslucent>
      <Animated.View style={[styles.confirmBackdrop, { opacity: bdOp }]} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={loading ? undefined : onCancel} />
      </Animated.View>

      <View style={styles.confirmWrap} pointerEvents="box-none">
        <Animated.View style={[styles.confirmCard, { opacity, transform: [{ scale }] }]}>
          <View style={styles.confirmIconWrap}>
            <LogOut size={24} color={C.danger} strokeWidth={2} />
          </View>

          <Text style={styles.confirmTitle}>Sign out?</Text>
          <Text style={styles.confirmMessage}>
            You'll need to verify your number again the next time you sign in.
          </Text>

          <View style={styles.confirmActions}>
            <PressableScale style={styles.confirmCancelBtn} onPress={onCancel} disabled={loading}>
              <Text style={styles.confirmCancelText}>Cancel</Text>
            </PressableScale>
            <PressableScale style={styles.confirmDangerBtn} onPress={onConfirm} disabled={loading}>
              {loading
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Text style={styles.confirmDangerText}>Sign out</Text>
              }
            </PressableScale>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Logout success overlay ───────────────────────────────────────────────────────
// Shown for a brief beat after logout has actually finished (see confirmLogout —
// this appears once the existing API call + device-disable + clearAuth sequence
// completes), so the user gets a calm confirmation instead of just snapping to
// the Login screen. Same cream background used by the auth screens (splash,
// login) — this is a transition INTO that flow, not a Profile-screen surface.
function LogoutSuccessOverlay({ visible }: { visible: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 220, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 16, stiffness: 220, mass: 0.7 }),
      ]).start();
    }
  }, [visible]);

  return (
    <Modal visible={visible} animationType="none" statusBarTranslucent>
      <View style={styles.logoutOverlay}>
        <Animated.View style={{ opacity, transform: [{ scale }], alignItems: 'center' }}>
          <Image
            source={require('@/assets/images/logo.png')}
            style={styles.logoutIcon}
            contentFit="contain"
          />
          <Text style={styles.logoutTitle}>Logged out successfully</Text>
          <Text style={styles.logoutSubtitle}>You have been securely logged out.</Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Profile Screen ─────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const router = useRouter();
  const { userId, clearAuth } = useAuthStore();

  const { data: profile, isLoading: profileLoading, error: profileError } = useProfile();
  const { data: activeSubs } = useMyActiveSubscriptions();
  const { data: redemptions } = useUserRedemptions(userId);
  const { mutate: uploadAvatar, isPending: uploading } = useUploadAvatar();

  const [editVisible, setEditVisible] = useState(false);
  const [photoSheetVisible, setPhotoSheetVisible] = useState(false);
  const [logoutConfirmVisible, setLogoutConfirmVisible] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutSuccessVisible, setLogoutSuccessVisible] = useState(false);

  const name = profile?.name ?? '';
  const pal = name ? palette(name) : { bg: C.bg, text: C.muted };
  const initials = name ? getInitials(name) : '?';
  const activeCount = activeSubs?.length ?? 0;
  const redeemedCount = redemptions?.length ?? 0;

  // ── Photo picker ────────────────────────────────────────────────────────────

  const pickFromLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission required',
        'Please allow access to your photo library in Settings.',
        [{ text: 'OK' }],
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    // Optimistic update is applied immediately in the hook (local URI shows at once).
    // Backend sync failure is silent — no alert, image stays visible for this session.
    uploadAvatar({ uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' });
  };

  const removePhoto = () => {
    Alert.alert('Remove photo', 'Are you sure you want to remove your profile photo?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        // Optimistically clear avatar in cache
        // Backend removal would be a separate PATCH — for now clear locally
        Alert.alert('Info', 'Contact support to remove your profile photo.');
      }},
    ]);
  };

  // ── Logout ──────────────────────────────────────────────────────────────────

  const handleLogout = () => setLogoutConfirmVisible(true);

  const confirmLogout = async () => {
    tapWarning();
    setLoggingOut(true);
    try {
      const { refreshToken } = useAuthStore.getState();
      if (refreshToken) {
        await apiClient
          .post(API_ENDPOINTS.AUTH.LOGOUT, { refreshToken })
          .catch(() => {});
      }
      // Must run before clearAuth() below — disabling the device row needs
      // this account's still-valid bearer token to authenticate the request.
      // Best-effort: a failure here just leaves the row active until the
      // next account registers the same token and reclaims it.
      await disableCurrentDevice();
    } finally {
      setLogoutConfirmVisible(false);
      setLoggingOut(false);
      // Brief success beat before the existing auth-state clear — presentation
      // only. clearAuth() itself is unchanged; AuthProvider's existing route
      // guard still reacts to it and redirects to Login exactly as before,
      // just a moment later so the confirmation is actually visible.
      setLogoutSuccessVisible(true);
      setTimeout(clearAuth, 900);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero Card ── */}
        <FadeInView delay={0}>
          <View style={styles.heroCard}>
            {profileLoading ? (
              <View style={styles.heroRow}>
                <Pulse w={76} h={76} r={24} />
                <View style={{ flex: 1, gap: 12 }}>
                  <Pulse h={17} w="60%" />
                  <Pulse h={13} w="42%" />
                  <Pulse h={11} w="50%" />
                </View>
              </View>
            ) : (
              <View style={styles.heroRow}>
                {/* Tappable avatar — always visible */}
                <Avatar
                  name={name}
                  avatarUrl={profile?.avatarUrl ?? null}
                  uploading={uploading}
                  onPress={() => setPhotoSheetVisible(true)}
                />

                {/* Info */}
                <View style={styles.heroInfo}>
                  {profileError && !profile ? (
                    <>
                      <Text style={[styles.heroName, { color: C.muted }]}>Tap edit to set up</Text>
                      <Text style={styles.heroSub}>Profile not loaded — you can still edit</Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.heroName} numberOfLines={1}>{name || '—'}</Text>
                      <Text style={styles.heroPhone}>{fmtPhone(profile?.phone ?? '')}</Text>
                      {profile?.email ? (
                        <Text style={styles.heroEmail} numberOfLines={1}>{profile.email}</Text>
                      ) : null}
                      {profile?.createdAt ? (
                        <View style={styles.heroBadge}>
                          <Text style={styles.heroBadgeText}>Since {fmtSince(profile.createdAt)}</Text>
                        </View>
                      ) : null}
                    </>
                  )}
                </View>

                {/* Edit button — always visible */}
                <PressableScale style={styles.editBtn} onPress={() => setEditVisible(true)}>
                  <Edit2 size={15} color={C.accent} strokeWidth={2.3} />
                </PressableScale>
              </View>
            )}
          </View>
        </FadeInView>

        {/* ── Stats ── */}
        <FadeInView delay={70}>
          <View style={styles.statsRow}>
            <Pressable
              style={[styles.statCard, { marginRight: 10 }]}
              onPress={() => { tapLight(); router.navigate('/(tabs)/cards' as never); }}
            >
              <Text style={styles.statValue}>{activeCount}</Text>
              <Text style={styles.statLabel}>Active cards</Text>
            </Pressable>
            <Pressable
              style={styles.statCard}
              onPress={() => { tapLight(); router.navigate('/(tabs)/history' as never); }}
            >
              <Text style={styles.statValue}>{redeemedCount}</Text>
              <Text style={styles.statLabel}>Redemptions</Text>
            </Pressable>
          </View>
        </FadeInView>

        {/* ── Account ── */}
        <FadeInView delay={110}>
          <SectionLabel label="ACCOUNT" />
          <View style={styles.menuGroup}>
            <MenuItem
              icon={<CreditCard size={17} color={C.accent} strokeWidth={1.9} />}
              iconBg={C.accentSoft}
              label="My Cards"
              sub="View your active subscriptions"
              onPress={() => router.navigate('/(tabs)/cards' as never)}
            />
            <Divider />
            <MenuItem
              icon={<History size={17} color="#0369A1" strokeWidth={1.9} />}
              iconBg="#EFF6FF"
              label="Redemption History"
              sub="All your meal redemptions"
              onPress={() => router.navigate('/(tabs)/history' as never)}
            />
          </View>
        </FadeInView>

        {/* ── Preferences ── */}
        <FadeInView delay={150}>
          <SectionLabel label="PREFERENCES" />
          <View style={styles.menuGroup}>
            <MenuItem
              icon={<Bell size={17} color="#9333EA" strokeWidth={1.9} />}
              iconBg="#FDF4FF"
              label="Notifications"
              sub="Alerts and reminders"
              onPress={() => router.navigate(ROUTES.SETTINGS.NOTIFICATIONS as never)}
            />
            <Divider />
            <MenuItem
              icon={<Shield size={17} color="#15803D" strokeWidth={1.9} />}
              iconBg="#F0FDF4"
              label="Privacy & Security"
              sub="Data and permissions"
              badge="Soon"
              disabled
            />
            <Divider />
            <MenuItem
              icon={<HelpCircle size={17} color="#B45309" strokeWidth={1.9} />}
              iconBg="#FFFBEB"
              label="Help & Support"
              sub="FAQs and contact"
              badge="Soon"
              disabled
            />
          </View>
        </FadeInView>

        {/* ── Legal ── */}
        <FadeInView delay={170}>
          <SectionLabel label="LEGAL" />
          <View style={styles.menuGroup}>
            <MenuItem
              icon={<FileText size={17} color="#475569" strokeWidth={1.9} />}
              iconBg="#F1F5F9"
              label="Terms & Conditions"
              sub="Rules for using STRIKE"
              onPress={() => router.push(ROUTES.LEGAL.TERMS as never)}
            />
            <Divider />
            <MenuItem
              icon={<Lock size={17} color="#475569" strokeWidth={1.9} />}
              iconBg="#F1F5F9"
              label="Privacy Policy"
              sub="How we handle your data"
              onPress={() => router.push(ROUTES.LEGAL.PRIVACY as never)}
            />
          </View>
        </FadeInView>

        {/* ── Sign Out ── */}
        <FadeInView delay={190}>
          <View style={[styles.menuGroup, styles.dangerGroup]}>
            <MenuItem
              icon={
                loggingOut
                  ? <ActivityIndicator size="small" color={C.danger} />
                  : <LogOut size={17} color={C.danger} strokeWidth={1.9} />
              }
              iconBg={C.dangerSoft}
              label="Sign out"
              onPress={handleLogout}
              danger
            />
          </View>
        </FadeInView>

        {/* ── Version ── */}
        <FadeInView delay={220}>
          <Text style={styles.version}>Cardz  ·  v1.0.0</Text>
        </FadeInView>
      </ScrollView>

      {/* ── Sheets ── */}
      <PhotoSheet
        visible={photoSheetVisible}
        hasPhoto={!!profile?.avatarUrl}
        onPickLibrary={pickFromLibrary}
        onRemove={removePhoto}
        onClose={() => setPhotoSheetVisible(false)}
      />

      <EditProfileSheet
        visible={editVisible}
        name={profile?.name ?? ''}
        email={profile?.email ?? null}
        gender={profile?.gender ?? null}
        onClose={() => setEditVisible(false)}
      />

      <LogoutConfirmDialog
        visible={logoutConfirmVisible}
        loading={loggingOut}
        onCancel={() => setLogoutConfirmVisible(false)}
        onConfirm={confirmLogout}
      />

      <LogoutSuccessOverlay visible={logoutSuccessVisible} />
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  header: {
    backgroundColor: C.surface,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    letterSpacing: -0.5,
  },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 56 },

  // ── Hero ──
  heroCard: {
    marginHorizontal: 16,
    marginTop: 20,
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
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },

  // ── Avatar ──
  avatarWrap: {
    position: 'relative',
    flexShrink: 0,
  },
  avatarImg: {
    width: 74,
    height: 74,
    borderRadius: 22,
    overflow: 'hidden',
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    letterSpacing: -0.5,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.accent,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2.5,
    borderColor: C.surface,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 4 },
      android: { elevation: 4 },
    }),
  },

  heroInfo: {
    flex: 1,
    gap: 3,
  },
  heroName: {
    fontSize: 19,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    letterSpacing: -0.4,
  },
  heroPhone: {
    fontSize: 14,
    color: C.secondary,
    fontWeight: '500',
    fontFamily: ManropeWeights.medium,
  },
  heroEmail: {
    fontSize: 12,
    color: C.muted,
    fontFamily: ManropeWeights.regular,
  },
  heroSub: {
    fontSize: 13,
    color: C.muted,
    marginTop: 4,
    fontFamily: ManropeWeights.regular,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    backgroundColor: C.bg,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  heroBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
    color: C.muted,
  },
  editBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.accentSoft,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },

  // ── Stats ──
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    letterSpacing: -1,
  },
  statLabel: {
    fontSize: 12,
    color: C.muted,
    fontWeight: '500',
    fontFamily: ManropeWeights.medium,
    marginTop: 2,
  },

  // ── Section label ──
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.muted,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginHorizontal: 20,
    marginTop: 28,
    marginBottom: 10,
  },

  // ── Menu ──
  menuGroup: {
    marginHorizontal: 16,
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
  dangerGroup: { marginTop: 28 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  menuBody: { flex: 1, gap: 2 },
  menuLabel: { fontSize: 14, fontWeight: '600', fontFamily: ManropeWeights.semiBold, color: C.primary },
  menuSub: { fontSize: 12, color: C.muted, fontFamily: ManropeWeights.regular },
  badge: {
    backgroundColor: C.bg,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  badgeText: { fontSize: 11, fontWeight: '600', fontFamily: ManropeWeights.semiBold, color: C.muted },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginLeft: 66,
  },

  version: {
    textAlign: 'center',
    fontSize: 12,
    color: C.muted,
    marginTop: 32,
    letterSpacing: 0.2,
    fontFamily: ManropeWeights.regular,
  },

  // ── Photo Sheet ──
  photoSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 20,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 20 },
      android: { elevation: 12 },
    }),
  },
  photoSheetTitle: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.muted,
    textAlign: 'center',
    letterSpacing: 0.3,
    marginBottom: 20,
    textTransform: 'uppercase',
  },
  photoOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: C.bg,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  photoOptionIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoOptionLabel: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
    color: C.primary,
  },
  photoCancel: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 4,
  },
  photoCancelText: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
    color: C.muted,
  },

  // ── Edit Sheet ──
  sheetKAV: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: C.overlay,
  },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 44 : 28,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 20 },
      android: { elevation: 12 },
    }),
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 22,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  sheetTitle: {
    fontSize: 19,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    letterSpacing: -0.4,
  },
  sheetClose: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  fieldBlock: { marginBottom: 20 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.secondary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  fieldInput: {
    backgroundColor: C.bg,
    borderRadius: 14,
    height: 52,
    paddingHorizontal: 16,
    fontSize: 15,
    fontFamily: ManropeWeights.regular,
    color: C.primary,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  fieldInputError: {
    borderColor: C.danger,
  },
  genderRow: { flexDirection: 'row', gap: 10 },
  genderOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.bg,
    borderRadius: 14,
    height: 48,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  genderOptionSelected: {
    backgroundColor: C.accent,
  },
  genderOptionText: {
    fontSize: 14,
    fontFamily: ManropeWeights.semiBold,
    color: C.primary,
  },
  genderOptionTextSelected: {
    color: '#FFFFFF',
  },
  syncWarning: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FDE68A',
  },
  syncWarningText: {
    fontSize: 13,
    color: '#92400E',
    fontWeight: '500',
    fontFamily: ManropeWeights.medium,
    textAlign: 'center',
  },
  saveBtn: {
    height: 52,
    backgroundColor: C.accent,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },

  // ── Logout Confirm Dialog ──
  confirmBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.overlay,
  },
  confirmWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: C.surface,
    borderRadius: 26,
    paddingTop: 28,
    paddingHorizontal: 24,
    paddingBottom: 20,
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.22, shadowRadius: 32 },
      android: { elevation: 16 },
    }),
  },
  confirmIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: C.dangerSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  confirmTitle: {
    fontSize: 19,
    fontWeight: '800',
    fontFamily: ManropeWeights.extraBold,
    color: C.primary,
    letterSpacing: -0.4,
    marginBottom: 8,
    textAlign: 'center',
  },
  confirmMessage: {
    fontSize: 14,
    color: C.secondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    fontFamily: ManropeWeights.regular,
  },
  confirmActions: {
    flexDirection: 'row',
    width: '100%',
  },
  confirmCancelBtn: {
    flex: 1,
    height: 50,
    marginRight: 10,
    borderRadius: 14,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  confirmCancelText: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.secondary,
  },
  confirmDangerBtn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    backgroundColor: C.danger,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: C.danger, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10 },
      android: { elevation: 4 },
    }),
  },
  confirmDangerText: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: '#FFFFFF',
  },

  // ── Logout success overlay ── same cream background as the auth screens
  // (splash, login) — this is a transition into that flow, not a Profile
  // surface, so it deliberately doesn't use Profile's own `C` palette.
  logoutOverlay: {
    flex: 1,
    backgroundColor: '#FFF0E6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutIcon: {
    width: 64,
    height: 64,
    marginBottom: 20,
  },
  logoutTitle: {
    fontSize: 20,
    fontFamily: ManropeWeights.bold,
    color: '#1A1A1A',
    letterSpacing: -0.3,
    marginBottom: 8,
    textAlign: 'center',
  },
  logoutSubtitle: {
    fontSize: 14,
    fontFamily: ManropeWeights.regular,
    color: '#888888',
    textAlign: 'center',
    lineHeight: 20,
  },
});

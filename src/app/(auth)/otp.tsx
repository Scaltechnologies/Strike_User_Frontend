import axios from 'axios';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ClipboardPaste } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeInDown,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { authApi } from '@/api/auth.api';
import { authService, FirebaseAuthError, getFirebaseAuthErrorMessage, toIndianE164 } from '@/services/authService';
import { useAuthStore } from '@/store/authStore';
import { KeyboardAvoidingScreen } from '@/components/ui/KeyboardAvoidingScreen';
import { ManropeWeights } from '@/constants/theme';
import { PulsingDot } from '@/components/ui/PulsingDot';
import { tapSelect, tapSuccess, tapWarning } from '@/utils/haptics';

const OTP_LENGTH = 6;
const RESEND_SECONDS = 60;

function formatPhone(phone: string): string {
  if (phone.length <= 5) return `+91 ${phone}`;
  return `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`;
}

// ── Shake wrapper — owns its own shared value (mirrors OtpDigitBox's pop
// animation below), triggered by bumping `trigger`. ──────────────────────────
interface ShakeViewProps {
  trigger: number;
  entering?: React.ComponentProps<typeof Animated.View>['entering'];
  style?: React.ComponentProps<typeof Animated.View>['style'];
  children: React.ReactNode;
}

function ShakeView({ trigger, entering, style, children }: ShakeViewProps) {
  const shakeX = useSharedValue(0);

  useEffect(() => {
    if (trigger === 0) return;
    shakeX.value = withSequence(
      withTiming(-8, { duration: 45, reduceMotion: ReduceMotion.System }),
      withTiming(8, { duration: 45, reduceMotion: ReduceMotion.System }),
      withTiming(-6, { duration: 45, reduceMotion: ReduceMotion.System }),
      withTiming(6, { duration: 45, reduceMotion: ReduceMotion.System }),
      withTiming(0, { duration: 45, reduceMotion: ReduceMotion.System }),
    );
  }, [trigger, shakeX]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  return (
    <Animated.View entering={entering} style={[style, animatedStyle]}>
      {children}
    </Animated.View>
  );
}

// ── Blinking caret — shown only in the one box that's next to be filled,
// while the (invisible) real input is focused. Purely decorative: the real
// text-editing cursor lives in the hidden input, off-screen. ─────────────────
function BlinkingCaret() {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 500, easing: Easing.linear, reduceMotion: ReduceMotion.System }),
        withTiming(1, { duration: 500, easing: Easing.linear, reduceMotion: ReduceMotion.System }),
      ),
      -1,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[styles.caret, animatedStyle]} />;
}

// ── Single OTP box — purely a DISPLAY. There is no TextInput here: one real,
// invisible TextInput (see OtpScreen) owns all typing, backspacing, native
// SMS autofill, and paste, and every box just renders its slice of that one
// value. This is the standard robust OTP-input shape — six independent
// per-box TextInputs (the previous approach) is exactly what breaks native
// autofill and paste: both expect ONE field to hand a whole code to, not six,
// so distributing a pasted/autofilled string across separate inputs is
// inherently fragile (which box has focus when it lands, IME quirks, etc).
// Pops on fill so autofilled/pasted digits still read as an event rather
// than appearing statically. ──────────────────────────────────────────────
interface OtpDigitBoxProps {
  value: string;
  active: boolean;
  hasError: boolean;
}

function OtpDigitBox({ value, active, hasError }: OtpDigitBoxProps) {
  const scale = useSharedValue(1);
  const wasFilled = useRef(false);

  useEffect(() => {
    const filled = value.length > 0;
    if (filled && !wasFilled.current) {
      scale.value = withSequence(
        withTiming(1.16, { duration: 90, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System }),
        withSpring(1, { damping: 12, stiffness: 220, reduceMotion: ReduceMotion.System }),
      );
    }
    wasFilled.current = filled;
  }, [value, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.box,
        active && styles.boxFocused,
        !!value && styles.boxFilled,
        hasError && styles.boxError,
        animatedStyle,
      ]}
    >
      {value ? <Text style={styles.boxText}>{value}</Text> : active ? <BlinkingCaret /> : null}
    </Animated.View>
  );
}

export default function OtpScreen() {
  const router = useRouter();
  const { phone = '' } = useLocalSearchParams<{ phone: string }>();
  const setTokens = useAuthStore((s) => s.setTokens);

  const [otp, setOtp] = useState('');
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const [canResend, setCanResend] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const [shakeToken, setShakeToken] = useState(0);
  // Transient feedback for the explicit Paste button below — never anything
  // sensitive, just "clipboard didn't have a usable code" style hints, and
  // always self-clears rather than sticking around like a real form error.
  const [pasteHint, setPasteHint] = useState<string | null>(null);
  const pasteHintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The one real input backing every box — see OtpDigitBox's comment for why
  // this replaces six separate per-box TextInputs. Kept invisible (not
  // display:none — Android's autofill/keyboard-suggestion machinery needs an
  // input that's actually laid out and focusable) and stretched over the
  // visible box row, so tapping anywhere in the row focuses it directly.
  const inputRef = useRef<TextInput>(null);
  // Guards against the auto-submit effect and a manual button tap racing
  // each other into two concurrent verify calls.
  const verifyingRef = useRef(false);

  // Auto-focus on mount
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, []);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) {
      setCanResend(true);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // Everything — typing a digit, backspacing, native SMS autofill dropping
  // the whole code in, or pasting (long-press paste, or the OS's "paste"
  // suggestion chip) — arrives here as one plain string. No per-box
  // distribution logic needed: RN just reports the input's new full value.
  const handleOtpChange = useCallback((text: string) => {
    setError('');
    const cleaned = text.replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (cleaned.length > otp.length) tapSelect();
    setOtp(cleaned);
  }, [otp.length]);

  // Explicit, guaranteed-to-work paste — a same-device long-press-to-paste
  // gesture on a custom/near-invisible input can be finicky across Android
  // keyboards and OEM skins even when correctly laid out, so this reads the
  // clipboard directly on a plain button tap instead of depending on that
  // native gesture landing correctly. This is the ONLY place the clipboard
  // is ever read — never automatically/silently on mount or app-foreground —
  // so it only ever fires as a direct result of the user tapping Paste.
  const showPasteHint = useCallback((message: string) => {
    if (pasteHintTimeoutRef.current) clearTimeout(pasteHintTimeoutRef.current);
    setPasteHint(message);
    pasteHintTimeoutRef.current = setTimeout(() => setPasteHint(null), 2500);
  }, []);

  const handlePasteFromClipboard = useCallback(async () => {
    tapSelect();
    let text: string;
    try {
      text = await Clipboard.getStringAsync();
    } catch {
      showPasteHint("Couldn't read the clipboard. Try again.");
      return;
    }
    const cleaned = text.replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (cleaned.length !== OTP_LENGTH) {
      showPasteHint('Copy the code first, then tap Paste.');
      return;
    }
    setPasteHint(null);
    handleOtpChange(cleaned);
  }, [handleOtpChange, showPasteHint]);

  useEffect(() => () => {
    if (pasteHintTimeoutRef.current) clearTimeout(pasteHintTimeoutRef.current);
  }, []);

  const isFilled = otp.length === OTP_LENGTH;

  const handleVerify = useCallback(async () => {
    if (!isFilled || verifyingRef.current) return;
    verifyingRef.current = true;
    setLoading(true);
    setError('');
    try {
      const idToken = await authService.confirmOtp(otp);
      const res = await authApi.verifyFirebaseToken(idToken);
      tapSuccess();
      // setTokens → isAuthenticated = true → AuthProvider navigates to home
      setTokens(res.token, res.refreshToken, String(res.userId));
    } catch (err: unknown) {
      const msg = err instanceof FirebaseAuthError
        ? getFirebaseAuthErrorMessage(err)
        : axios.isAxiosError(err)
          ? ((err.response?.data as { message?: string })?.message ?? 'Invalid OTP. Please try again.')
          : 'Something went wrong. Please try again.';
      setError(msg);
      setShakeToken((t) => t + 1);
      tapWarning();
      // Clear and re-focus first on error
      setOtp('');
      setTimeout(() => inputRef.current?.focus(), 100);
    } finally {
      verifyingRef.current = false;
      setLoading(false);
    }
  }, [isFilled, otp, setTokens]);

  // The whole point: once the code fills — typed, pasted, or SMS-autofilled —
  // verification starts on its own, no button tap needed. Deferred a tick so
  // the setState calls inside handleVerify don't run synchronously from
  // within the effect body.
  useEffect(() => {
    if (!isFilled) return;
    const t = setTimeout(() => { void handleVerify(); }, 0);
    return () => clearTimeout(t);
  }, [isFilled, handleVerify]);

  const handleResend = async () => {
    if (!canResend || resendLoading) return;
    setResendLoading(true);
    setError('');
    try {
      await authService.sendOtp(toIndianE164(phone));
      setOtp('');
      setCountdown(RESEND_SECONDS);
      setCanResend(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (err: unknown) {
      setError(getFirebaseAuthErrorMessage(err));
    } finally {
      setResendLoading(false);
    }
  };

  const statusLabel = loading ? 'Verifying…' : 'Waiting for code…';

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingScreen style={styles.kav}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back */}
          <Pressable
            onPress={() => router.back()}
            style={styles.backBtn}
            hitSlop={12}
          >
            <Text style={styles.backText}>← Back</Text>
          </Pressable>

          <Animated.View entering={FadeInDown.duration(400).springify()}>
            <Text style={styles.heading}>Verify OTP</Text>
            {!!phone && (
              <Text style={styles.sub}>
                Code sent to{' '}
                <Text style={styles.phoneHighlight}>{formatPhone(phone)}</Text>
              </Text>
            )}
          </Animated.View>

          {/* OTP boxes — tapping anywhere focuses the one real (invisible)
              input stretched over the row; the boxes themselves never
              receive touches or keyboard events directly. */}
          <ShakeView
            trigger={shakeToken}
            entering={FadeInDown.duration(400).delay(80).springify()}
            style={styles.boxRowWrap}
          >
            <Pressable
              style={styles.boxRow}
              onPress={() => inputRef.current?.focus()}
            >
              {Array.from({ length: OTP_LENGTH }).map((_, i) => (
                <OtpDigitBox
                  key={i}
                  value={otp[i] ?? ''}
                  active={focused && i === otp.length}
                  hasError={!!error}
                />
              ))}
            </Pressable>

            <TextInput
              ref={inputRef}
              style={styles.hiddenInput}
              value={otp}
              onChangeText={handleOtpChange}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              keyboardType="number-pad"
              maxLength={OTP_LENGTH}
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              importantForAutofill="yes"
              editable={!loading}
              caretHidden
              contextMenuHidden={false}
              autoFocus={false}
            />
          </ShakeView>

          {/* Explicit, always-available paste — see handlePasteFromClipboard
              for why this exists alongside native long-press paste rather
              than relying on it alone. */}
          {!isFilled && !loading ? (
            <Pressable
              style={({ pressed }) => [styles.pasteBtn, pressed && styles.pasteBtnPressed]}
              onPress={() => void handlePasteFromClipboard()}
              hitSlop={8}
            >
              <ClipboardPaste size={15} color="#C0392B" strokeWidth={2.2} />
              <Text style={styles.pasteBtnText}>Paste code</Text>
            </Pressable>
          ) : null}

          {pasteHint ? (
            <Text style={styles.pasteHintText}>{pasteHint}</Text>
          ) : error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : (
            <View style={styles.statusRow}>
              <PulsingDot color={loading ? '#C0392B' : '#B8A79E'} size={7} />
              <Text style={styles.statusText}>{statusLabel}</Text>
            </View>
          )}

          {/* Verify — fallback for manual entry; the effect above already
              submits automatically the moment the boxes fill. */}
          <Pressable
            style={[
              styles.button,
              (!isFilled || loading) && styles.buttonDisabled,
            ]}
            onPress={handleVerify}
            disabled={!isFilled || loading}
          >
            {loading
              ? <ActivityIndicator size="small" color="#FFFFFF" />
              : <Text style={styles.buttonText}>Verify OTP</Text>
            }
          </Pressable>

          {/* Resend */}
          <View style={styles.resendRow}>
            {canResend ? (
              <Pressable onPress={handleResend} disabled={resendLoading}>
                {resendLoading
                  ? <ActivityIndicator size="small" color="#C0392B" />
                  : <Text style={styles.resendLink}>Resend OTP</Text>
                }
              </Pressable>
            ) : (
              <Text style={styles.resendCountdown}>
                Resend in{' '}
                <Text style={styles.resendBold}>{countdown}s</Text>
              </Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingScreen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FFF0E6',
  },
  kav: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },
  backBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    marginBottom: 36,
  },
  backText: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
    color: '#C0392B',
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: '#1A1A1A',
    marginBottom: 10,
  },
  sub: {
    fontSize: 15,
    color: '#666666',
    marginBottom: 40,
    lineHeight: 22,
    fontFamily: ManropeWeights.regular,
  },
  phoneHighlight: {
    color: '#1A1A1A',
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
  },
  boxRowWrap: {
    marginBottom: 16,
    // The hidden input below is absolutely positioned to exactly cover this
    // row — without `relative` here, it has no positioned ancestor to anchor
    // to and ends up laid out somewhere else entirely, off the visible boxes.
    // That's what silently broke native long-press paste: tapping the boxes
    // still called .focus() on it (an imperative ref call, position-
    // independent, which is why typing looked fine), but a long-press lands
    // on whatever's actually at that screen location — not the real input —
    // so the OS never has a text field there to offer a paste menu on.
    position: 'relative',
  },
  boxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  // The one real input — stretched invisibly over the box row (not
  // display:none, which would make it unfocusable/invisible to the OS's
  // autofill machinery). All actual text editing happens here; it never
  // shows its own text or caret.
  hiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
  },
  box: {
    width: 48,
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E8D5CC',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxText: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: '#1A1A1A',
  },
  caret: {
    width: 2,
    height: 24,
    borderRadius: 1,
    backgroundColor: '#C0392B',
  },
  boxFocused: {
    borderColor: '#C0392B',
    borderWidth: 2,
  },
  boxFilled: {
    borderColor: '#1A1A1A',
  },
  boxError: {
    borderColor: '#E74C3C',
  },
  pasteBtn: {
    flexDirection: 'row',
    alignSelf: 'center',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F0C4B8',
    backgroundColor: '#FFF7F4',
    marginBottom: 14,
  },
  pasteBtnPressed: {
    opacity: 0.7,
  },
  pasteBtnText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
    color: '#C0392B',
  },
  pasteHintText: {
    fontSize: 12.5,
    color: '#8A8A8A',
    textAlign: 'center',
    marginBottom: 16,
    fontFamily: ManropeWeights.regular,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
    minHeight: 17,
  },
  statusText: {
    fontSize: 13,
    color: '#8A8A8A',
    fontFamily: ManropeWeights.regular,
  },
  errorText: {
    fontSize: 13,
    color: '#E74C3C',
    textAlign: 'center',
    marginBottom: 16,
    fontFamily: ManropeWeights.regular,
  },
  button: {
    backgroundColor: '#C0392B',
    borderRadius: 14,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  buttonDisabled: {
    backgroundColor: '#D4A89A',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  resendRow: {
    alignItems: 'center',
    marginTop: 4,
    minHeight: 24,
  },
  resendLink: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
    color: '#C0392B',
  },
  resendCountdown: {
    fontSize: 14,
    color: '#888888',
    fontFamily: ManropeWeights.regular,
  },
  resendBold: {
    color: '#1A1A1A',
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
  },
});

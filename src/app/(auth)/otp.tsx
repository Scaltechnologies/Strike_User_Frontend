import axios from 'axios';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputKeyPressEvent,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeInDown,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
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

// ── Single OTP box — pops on fill, so autofilled/pasted digits read as an
// event instead of appearing statically. ─────────────────────────────────────
interface OtpDigitBoxProps {
  value: string;
  focused: boolean;
  hasError: boolean;
  editable: boolean;
  refCallback: (el: TextInput | null) => void;
  onChangeText: (text: string) => void;
  onKeyPress: (e: TextInputKeyPressEvent) => void;
  onFocus: () => void;
  onBlur: () => void;
}

function OtpDigitBox({
  value, focused, hasError, editable, refCallback,
  onChangeText, onKeyPress, onFocus, onBlur,
}: OtpDigitBoxProps) {
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
    <Animated.View style={animatedStyle}>
      <TextInput
        ref={refCallback}
        style={[
          styles.box,
          focused && styles.boxFocused,
          !!value && styles.boxFilled,
          hasError && styles.boxError,
        ]}
        value={value}
        onChangeText={onChangeText}
        onKeyPress={onKeyPress}
        onFocus={onFocus}
        onBlur={onBlur}
        keyboardType="number-pad"
        // Allow up to OTP_LENGTH chars so SMS autofill & paste work on box 0
        maxLength={OTP_LENGTH}
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        selectTextOnFocus
        editable={editable}
        caretHidden
      />
    </Animated.View>
  );
}

export default function OtpScreen() {
  const router = useRouter();
  const { phone = '' } = useLocalSearchParams<{ phone: string }>();
  const setTokens = useAuthStore((s) => s.setTokens);

  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const [canResend, setCanResend] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const [shakeToken, setShakeToken] = useState(0);

  const inputRefs = useRef<(TextInput | null)[]>(Array(OTP_LENGTH).fill(null));
  // Guards against the auto-submit effect and a manual button tap racing
  // each other into two concurrent verify calls.
  const verifyingRef = useRef(false);

  // Auto-focus first box on mount
  useEffect(() => {
    const t = setTimeout(() => inputRefs.current[0]?.focus(), 300);
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

  const handleChange = useCallback(
    (text: string, index: number) => {
      setError('');
      const cleaned = text.replace(/\D/g, '');

      if (cleaned.length === 0) {
        // Cleared via backspace or delete
        const newDigits = [...digits];
        newDigits[index] = '';
        setDigits(newDigits);
        return;
      }

      // Typing a new digit into an already-filled box (RN sends "oldDigit + newDigit")
      if (cleaned.length === 2 && cleaned[0] === digits[index] && digits[index] !== '') {
        const newDigits = [...digits];
        newDigits[index] = cleaned[1];
        setDigits(newDigits);
        tapSelect();
        if (index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus();
        return;
      }

      // SMS autofill or paste — fill all boxes at once
      if (cleaned.length > 1) {
        const newDigits = Array(OTP_LENGTH).fill('');
        cleaned
          .slice(0, OTP_LENGTH)
          .split('')
          .forEach((d, i) => { newDigits[i] = d; });
        setDigits(newDigits);
        tapSelect();
        inputRefs.current[Math.min(cleaned.length - 1, OTP_LENGTH - 1)]?.focus();
        return;
      }

      // Normal single digit
      const newDigits = [...digits];
      newDigits[index] = cleaned;
      setDigits(newDigits);
      tapSelect();
      if (cleaned && index < OTP_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    [digits],
  );

  const handleKeyPress = useCallback(
    (key: string, index: number) => {
      if (key === 'Backspace' && !digits[index] && index > 0) {
        // Move to previous box when backspacing on an empty box
        const newDigits = [...digits];
        newDigits[index - 1] = '';
        setDigits(newDigits);
        inputRefs.current[index - 1]?.focus();
      }
    },
    [digits],
  );

  const otp = digits.join('');
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
      // Clear boxes and re-focus first on error
      setDigits(Array(OTP_LENGTH).fill(''));
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } finally {
      verifyingRef.current = false;
      setLoading(false);
    }
  }, [isFilled, otp, setTokens]);

  // The whole point: once the last digit lands — typed, pasted, or
  // SMS-autofilled — verification starts on its own, no button tap needed.
  // Deferred a tick so the setState calls inside handleVerify don't run
  // synchronously from within the effect body.
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
      setDigits(Array(OTP_LENGTH).fill(''));
      setCountdown(RESEND_SECONDS);
      setCanResend(false);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
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

          {/* OTP boxes */}
          <ShakeView
            trigger={shakeToken}
            entering={FadeInDown.duration(400).delay(80).springify()}
            style={styles.boxRow}
          >
            {digits.map((d, i) => (
              <OtpDigitBox
                key={i}
                value={d}
                focused={focusedIndex === i}
                hasError={!!error}
                editable={!loading}
                refCallback={(el) => { inputRefs.current[i] = el; }}
                onChangeText={(text) => handleChange(text, i)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
                onFocus={() => setFocusedIndex(i)}
                onBlur={() => setFocusedIndex(null)}
              />
            ))}
          </ShakeView>

          {error ? (
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
  boxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  box: {
    width: 48,
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E8D5CC',
    backgroundColor: '#FFFFFF',
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: '#1A1A1A',
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

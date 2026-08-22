import axios from 'axios';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authApi } from '@/api/auth.api';
import { authService, FirebaseAuthError, getFirebaseAuthErrorMessage, toIndianE164 } from '@/services/authService';
import { useAuthStore } from '@/store/authStore';
import { ManropeWeights } from '@/constants/theme';

const OTP_LENGTH = 6;
const RESEND_SECONDS = 60;

function formatPhone(phone: string): string {
  if (phone.length <= 5) return `+91 ${phone}`;
  return `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`;
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

  const inputRefs = useRef<(TextInput | null)[]>(Array(OTP_LENGTH).fill(null));

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
        inputRefs.current[Math.min(cleaned.length - 1, OTP_LENGTH - 1)]?.focus();
        return;
      }

      // Normal single digit
      const newDigits = [...digits];
      newDigits[index] = cleaned;
      setDigits(newDigits);
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

  const handleVerify = async () => {
    if (!isFilled || loading) return;
    setLoading(true);
    setError('');
    try {
      const idToken = await authService.confirmOtp(otp);
      const res = await authApi.verifyFirebaseToken(idToken);
      // setTokens → isAuthenticated = true → AuthProvider navigates to home
      setTokens(res.token, res.refreshToken, String(res.userId));
    } catch (err: unknown) {
      const msg = err instanceof FirebaseAuthError
        ? getFirebaseAuthErrorMessage(err)
        : axios.isAxiosError(err)
          ? ((err.response?.data as { message?: string })?.message ?? 'Invalid OTP. Please try again.')
          : 'Something went wrong. Please try again.';
      setError(msg);
      // Clear boxes and re-focus first on error
      setDigits(Array(OTP_LENGTH).fill(''));
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
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

          <Text style={styles.heading}>Verify OTP</Text>
          {!!phone && (
            <Text style={styles.sub}>
              Code sent to{' '}
              <Text style={styles.phoneHighlight}>{formatPhone(phone)}</Text>
            </Text>
          )}

          {/* OTP boxes */}
          <View style={styles.boxRow}>
            {Array.from({ length: OTP_LENGTH }).map((_, i) => (
              <TextInput
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                style={[
                  styles.box,
                  focusedIndex === i && styles.boxFocused,
                  !!digits[i] && styles.boxFilled,
                  !!error && styles.boxError,
                ]}
                value={digits[i]}
                onChangeText={(text) => handleChange(text, i)}
                onKeyPress={({ nativeEvent }) =>
                  handleKeyPress(nativeEvent.key, i)
                }
                onFocus={() => setFocusedIndex(i)}
                onBlur={() => setFocusedIndex(null)}
                keyboardType="number-pad"
                // Allow up to OTP_LENGTH chars so SMS autofill & paste work on box 0
                maxLength={OTP_LENGTH}
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                selectTextOnFocus
                editable={!loading}
                caretHidden
              />
            ))}
          </View>

          {!!error && <Text style={styles.errorText}>{error}</Text>}

          {/* Verify */}
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
      </KeyboardAvoidingView>
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

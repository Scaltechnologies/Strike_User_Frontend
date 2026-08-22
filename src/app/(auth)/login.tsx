import { useState } from 'react';
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
import { useRouter } from 'expo-router';

import { authService, getFirebaseAuthErrorMessage, toIndianE164 } from '@/services/authService';
import { ROUTES } from '@/constants/routes';
import { ManropeWeights } from '@/constants/theme';

const INDIA_PHONE_RE = /^[6-9]\d{9}$/;

export default function LoginScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isValid = INDIA_PHONE_RE.test(phone);

  const handlePhoneChange = (text: string) => {
    setError('');
    setPhone(text.replace(/\D/g, '').slice(0, 10));
  };

  const handleGetOtp = async () => {
    // TEMPORARY — proves the button press is actually reaching this handler and, separately,
    // that it's actually calling authService.sendOtp (vs. e.g. bailing out on the isValid guard).
    console.log('[OTP-DIAG] handleGetOtp() pressed. isValid =', isValid);
    if (!isValid) {
      setError('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      console.log('[OTP-DIAG] calling authService.sendOtp()');
      await authService.sendOtp(toIndianE164(phone));
      console.log('[OTP-DIAG] authService.sendOtp() returned without throwing');
      router.push({
        pathname: ROUTES.AUTH.OTP,
        params: { phone },
      });
    } catch (err: unknown) {
      console.log('[OTP-DIAG] authService.sendOtp() threw:', err instanceof Error ? err.message : String(err));
      setError(getFirebaseAuthErrorMessage(err));
    } finally {
      setLoading(false);
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
          {/* TEMPORARY — unmissable on-screen proof of which JS bundle is running.
              Remove alongside the other [OTP-DIAG] diagnostics. */}
          <View style={{ backgroundColor: '#FF00FF', padding: 8, marginBottom: 12 }}>
            <Text style={{ color: '#FFFFFF', fontWeight: '900', textAlign: 'center' }}>
              BUNDLE-VERIFY-1 (login.tsx / Front_End)
            </Text>
          </View>

          {/* Logo */}
          <View style={styles.logoRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>S</Text>
            </View>
            <Text style={styles.appName}>STRIKE</Text>
          </View>

          <Text style={styles.heading}>Welcome back!</Text>
          <Text style={styles.sub}>Enter your mobile number to continue</Text>

          {/* Phone input */}
          <View style={[styles.inputRow, !!error && styles.inputRowError]}>
            <View style={styles.countryCode}>
              <Text style={styles.countryCodeText}>🇮🇳  +91</Text>
            </View>
            <View style={styles.divider} />
            <TextInput
              style={styles.phoneInput}
              placeholder="98765 43210"
              placeholderTextColor="#C4A090"
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              maxLength={10}
              value={phone}
              onChangeText={handlePhoneChange}
              returnKeyType="done"
              onSubmitEditing={handleGetOtp}
              editable={!loading}
              autoFocus
            />
          </View>

          {!!error && <Text style={styles.errorText}>{error}</Text>}

          <Pressable
            style={[styles.button, (!isValid || loading) && styles.buttonDisabled]}
            onPress={handleGetOtp}
            disabled={!isValid || loading}
          >
            {loading
              ? <ActivityIndicator size="small" color="#FFFFFF" />
              : <Text style={styles.buttonText}>Get OTP</Text>
            }
          </Pressable>

          <Text style={styles.disclaimer}>
            By continuing you agree to our{' '}
            <Text style={styles.disclaimerLink}>Terms of Service</Text>
            {' '}and{' '}
            <Text style={styles.disclaimerLink}>Privacy Policy</Text>
          </Text>
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
    paddingTop: 48,
    paddingBottom: 40,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 56,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#C0392B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: ManropeWeights.extraBold,
    color: '#FFFFFF',
  },
  appName: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: ManropeWeights.extraBold,
    color: '#1A1A1A',
    letterSpacing: 4,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: '#1A1A1A',
    marginBottom: 8,
  },
  sub: {
    fontSize: 15,
    color: '#666666',
    marginBottom: 36,
    lineHeight: 22,
    fontFamily: ManropeWeights.regular,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E8D5CC',
    height: 56,
    overflow: 'hidden',
    marginBottom: 8,
  },
  inputRowError: {
    borderColor: '#E74C3C',
  },
  countryCode: {
    paddingHorizontal: 14,
    height: '100%',
    justifyContent: 'center',
  },
  countryCodeText: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
    color: '#1A1A1A',
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: '#E8D5CC',
    marginRight: 2,
  },
  phoneInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 12,
    fontSize: 17,
    fontWeight: '500',
    fontFamily: ManropeWeights.medium,
    color: '#1A1A1A',
  },
  errorText: {
    fontSize: 13,
    color: '#E74C3C',
    marginBottom: 16,
    marginLeft: 4,
    fontFamily: ManropeWeights.regular,
  },
  button: {
    backgroundColor: '#C0392B',
    borderRadius: 14,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
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
  disclaimer: {
    fontSize: 12,
    color: '#999999',
    textAlign: 'center',
    lineHeight: 18,
    fontFamily: ManropeWeights.regular,
  },
  disclaimerLink: {
    color: '#C0392B',
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
  },
});

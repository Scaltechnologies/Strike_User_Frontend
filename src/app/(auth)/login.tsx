import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { KeyboardAvoidingScreen } from '@/components/ui/KeyboardAvoidingScreen';
import { authService, getFirebaseAuthErrorMessage, toIndianE164 } from '@/services/authService';
import { ROUTES } from '@/constants/routes';
import { ManropeWeights } from '@/constants/theme';

const INDIA_PHONE_RE = /^[6-9]\d{9}$/;

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isValid = INDIA_PHONE_RE.test(phone);

  const handlePhoneChange = (text: string) => {
    setError('');
    setPhone(text.replace(/\D/g, '').slice(0, 10));
  };

  const handleGetOtp = async () => {
    if (!isValid) {
      setError('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await authService.sendOtp(toIndianE164(phone));
      router.push({
        pathname: ROUTES.AUTH.OTP,
        params: { phone },
      });
    } catch (err: unknown) {
      setError(getFirebaseAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Note: no `fontWeight` alongside Manrope families — on Android that combo
  // can drop the custom font and fall back to the device's system font.
  return (
    <View style={styles.root}>
      {/* Peach only behind the status bar */}
      <View style={{ height: insets.top, backgroundColor: PEACH }} />
      <KeyboardAvoidingScreen style={styles.kav}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Hero illustration — shown in full, card starts below it */}
          <Image
            source={require('@/assets/images/login-hero.png')}
            style={styles.hero}
            contentFit="contain"
          />

          <View style={styles.card}>
            <Text style={styles.heading}>Welcome back!</Text>
            <Text style={styles.sub}>Enter your mobile number to continue</Text>

            <Text style={styles.label}>Phone Number</Text>
            <View style={[styles.inputRow, !!error && styles.inputRowError]}>
              <Text style={styles.countryCode}>🇮🇳 +91</Text>
              <View style={styles.divider} />
              <TextInput
                style={styles.phoneInput}
                placeholder="98765 43210"
                placeholderTextColor="#C9C9C9"
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
              style={({ pressed }) => [
                styles.button,
                (!isValid || loading) && styles.buttonDisabled,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleGetOtp}
              disabled={!isValid || loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" style={styles.spinner} />
              ) : (
                <>
                  <Text style={styles.buttonText}>Get OTP</Text>
                  <SymbolView
                    name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }}
                    size={26}
                    weight="semibold"
                    tintColor="#FFFFFF"
                  />
                </>
              )}
            </Pressable>

            <Text style={styles.disclaimer}>
              By continuing you agree to our{' '}
              <Text
                style={styles.disclaimerLink}
                onPress={() => router.push(ROUTES.LEGAL.TERMS as never)}
                suppressHighlighting
              >
                Terms of Service
              </Text>
              {' '}and{' '}
              <Text
                style={styles.disclaimerLink}
                onPress={() => router.push(ROUTES.LEGAL.PRIVACY as never)}
                suppressHighlighting
              >
                Privacy Policy
              </Text>
            </Text>

            <View style={styles.spacer} />

            <Text style={styles.tagline}>Think Smartly Save monthly .</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingScreen>
    </View>
  );
}

const PEACH = '#FFE0CC';
const RED = '#E32622';

const styles = StyleSheet.create({
  // White everywhere except the status-bar strip, so any gap left when the
  // keyboard-avoiding view resizes (e.g. above the Android nav bar) stays
  // white instead of showing peach.
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  kav: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    backgroundColor: '#FFFFFF',
  },
  scroll: {
    flexGrow: 1,
    backgroundColor: PEACH,
  },
  hero: {
    width: '100%',
    aspectRatio: 750 / 334,
  },
  card: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    paddingHorizontal: 22,
    paddingTop: 30,
    paddingBottom: 32,
  },
  heading: {
    fontSize: 26,
    fontFamily: ManropeWeights.bold,
    color: '#1A1A1A',
    marginBottom: 6,
  },
  sub: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: ManropeWeights.regular,
    color: '#666666',
    marginBottom: 24,
  },
  label: {
    fontSize: 15,
    fontFamily: ManropeWeights.bold,
    color: '#1A1A1A',
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 66,
    borderRadius: 18,
    backgroundColor: '#F4F4F4',
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: 16,
  },
  inputRowError: {
    borderColor: '#E74C3C',
  },
  countryCode: {
    fontSize: 17,
    fontFamily: ManropeWeights.semiBold,
    color: '#1A1A1A',
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: '#D6D6D6',
    marginHorizontal: 12,
  },
  phoneInput: {
    flex: 1,
    height: '100%',
    fontSize: 22,
    fontFamily: ManropeWeights.semiBold,
    color: '#1A1A1A',
    letterSpacing: 1,
  },
  errorText: {
    fontSize: 13,
    color: '#E74C3C',
    marginTop: 8,
    marginLeft: 4,
    fontFamily: ManropeWeights.regular,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: RED,
    borderRadius: 24,
    height: 62,
    paddingHorizontal: 28,
    marginTop: 18,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  spinner: {
    flex: 1,
  },
  buttonText: {
    fontSize: 17,
    fontFamily: ManropeWeights.bold,
    color: '#FFFFFF',
  },
  disclaimer: {
    marginTop: 16,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    color: '#999999',
    fontFamily: ManropeWeights.regular,
  },
  disclaimerLink: {
    color: '#999999',
    fontFamily: ManropeWeights.semiBold,
  },
  spacer: {
    flex: 1,
    minHeight: 32,
  },
  tagline: {
    fontSize: 16,
    fontFamily: ManropeWeights.bold,
    color: '#A3A3A3',
    textAlign: 'center',
  },
});

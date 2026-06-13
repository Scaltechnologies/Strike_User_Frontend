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
import axios from 'axios';

import { authApi } from '@/api/auth.api';
import { ROUTES } from '@/constants/routes';

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
    if (!isValid) {
      setError('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await authApi.sendOtp(phone);
      router.push({
        pathname: ROUTES.AUTH.OTP,
        params: { phone },
      });
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(
          (err.response?.data as { message?: string })?.message ??
            'Failed to send OTP. Please try again.',
        );
      } else {
        setError('Something went wrong. Please try again.');
      }
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
    color: '#FFFFFF',
  },
  appName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1A1A1A',
    letterSpacing: 4,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  sub: {
    fontSize: 15,
    color: '#666666',
    marginBottom: 36,
    lineHeight: 22,
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
    color: '#1A1A1A',
  },
  errorText: {
    fontSize: 13,
    color: '#E74C3C',
    marginBottom: 16,
    marginLeft: 4,
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
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  disclaimer: {
    fontSize: 12,
    color: '#999999',
    textAlign: 'center',
    lineHeight: 18,
  },
  disclaimerLink: {
    color: '#C0392B',
    fontWeight: '600',
  },
});

// First-login profile completion — forced by AuthProvider's route guard
// whenever an authenticated user's profile has no name yet (a brand-new
// account, right after OTP verify). There is deliberately no back button:
// this is the one thing every new user must do before reaching the rest of
// the app, not an optional settings screen someone has to go looking for
// (see the Notifications toggle default — same underlying complaint: don't
// make the user hunt for something they'd obviously want set up already).
// Gender/email can still be changed later from Profile > Edit Profile.

import { useState } from 'react';
import {
  ActivityIndicator,
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
import { Check, User } from 'lucide-react-native';

import { KeyboardAvoidingScreen } from '@/components/ui/KeyboardAvoidingScreen';
import { PressableScale } from '@/components/ui/PressableScale';
import { useProfile, useUpdateProfile } from '@/hooks/useProfile';
import { ROUTES } from '@/constants/routes';
import { ManropeWeights } from '@/constants/theme';
import type { Gender } from '@/types/user';

const C = {
  accent:      '#D63527',
  accentSoft:  '#FEF2EF',
  bg:          '#F2F2F7',
  surface:     '#FFFFFF',
  border:      '#E8E8ED',
  primary:     '#0D0D0D',
  secondary:   '#5C5C5C',
  muted:       '#AEAEB2',
  placeholder: '#C7C7CC',
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function GenderOption({
  label, selected, onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.genderOption, selected && styles.genderOptionSelected]}
      onPress={onPress}
    >
      <Text style={[styles.genderOptionText, selected && styles.genderOptionTextSelected]}>
        {label}
      </Text>
      {selected ? <Check size={15} color="#FFFFFF" strokeWidth={2.6} /> : null}
    </Pressable>
  );
}

export default function CompleteProfileScreen() {
  const router = useRouter();
  const { data: profile } = useProfile();
  const { mutate, isPending } = useUpdateProfile();

  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const emailValid = trimmedEmail.length === 0 || EMAIL_RE.test(trimmedEmail);
  const canContinue = trimmedName.length > 0 && gender != null && emailValid && !isPending;

  const handleContinue = () => {
    if (!canContinue) return;
    setError(null);
    mutate(
      { name: trimmedName, gender: gender!, email: trimmedEmail || undefined },
      {
        onSuccess: () => router.replace(ROUTES.TABS.HOME),
        onError: () => setError("Couldn't save right now — please try again."),
      },
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <KeyboardAvoidingScreen style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroIconWrap}>
            <User size={26} color={C.accent} strokeWidth={2} />
          </View>
          <Text style={styles.title}>Welcome to Strike</Text>
          <Text style={styles.subtitle}>
            {profile?.phone ? `+91 ${profile.phone}` : 'A few quick details to set up your account'}
          </Text>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Full name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Enter your name"
              placeholderTextColor={C.placeholder}
              autoCapitalize="words"
              returnKeyType="next"
              autoFocus
            />
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Gender</Text>
            <View style={styles.genderRow}>
              <GenderOption label="Male" selected={gender === 'MALE'} onPress={() => setGender('MALE')} />
              <GenderOption label="Female" selected={gender === 'FEMALE'} onPress={() => setGender('FEMALE')} />
            </View>
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>
              Email{'  '}
              <Text style={styles.fieldLabelOptional}>optional</Text>
            </Text>
            <TextInput
              style={[styles.input, !emailValid && styles.inputError]}
              value={email}
              onChangeText={setEmail}
              placeholder="your@email.com"
              placeholderTextColor={C.placeholder}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleContinue}
            />
            {!emailValid ? <Text style={styles.fieldError}>Enter a valid email address</Text> : null}
          </View>

          {error ? <Text style={styles.formError}>{error}</Text> : null}

          <PressableScale
            style={[styles.continueBtn, !canContinue && styles.continueBtnDisabled]}
            onPress={handleContinue}
            disabled={!canContinue}
          >
            {isPending
              ? <ActivityIndicator size="small" color="#FFFFFF" />
              : <Text style={styles.continueBtnText}>Continue</Text>}
          </PressableScale>
        </ScrollView>
      </KeyboardAvoidingScreen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 32, paddingBottom: 24 },

  heroIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: C.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 22,
    fontFamily: ManropeWeights.extraBold,
    color: C.primary,
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13.5,
    fontFamily: ManropeWeights.medium,
    color: C.secondary,
    marginBottom: 32,
  },

  fieldBlock: { marginBottom: 22 },
  fieldLabel: {
    fontSize: 12.5,
    fontFamily: ManropeWeights.semiBold,
    color: C.secondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  fieldLabelOptional: {
    fontSize: 12,
    fontFamily: ManropeWeights.regular,
    color: C.muted,
    textTransform: 'none',
    letterSpacing: 0,
  },
  input: {
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: ManropeWeights.medium,
    color: C.primary,
  },
  inputError: { borderColor: C.accent },
  fieldError: {
    fontSize: 11.5,
    fontFamily: ManropeWeights.medium,
    color: C.accent,
    marginTop: 6,
  },

  genderRow: { flexDirection: 'row', gap: 12 },
  genderOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 14,
    paddingVertical: 14,
  },
  genderOptionSelected: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  genderOptionText: {
    fontSize: 15,
    fontFamily: ManropeWeights.semiBold,
    color: C.primary,
  },
  genderOptionTextSelected: {
    color: '#FFFFFF',
  },

  formError: {
    fontSize: 12.5,
    fontFamily: ManropeWeights.medium,
    color: C.accent,
    textAlign: 'center',
    marginBottom: 12,
  },

  continueBtn: {
    backgroundColor: C.accent,
    borderRadius: 16,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    ...Platform.select({
      ios: { shadowColor: C.accent, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12 },
      android: { elevation: 3 },
    }),
  },
  continueBtnDisabled: { opacity: 0.4 },
  continueBtnText: {
    fontSize: 15.5,
    fontFamily: ManropeWeights.bold,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});

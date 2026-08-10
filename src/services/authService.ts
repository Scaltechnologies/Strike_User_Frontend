// Firebase Phone Auth wrapper.
//
// TEMPORARILY UNUSED — login.tsx/otp.tsx currently call authApi.sendOtp/
// verifyOtp (the legacy mock-OTP backend flow, fixed code 123456) instead,
// because Firebase phone auth doesn't work reliably on this development APK.
// Switch the two screens back to this module once Firebase native auth is
// confirmed working on a dev build again — the logic below is unchanged.
//
// Firebase sends/verifies the SMS code directly (native autofill + Play
// Integrity on Android). Screens never see raw OTP transport — they get an
// ID token back from confirmOtp() and hand that to authApi.verifyFirebaseToken,
// which exchanges it for the app's own JWT/refresh token pair.

import { LogBox } from 'react-native';
import { getAuth, signInWithPhoneNumber, getIdToken } from '@react-native-firebase/auth';
import type { ConfirmationResult } from '@react-native-firebase/auth';

// Firebase auth errors below are always caught and surfaced as friendly UI
// copy (see login.tsx / otp.tsx's FIREBASE_ERROR_MESSAGES maps) — they're
// expected, handled errors, not crashes. Without this, the console.error a
// few lines down pops LogBox's full-screen redbox over the app on every
// throttled/expired/wrong-code attempt, which reads as a crash to testers.
LogBox.ignoreLogs(['[authService] Firebase auth error:']);

export class FirebaseAuthError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function toFirebaseAuthError(err: unknown): FirebaseAuthError {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : 'auth/unknown';
  const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
  // Raw code/message logged here so misconfiguration (e.g. missing SHA
  // fingerprint -> auth/invalid-app-credential) isn't masked by whatever
  // generic copy the screen falls back to for unmapped codes. Suppressed
  // from the LogBox overlay above, but still visible in the Metro/logcat
  // console.
  console.error('[authService] Firebase auth error:', code, message);
  return new FirebaseAuthError(code, message);
}

// Not serializable — kept in module scope rather than passed through
// router params between login.tsx and otp.tsx.
let confirmation: ConfirmationResult | null = null;

export const authService = {
  async sendOtp(fullPhoneNumber: string): Promise<void> {
    try {
      confirmation = await signInWithPhoneNumber(getAuth(), fullPhoneNumber);
    } catch (err) {
      throw toFirebaseAuthError(err);
    }
  },

  async confirmOtp(code: string): Promise<string> {
    if (!confirmation) {
      throw new FirebaseAuthError(
        'auth/session-expired',
        'OTP session expired. Please resend the code.',
      );
    }
    try {
      const credential = await confirmation.confirm(code);
      if (!credential) {
        throw new FirebaseAuthError('auth/invalid-verification-code', 'Invalid OTP. Please try again.');
      }
      return await getIdToken(credential.user);
    } catch (err) {
      throw err instanceof FirebaseAuthError ? err : toFirebaseAuthError(err);
    }
  },
};

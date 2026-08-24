// Firebase Phone Auth wrapper — used directly by login.tsx/otp.tsx.
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

// ============================================================================
// TEMPORARY DIAGNOSTIC LOGGING — added solely to pin down why real-user Phone
// Auth OTPs resolve "successfully" but no SMS is ever delivered. Logs only
// presence/booleans/error codes/masked numbers — never OTPs, ID tokens,
// refresh tokens, verificationIds, or full phone numbers. Remove once the
// root cause is found and fixed.
// ============================================================================
const DIAG = '[OTP-DIAG]';

/** Keeps country code + last 2 digits only, e.g. "+9198*******10". Never logs the full number. */
function maskPhone(phone: string): string {
  if (phone.length <= 6) return '***';
  return `${phone.slice(0, 4)}${'*'.repeat(phone.length - 6)}${phone.slice(-2)}`;
}

export const authService = {
  async sendOtp(fullPhoneNumber: string): Promise<void> {
    console.log(DIAG, 'OTP request started. mobile =', maskPhone(fullPhoneNumber));
    try {
      console.log(DIAG, 'signInWithPhoneNumber() invocation started');
      // Reassigning module-scoped `confirmation` here is what makes resend correct: a fresh call
      // (initial send or resend) always replaces whatever session was previously active, so there
      // is never more than one live confirmation session and confirmOtp() always checks against
      // the most recent one.
      const result = await signInWithPhoneNumber(getAuth(), fullPhoneNumber);
      confirmation = result;
      console.log(
        DIAG,
        'signInWithPhoneNumber() resolved. gotConfirmationResult =', !!result,
        '| hasVerificationId =', !!result?.verificationId,
      );
    } catch (err) {
      const mapped = toFirebaseAuthError(err);
      console.log(DIAG, 'signInWithPhoneNumber() threw. code =', mapped.code, '| message =', mapped.message);
      throw mapped;
    }
  },

  async confirmOtp(code: string): Promise<string> {
    console.log(DIAG, 'OTP verification stage started. hasActiveConfirmation =', !!confirmation);
    if (!confirmation) {
      throw new FirebaseAuthError(
        'auth/session-expired',
        'OTP session expired. Please resend the code.',
      );
    }
    try {
      const credential = await confirmation.confirm(code);
      console.log(DIAG, 'confirmation.confirm() resolved. gotCredential =', !!credential);
      if (!credential) {
        throw new FirebaseAuthError('auth/invalid-verification-code', 'Invalid OTP. Please try again.');
      }
      const idToken = await getIdToken(credential.user);
      console.log(DIAG, 'Verification succeeded. gotIdToken =', !!idToken);
      return idToken;
    } catch (err) {
      const mapped = err instanceof FirebaseAuthError ? err : toFirebaseAuthError(err);
      console.log(DIAG, 'Verification failed. code =', mapped.code);
      throw mapped;
    }
  },
};

/** India-only number entry (see login.tsx's INDIA_PHONE_RE) — the UI has no country-code
 *  selector/state to reuse, so this is the single place the +91 prefix is applied before a
 *  number ever reaches Firebase. */
export function toIndianE164(tenDigitMobileNumber: string): string {
  return `+91${tenDigitMobileNumber}`;
}

const FIREBASE_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-phone-number': 'Please enter a valid mobile number.',
  'auth/too-many-requests': 'Too many attempts. Please wait and try again later.',
  'auth/quota-exceeded': 'OTP service limit reached. Please try again later.',
  'auth/network-request-failed': 'Network error. Please check your internet connection.',
  'auth/app-not-authorized': 'This device could not be verified. Please update the app and try again.',
  'auth/invalid-app-credential': 'This device could not be verified. Please update the app and try again.',
  'auth/invalid-verification-code': 'The OTP is incorrect. Please try again.',
  'auth/code-expired': 'This OTP has expired. Please request a new OTP.',
  'auth/session-expired': 'Your verification session has expired. Please request a new OTP.',
};

const DEFAULT_AUTH_ERROR_MESSAGE = 'Something went wrong. Please try again.';

/** Maps a FirebaseAuthError (or any other thrown value) to safe, user-facing copy — never the
 *  raw Firebase message/stack. Unmapped codes fall back to the same generic copy the screens
 *  already used for non-Firebase errors, so behavior for an unrecognized code is unchanged. */
export function getFirebaseAuthErrorMessage(err: unknown): string {
  if (err instanceof FirebaseAuthError) {
    return FIREBASE_ERROR_MESSAGES[err.code] ?? DEFAULT_AUTH_ERROR_MESSAGE;
  }
  return DEFAULT_AUTH_ERROR_MESSAGE;
}

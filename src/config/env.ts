const ENV = {
  // All traffic routes through the strike-gateway.
  // Android emulator reaches host machine via 10.0.2.2.
  // iOS simulator uses localhost. Physical devices need the LAN IP set in .env.
  API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://10.0.2.2:3000',
  API_TIMEOUT_MS: Number(process.env.EXPO_PUBLIC_API_TIMEOUT_MS ?? '10000'),

  // Places API (New) — Set Location search (see src/services/googlePlacesService.ts).
  // A client-embedded Places key isn't a backend secret (the app must be able to
  // call Google directly) — it's secured by Google Cloud Console restrictions
  // (API restriction to Places API (New); app restriction where configured), not
  // by keeping it out of the bundle. See the Google integration report for the
  // exact Cloud Console setup required. Leave unset to disable Google search —
  // Set Location then falls back to the Nominatim implementation only.
  GOOGLE_PLACES_API_KEY: process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ?? '',

  // Optional Android app-restriction: the SHA-1 fingerprint (hex, no colons) of
  // the signing certificate used for this build (differs between a debug/EAS
  // preview keystore and the production keystore) — required only if the
  // Places key is configured with an Android application restriction in Cloud
  // Console. Get it via `eas credentials` or Play Console → App integrity.
  GOOGLE_ANDROID_CERT_SHA1: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CERT_SHA1 ?? '',

  // Must match app.json's ios.bundleIdentifier / android.package — there's no
  // runtime API to read these from JS, so they're duplicated here for the
  // X-Ios-Bundle-Identifier / X-Android-Package request headers Google checks
  // against an application-restricted key. Keep in sync if the app id changes.
  APP_IDENTIFIER: 'com.strike.userapp',
} as const;

export default ENV;

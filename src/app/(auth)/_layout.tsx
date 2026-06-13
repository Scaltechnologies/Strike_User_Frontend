// Auth group Stack — Phase 2 will add screen-specific options (no header,
// custom transitions) once login and OTP screens are implemented.

import { Stack } from 'expo-router';

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}

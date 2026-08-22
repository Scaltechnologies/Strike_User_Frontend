// Auth group Stack — no header, consistent slide transition matching the
// root Stack's (login → OTP is a linear forward flow).

import { Stack } from 'expo-router';

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}

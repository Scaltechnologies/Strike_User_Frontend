// Root layout — wraps the entire app in providers and defines the root
// Stack navigator. Every route group ((auth), (tabs), etc.) defines its own
// inner navigator in its own _layout.tsx.
//
// Provider order matters:
//   GestureHandlerRootView  — must be outermost for gesture-handler to work
//   ThemeProvider           — react-navigation theme (dark/light)
//   QueryProvider           — TanStack Query client
//   MaintenanceProvider     — renders MaintenanceScreen in place of everything
//                             below it while maintenance mode is on
//   AuthProvider            — bootstraps tokens, guards routes
//     Stack                 — root navigator (headerShown: false globally)

import {
  Manrope_300Light,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider } from '@/providers/AuthProvider';
import { MaintenanceProvider } from '@/providers/MaintenanceProvider';
import { NotificationProvider } from '@/providers/NotificationProvider';
import { QueryProvider } from '@/providers/QueryProvider';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts({
    Manrope_300Light,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider
        value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}
      >
        <QueryProvider>
          <MaintenanceProvider>
            <AuthProvider>
              <NotificationProvider>
                <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
              </NotificationProvider>
            </AuthProvider>
          </MaintenanceProvider>
        </QueryProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

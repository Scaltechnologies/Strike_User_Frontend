// Root layout — wraps the entire app in providers and defines the root
// Stack navigator. Every route group ((auth), (tabs), etc.) defines its own
// inner navigator in its own _layout.tsx.
//
// Provider order matters:
//   GestureHandlerRootView  — must be outermost for gesture-handler to work
//   ThemeProvider           — react-navigation theme (dark/light)
//   QueryProvider           — TanStack Query client
//   AuthProvider            — bootstraps tokens, guards routes
//     Stack                 — root navigator (headerShown: false globally)

import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider } from '@/providers/AuthProvider';
import { QueryProvider } from '@/providers/QueryProvider';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider
        value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}
      >
        <QueryProvider>
          <AuthProvider>
            <Stack screenOptions={{ headerShown: false }} />
          </AuthProvider>
        </QueryProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

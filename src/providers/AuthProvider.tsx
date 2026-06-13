// Bootstraps auth state from secure storage on mount, then guards routes.
//
// Two responsibilities:
//   1. Call bootstrapAuth() once so the store hydrates before any screen renders.
//   2. Watch isAuthenticated + current segments and redirect when the user
//      lands in the wrong group (unauthenticated on a protected route, or
//      authenticated on an auth route).
//
// This component must sit INSIDE the expo-router <Stack> tree so that
// useRouter / useSegments have access to navigation context.

import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';

import { ROUTES } from '@/constants/routes';
import { useAuthStore } from '@/store/authStore';

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { isAuthenticated, isBootstrapping } = useAuthStore();
  const router = useRouter();
  const segments = useSegments();

  // Hydrate tokens from secure storage exactly once on mount.
  useEffect(() => {
    useAuthStore.getState().bootstrapAuth();
  }, []);

  // Route guard — runs after hydration completes and whenever auth changes
  // (e.g. the user logs in, logs out, or a token refresh permanently fails).
  useEffect(() => {
    if (isBootstrapping) return;

    // Cast to string — useSegments() returns typed segment unions that don't
    // include group names like '(auth)', but expo-router does return them at runtime.
    const inAuthGroup = (segments as string[])[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      // Unauthenticated user tried to access a protected route.
      router.replace(ROUTES.AUTH.LOGIN);
    } else if (isAuthenticated && inAuthGroup) {
      // Authenticated user is sitting on a login/OTP screen.
      router.replace(ROUTES.TABS.HOME);
    }
  }, [isAuthenticated, isBootstrapping, segments, router]);

  return <>{children}</>;
}

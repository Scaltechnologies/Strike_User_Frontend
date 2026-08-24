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
import { consumePendingDeepLink, syncPushTokenIfEnabled } from '@/services/notificationService';

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
  //
  // A cold-start notification tap's destination (see notificationService.ts's
  // consumePendingDeepLink) is flushed at the end of this SAME effect, after
  // the guard has settled where an unauthenticated/authenticated user
  // actually belongs — never in a separate effect, which could race this one
  // and have its navigation immediately overwritten by the guard's own
  // redirect. It's deliberately not flushed on the unauthenticated branch:
  // there's nothing meaningful to open yet, and it stays queued (consumed
  // only on success) until the user actually signs in.
  useEffect(() => {
    if (isBootstrapping) return;

    // Cast to string — useSegments() returns typed segment unions that don't
    // include group names like '(auth)', but expo-router does return them at runtime.
    const inAuthGroup = (segments as string[])[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      // Unauthenticated user tried to access a protected route.
      router.replace(ROUTES.AUTH.LOGIN);
      return;
    }
    if (isAuthenticated && inAuthGroup) {
      // Authenticated user is sitting on a login/OTP screen.
      router.replace(ROUTES.TABS.HOME);
    }
    if (isAuthenticated) {
      const pending = consumePendingDeepLink();
      if (pending) router.push(pending as never);
    }
  }, [isAuthenticated, isBootstrapping, segments, router]);

  // Re-point this device's push-token registration at whichever account is
  // now signed in — a fresh login, a session restored from secure storage on
  // launch, or a different account signing in on the same device all land
  // here. Only registers if the user had previously opted in on this
  // install (see syncPushTokenIfEnabled) — never prompts for permission and
  // never silently opts someone into push.
  useEffect(() => {
    if (isBootstrapping || !isAuthenticated) return;
    void syncPushTokenIfEnabled();
  }, [isAuthenticated, isBootstrapping]);

  return <>{children}</>;
}

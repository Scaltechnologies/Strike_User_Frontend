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
import { useProfile } from '@/hooks/useProfile';
import { consumePendingDeepLink, syncPushTokenIfEnabled } from '@/services/notificationService';

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { isAuthenticated, isBootstrapping } = useAuthStore();
  const router = useRouter();
  const segments = useSegments();

  // Only fetches once authenticated — see useProfile's `enabled` doc. Backs
  // the forced first-login profile-completion redirect below: a brand-new
  // account's profile is auto-created with no name (getOrCreateProfile,
  // user-service) until the OTP-verify redirect below lands them on
  // /profile/edit, so "no name yet" doubles as "hasn't completed onboarding"
  // with no separate flag needed.
  const { data: profile, isLoading: profileLoading } = useProfile(isAuthenticated && !isBootstrapping);

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
    const onProfileEdit = (segments as string[])[0] === 'profile' && (segments as string[])[1] === 'edit';

    if (!isAuthenticated && !inAuthGroup) {
      // Unauthenticated user tried to access a protected route.
      router.replace(ROUTES.AUTH.LOGIN);
      return;
    }
    if (isAuthenticated && inAuthGroup) {
      // Authenticated user is sitting on a login/OTP screen.
      router.replace(ROUTES.TABS.HOME);
      return;
    }
    // First-login profile completion — forced ahead of everything else an
    // authenticated user could land on (deep link included, so this check
    // sits before that's flushed below). Waits for the profile fetch to
    // actually resolve rather than redirecting on an undefined/loading
    // value, and never redirects away FROM /profile/edit on its own — that
    // screen navigates itself once it saves successfully.
    if (isAuthenticated && !profileLoading && profile && !profile.name.trim() && !onProfileEdit) {
      router.replace(ROUTES.PROFILE_EDIT);
      return;
    }
    if (isAuthenticated) {
      const pending = consumePendingDeepLink();
      if (pending) router.push(pending as never);
    }
  }, [isAuthenticated, isBootstrapping, segments, router, profile, profileLoading]);

  // Re-point this device's push-token registration at whichever account is
  // now signed in — a fresh login, a session restored from secure storage on
  // launch, or a different account signing in on the same device all land
  // here. Registers as long as the local notifications toggle is on — which
  // defaults to true on a fresh install (see storageService.getNotificationsEnabled)
  // rather than requiring the user to find Settings and switch it on themselves;
  // an explicit switch-off is still respected exactly like an explicit opt-in
  // was before. This never itself prompts for OS permission — that's
  // NotificationProvider's initNotifications(), which already runs at app
  // launch regardless of auth state.
  useEffect(() => {
    if (isBootstrapping || !isAuthenticated) return;
    void syncPushTokenIfEnabled();
  }, [isAuthenticated, isBootstrapping]);

  return <>{children}</>;
}

// Static Expo Router path constants for use with router.push / router.replace / <Link>.
// Dynamic segments use builder functions so call sites never hand-roll path strings.

export const ROUTES = {
  INDEX: '/' as const,

  AUTH: {
    ONBOARDING: '/(auth)/onboarding' as const,
    LOGIN: '/(auth)/login' as const,
    OTP: '/(auth)/otp' as const,
  },

  TABS: {
    HOME: '/(tabs)' as const,
    SAVED: '/(tabs)/saved' as const,
    CARDS: '/(tabs)/cards' as const,
    HISTORY: '/(tabs)/history' as const,
    PROFILE: '/(tabs)/profile' as const,
  },

  CHECKOUT: '/checkout' as const,
  REDEEM_SUCCESS: '/redeem/success' as const,
  PROFILE_EDIT: '/profile/edit' as const,
  SEARCH: '/search' as const,
  SUPPORT: '/support' as const,
  TERMS: '/support/terms' as const,
  NOTIFICATIONS: '/notifications' as const,

  SETTINGS: {
    NOTIFICATIONS: '/settings/notifications' as const,
  },
} as const;

// Dynamic route builders — kept separate from ROUTES so the const assertion compiles.
export const buildRoute = {
  storeDetail:          (storeId: string) => `/store/${storeId}` as const,
  cardDetail:           (id: string | number) => `/cards/${id}` as const,
  subscriptionDetail:   (id: string) => `/subscriptions/${id}` as const,
  subscriptionSelect:   (subId: string) => `/subscriptions/select?subId=${subId}` as const,
  subscriptionPending:  (redemptionId: string, subId: string) =>
    `/subscriptions/pending?redemptionId=${redemptionId}&subId=${subId}` as const,
};

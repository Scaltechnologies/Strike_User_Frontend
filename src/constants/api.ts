// All paths are relative to ENV.API_BASE_URL (the strike-gateway).
// The /api prefix is included here so the gateway can route to services.
const P = '/api';

export const API_ENDPOINTS = {
  // PROVISIONAL — path + response shape not yet confirmed against the
  // backend. Meant to be a public (no-auth) endpoint the app can poll on
  // launch to learn about maintenance mode before a user is logged in.
  // Update once the real contract is confirmed. See maintenanceStore.ts.
  APP: {
    STATUS: `${P}/app/status`,
  },

  AUTH: {
    // Verifies the Firebase ID token (via Firebase Admin SDK) and issues the
    // app's own token pair. Currently unused — see SEND_OTP/VERIFY_OTP below.
    FIREBASE_VERIFY: `${P}/auth/user/firebase-verify`,
    // TEMPORARY — legacy mock-OTP flow (fixed code 123456, OTP_PROVIDER=mock
    // on the backend) used in place of Firebase phone auth while testing on
    // a development APK. Switch back to FIREBASE_VERIFY once Firebase native
    // auth works reliably on dev builds.
    SEND_OTP: `${P}/auth/user/send-otp`,
    VERIFY_OTP: `${P}/auth/user/verify-otp`,
    REFRESH: `${P}/auth/refresh`,
    LOGOUT: `${P}/auth/logout`,
  },

  USER: {
    PROFILE: `${P}/user/me`,
    AVATAR:  `${P}/user/me/avatar`,
    // Backend device registration lives in notification-service, not user-service.
    PUSH_TOKEN: `${P}/notifications/me/devices`,
    LOCATION: `${P}/user/me/location`,
  },

  USER_STORES: {
    LIST: `${P}/user/stores`,
    SEARCH: `${P}/user/stores/search`,
    NEARBY: `${P}/user/stores/nearby/me`,
    DETAIL: (storeId: string | number) => `${P}/user/stores/${storeId}`,
    MENU: (storeId: string | number) => `${P}/user/stores/${storeId}/menu`,
  },

  SAVED_STORES: {
    LIST: `${P}/user/me/saved-stores`,
    TOGGLE: (storeId: string) => `${P}/user/me/saved-stores/${storeId}`,
  },

  // Card-service: GET /api/cards/store/{storeId} and GET /api/cards/{id}
  // Response is wrapped in ApiResponse<T> (unlike user-service which returns DTO directly).
  CARDS: {
    BY_STORE: (storeId: string | number) => `${P}/cards/store/${storeId}`,
    BY_ID:    (id: string | number)      => `${P}/cards/${id}`,
  },

  // Card-service subscriptions.
  // All responses are wrapped in ApiResponse<T>.
  // X-User-Id header is injected by the gateway from the JWT — do not set manually.
  SUBSCRIPTIONS: {
    PURCHASE:  `${P}/subscriptions`,
    MY:        `${P}/subscriptions/my`,
    MY_ACTIVE: `${P}/subscriptions/my/active`,
    DETAIL:    (id: string | number) => `${P}/subscriptions/${id}`,
    CANCEL:    (id: string | number) => `${P}/subscriptions/${id}/cancel`,
    // Returns ONLY the categories + items the purchased card covers.
    // This is the redemption menu — NOT the full store menu.
    MENU:      (id: string | number) => `${P}/subscriptions/${id}/menu`,
  },

  REDEMPTIONS: {
    // User-initiated flow (Phase 5)
    REQUEST:         `${P}/redemptions/request`,
    DETAIL:          (id: string | number)      => `${P}/redemptions/${id}`,
    APPROVE:         (id: string | number)      => `${P}/redemptions/${id}/approve`,
    REJECT:          (id: string | number)      => `${P}/redemptions/${id}/reject`,
    STORE_QUEUE:     (storeId: string | number) => `${P}/redemptions/store/${storeId}/queue`,
    // History
    BY_USER:         (userId: string | number)  => `${P}/redemptions/user/${userId}`,
    BY_SUBSCRIPTION: (subId: string | number)   => `${P}/redemptions/subscription/${subId}`,
  },

  LEDGER: {
    TRANSACTIONS: `${P}/user/me/transactions`,
    REDEMPTIONS: `${P}/user/me/redemptions`,
  },

  COUPONS: {
    VALIDATE: `${P}/subscriptions/coupons/validate`,
  },
} as const;

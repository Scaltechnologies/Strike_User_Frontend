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
    PUSH_DEVICE_BY_ID: (id: string | number) => `${P}/notifications/me/devices/${id}`,
    LOCATION: `${P}/user/me/location`,
  },

  // notification-service self-service inbox — GET/PATCH are scoped server-side to the
  // authenticated principal (JWT), never a client-supplied userId. No ApiSuccessResponse
  // wrapper (mirrors admin-service's PageMapper convention — plain JSON body).
  NOTIFICATIONS: {
    INBOX:        `${P}/notifications/me`,
    UNREAD_COUNT: `${P}/notifications/me/unread-count`,
    READ:         (id: string | number) => `${P}/notifications/me/${id}/read`,
    READ_ALL:     `${P}/notifications/me/read-all`,
  },

  USER_STORES: {
    LIST: `${P}/user/stores`,
    SEARCH: `${P}/user/stores/search`,
    NEARBY: `${P}/user/stores/nearby/me`,
    DETAIL: (storeId: string | number) => `${P}/user/stores/${storeId}`,
    MENU: (storeId: string | number) => `${P}/user/stores/${storeId}/menu`,
    CATEGORIES: `${P}/user/stores/categories`,
    BY_CATEGORY: `${P}/user/stores/by-category`,
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
    LOWEST_PRICE_BY_STORES: `${P}/cards/lowest-price-by-stores`,
    // Active cards created in the last 3 days, newest first — backs Home's
    // "New Arrivals" section. Eligibility is computed server-side.
    NEW_ARRIVALS: `${P}/cards/new-arrivals`,
  },

  // Card-service subscriptions.
  // All responses are wrapped in ApiResponse<T>.
  // X-User-Id header is injected by the gateway from the JWT — do not set manually.
  SUBSCRIPTIONS: {
    MY:        `${P}/subscriptions/my`,
    MY_ACTIVE: `${P}/subscriptions/my/active`,
    DETAIL:    (id: string | number) => `${P}/subscriptions/${id}`,
    CANCEL:    (id: string | number) => `${P}/subscriptions/${id}/cancel`,
    // Returns ONLY the categories + items the purchased card covers.
    // This is the redemption menu — NOT the full store menu.
    MENU:      (id: string | number) => `${P}/subscriptions/${id}/menu`,
  },

  // Card-service payments — the only path a USER can turn into a purchased
  // subscription (POST /api/subscriptions itself is now ADMIN-only).
  PAYMENTS: {
    CREATE: `${P}/payments`,
    DETAIL: (id: string | number) => `${P}/payments/${id}`,
    VERIFY: (id: string | number) => `${P}/payments/${id}/verify`,
    CANCEL: (id: string | number) => `${P}/payments/${id}/cancel`,
    RETRY:  (id: string | number) => `${P}/payments/${id}/retry`,
  },

  REDEMPTIONS: {
    // User-initiated flow (Phase 5)
    REQUEST:         `${P}/redemptions/request`,
    DETAIL:          (id: string | number)      => `${P}/redemptions/${id}`,
    APPROVE:         (id: string | number)      => `${P}/redemptions/${id}/approve`,
    REJECT:          (id: string | number)      => `${P}/redemptions/${id}/reject`,
    CANCEL:          (id: string | number)      => `${P}/redemptions/${id}/cancel`,
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
    AVAILABLE: `${P}/subscriptions/coupons/available`,
  },

  // CONFIRMED against admin-service source (Strike_Backend repo): this exact
  // path is explicitly carved out as public in both the gateway's
  // JwtAuthFilter.PUBLIC_PATHS and admin-service's own SecurityConfig/
  // AdminJwtFilter/method-level @PreAuthorize override — reachable with no
  // token, matching AdminBannerController.getForToday()'s semantics (active
  // banners whose validFrom/validUntil currently include today).
  BANNERS: {
    ACTIVE: `${P}/admin/banners/today`,
  },
} as const;

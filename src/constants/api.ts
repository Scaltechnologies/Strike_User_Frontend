// All paths are relative to ENV.API_BASE_URL (the strike-gateway).
// The /api prefix is included here so the gateway can route to services.
const P = '/api';

export const API_ENDPOINTS = {
  AUTH: {
    SEND_OTP: `${P}/auth/user/send-otp`,
    VERIFY_OTP: `${P}/auth/user/verify-otp`,
    REFRESH: `${P}/auth/refresh`,
    LOGOUT: `${P}/auth/logout`,
  },

  USER: {
    PROFILE: `${P}/user/profile`,
    PUSH_TOKEN: `${P}/user/push-token`,
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
    LIST: `${P}/user/saved-stores`,
    TOGGLE: (storeId: string) => `${P}/user/saved-stores/${storeId}`,
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
    CREATE: `${P}/redemptions`,
    DETAIL: (id: string) => `${P}/redemptions/${id}`,
  },

  LEDGER: {
    TRANSACTIONS: `${P}/ledger/transactions`,
    REDEMPTIONS: `${P}/ledger/redemptions`,
  },

  COUPONS: {
    VALIDATE: `${P}/coupons/validate`,
  },
} as const;

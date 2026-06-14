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
  },

  SAVED_STORES: {
    LIST: `${P}/user/saved-stores`,
    TOGGLE: (storeId: string) => `${P}/user/saved-stores/${storeId}`,
  },

  STORES: {
    NEARBY: `${P}/stores/nearby`,
    SEARCH: `${P}/stores/search`,
    DETAIL: (storeId: string) => `${P}/stores/${storeId}`,
    MENU: (storeId: string) => `${P}/stores/${storeId}/menu`,
    CARDS: (storeId: string) => `${P}/stores/${storeId}/cards`,
  },

  SUBSCRIPTIONS: {
    LIST: `${P}/subscriptions`,
    DETAIL: (id: string) => `${P}/subscriptions/${id}`,
    // Returns ONLY categories + items the purchased card covers (eligibility filter).
    // This is the redemption menu — NOT the full store menu.
    ELIGIBLE_MENU: (id: string) => `${P}/subscriptions/${id}/menu`,
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

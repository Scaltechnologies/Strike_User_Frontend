// Axios instance for all strike-gateway requests.
//
// Request interceptor  — attaches the Bearer access token.
// Response interceptor — on 401, attempts a single token refresh using a
//   dedicated refresh client (bypasses this interceptor to prevent loops).
//   While the refresh is in flight, all subsequent 401s are queued and
//   retried together once the new token arrives.
//   If refresh fails, auth state is cleared — AuthProvider reacts and
//   navigates the user back to login.

import axios, {
  type AxiosInstance,
  type AxiosError,
  type InternalAxiosRequestConfig,
} from 'axios';

import ENV from '@/config/env';
import { API_ENDPOINTS } from '@/constants/api';
import { useAuthStore } from '@/store/authStore';
import { useMaintenanceStore } from '@/store/maintenanceStore';
import type { RefreshTokenResponse } from '@/types/auth';

// Augment config so we can mark a request as already-retried.
interface RetryableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

interface QueueEntry {
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}

let isRefreshing = false;
let pendingQueue: QueueEntry[] = [];

function flushQueue(err: unknown, token: string | null): void {
  pendingQueue.forEach(({ resolve, reject }) =>
    token ? resolve(token) : reject(err),
  );
  pendingQueue = [];
}

// Separate client used ONLY for the refresh POST so it cannot re-enter
// the response interceptor below and cause an infinite 401 loop.
const refreshClient = axios.create({
  baseURL: ENV.API_BASE_URL,
  timeout: ENV.API_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

export const apiClient: AxiosInstance = axios.create({
  baseURL: ENV.API_BASE_URL,
  timeout: ENV.API_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

// ---------- Request interceptor ----------
// Reads the in-memory token from Zustand (no async needed — token is
// already hydrated by AuthProvider before any screen makes requests).
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const { token } = useAuthStore.getState();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (err) => Promise.reject(err),
);

// ---------- Response interceptor ----------
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    // Backend-wide maintenance mode — surface it regardless of which request
    // triggered it. See MaintenanceProvider for the cold-start equivalent.
    if (error.response?.status === 503) {
      const body = error.response.data as { message?: string } | undefined;
      useMaintenanceStore.getState().setMaintenance(true, body?.message);
      return Promise.reject(error);
    }

    const originalRequest = error.config as RetryableConfig | undefined;

    if (
      !originalRequest ||
      error.response?.status !== 401 ||
      originalRequest._retry
    ) {
      return Promise.reject(error);
    }

    // Queue request if a refresh is already underway.
    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        pendingQueue.push({ resolve, reject });
      }).then((newToken) => {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    const { refreshToken, setTokens, clearAuth } = useAuthStore.getState();

    if (!refreshToken) {
      isRefreshing = false;
      flushQueue(error, null);
      clearAuth();
      return Promise.reject(error);
    }

    try {
      // Unlike most endpoints, auth-service's /api/auth/refresh returns a flat
      // body ({ accessToken, refreshToken, ... }), not the app's usual
      // { success, data } envelope — matches how the login response is read
      // in otp.tsx. Reading this as ApiSuccessResponse<RefreshTokenResponse>
      // made `data.data` undefined, so destructuring it threw on every single
      // refresh attempt and force-logged-out the user on the first stray 401.
      const { data } = await refreshClient.post<RefreshTokenResponse>(
        API_ENDPOINTS.AUTH.REFRESH, { refreshToken });

      const { accessToken, refreshToken: newRefreshToken } = data;

      setTokens(accessToken, newRefreshToken);
      flushQueue(null, accessToken);

      originalRequest.headers.Authorization = `Bearer ${accessToken}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      flushQueue(refreshError, null);
      clearAuth(); // AuthProvider's useEffect reacts and navigates to login
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

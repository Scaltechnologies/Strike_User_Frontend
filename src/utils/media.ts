import { useMemo } from 'react';
import { useAuthStore } from '@/store/authStore';
import ENV from '@/config/env';

// Mirrors JwtAuthFilter.PUBLIC_PATHS in strike-gateway: uploaded store banners
// are served unauthenticated so they stay embeddable/cacheable like any other
// static asset. Must stay in sync with the gateway's allowlist.
const PUBLIC_MEDIA_PATH_PREFIXES = ['/api/vendor/uploads/'];

function isPublicMediaPath(uri: string): boolean {
  const path = uri.replace(/^https?:\/\/[^/]+/i, '');
  return PUBLIC_MEDIA_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

// Hosts the backend commonly bakes into stored URLs during local development
// (emulator loopback aliases, bare localhost) that are NOT reachable from a
// physical device even when the JSON API itself is reachable via the LAN IP
// configured in EXPO_PUBLIC_API_BASE_URL. Swap them for the host the app is
// actually configured to talk to — it's the same backend.
const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1', '10.0.2.2', '0.0.0.0']);

function splitOrigin(url: string): { origin: string; rest: string } | null {
  const match = url.match(/^(https?:\/\/[^/]+)(\/.*)?$/i);
  if (!match) return null;
  return { origin: match[1], rest: match[2] ?? '' };
}

// Normalises an image/file URL returned by the backend so it can actually be
// fetched from the device: resolves relative paths against the gateway, and
// rewrites dev-only loopback hosts to the configured API host.
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (!/^https?:\/\//i.test(trimmed)) {
    return `${ENV.API_BASE_URL}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
  }

  const parsed = splitOrigin(trimmed);
  if (!parsed) return trimmed;

  const host = parsed.origin.match(/^https?:\/\/([^:/]+)/i)?.[1];
  if (host && LOCAL_DEV_HOSTS.has(host)) {
    return `${ENV.API_BASE_URL}${parsed.rest}`;
  }

  return trimmed;
}

// expo-image `source` shape — a plain string works too, but object form lets
// us attach an Authorization header for endpoints served behind the same
// gateway that require it (e.g. uploads routed under an auth-guarded prefix
// such as /api/vendor/**). Never attach the token to a third-party host
// (S3/CDN) — that would leak the user's bearer token off-origin.
export function useMediaSource(
  url: string | null | undefined,
): { uri: string; headers?: Record<string, string> } | null {
  const token = useAuthStore((s) => s.token);
  const uri = resolveMediaUrl(url);

  // Stable object identity across re-renders — a fresh `{ uri, headers }` literal
  // every render defeats the native image loader's cache key and (worse) triggers
  // redundant concurrent re-fetches of the same URL on every re-render, which is
  // what surfaces as intermittent decode failures for list items that re-render often.
  return useMemo(() => {
    if (!uri) return null;
    if (token && uri.startsWith(ENV.API_BASE_URL) && !isPublicMediaPath(uri)) {
      return { uri, headers: { Authorization: `Bearer ${token}` } };
    }
    return { uri };
  }, [uri, token]);
}

// Logs the real failure reason (401/403 vs 404 vs network) to Metro so a
// silently-blank image can actually be diagnosed instead of just hidden
// behind a fallback.
export function logMediaError(label: string, uri: string, error: unknown): void {
  console.warn(`[media] ${label} failed to load: ${uri}`, error);
}

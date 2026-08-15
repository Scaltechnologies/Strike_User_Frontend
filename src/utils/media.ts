import { useMemo } from 'react';
import { useAuthStore } from '@/store/authStore';
import ENV from '@/config/env';

// Mirrors JwtAuthFilter.PUBLIC_PATHS in strike-gateway: uploaded store banners
// and profile avatars are served unauthenticated so they stay embeddable/cacheable
// like any other static asset. Must stay in sync with the gateway's allowlist.
const PUBLIC_MEDIA_PATH_PREFIXES = ['/api/vendor/uploads/', '/api/user/uploads/'];

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

// RFC1918 private-network ranges. The backend also bakes the *current* LAN IP
// of whichever machine it was running on into stored upload URLs at save
// time — e.g. http://192.168.88.12:8080/... When the dev machine later
// reconnects to Wi-Fi and gets a new DHCP lease (192.168.88.33), every banner
// uploaded under the old IP now points at an address nobody can reach, even
// though it's the exact same backend that EXPO_PUBLIC_API_BASE_URL already
// points to correctly. A real production host is a public domain, never a
// bare private IP, so this rewrite is inherently scoped to dev.
const PRIVATE_IPV4_HOST = /^(?:10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2})$/;

function isStaleDevHost(host: string): boolean {
  return LOCAL_DEV_HOSTS.has(host) || PRIVATE_IPV4_HOST.test(host);
}

function splitOrigin(url: string): { origin: string; rest: string } | null {
  const match = url.match(/^(https?:\/\/[^/]+)(\/.*)?$/i);
  if (!match) return null;
  return { origin: match[1], rest: match[2] ?? '' };
}

// On-device URIs (a freshly picked photo, before it's been uploaded) are
// already fully resolved and never need — or survive — being rewritten
// against the API host below.
const LOCAL_URI_SCHEMES = /^(file|content|ph|assets-library|data|blob):/i;

// Normalises an image/file URL returned by the backend so it can actually be
// fetched from the device: resolves relative paths against the gateway, and
// rewrites dev-only loopback hosts to the configured API host.
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (LOCAL_URI_SCHEMES.test(trimmed)) return trimmed;

  if (!/^https?:\/\//i.test(trimmed)) {
    return `${ENV.API_BASE_URL}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
  }

  const parsed = splitOrigin(trimmed);
  if (!parsed) return trimmed;

  const host = parsed.origin.match(/^https?:\/\/([^:/]+)/i)?.[1];
  if (host && isStaleDevHost(host)) {
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

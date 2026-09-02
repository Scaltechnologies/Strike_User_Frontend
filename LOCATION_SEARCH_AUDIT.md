# Nearby Location Detection / Search — Full-Stack Audit

**Scope:** Strike User App (frontend, `d:\Front_End\Strike_User_App`) + Strike backend (`D:\Back_End\Strike\strike`, `user-service` + `vendor-service`).
**Method:** Traced every hop from GPS acquisition to rendered UI, cross-checked against the actual backend controllers/services (not assumed).
**Status:** Audit only — no code was modified.

---

## 1. Current Architecture (as it actually exists)

There are **two independent flows** that both get called "search," and only one of them is location-aware:

### Flow A — Home screen text search (what users type in the main search bar)
```
index.tsx (search bar, handleQueryChange, 400ms debounce)
   ↓
useSearchStores(debouncedQuery)                         [src/hooks/useStores.ts:83]
   ↓
storeApi.searchStores(query)                             [src/api/store.api.ts:14]
   ↓
GET /api/user/stores/search?q=<query>                    [src/constants/api.ts:49]
   ↓
UserStoreController.searchStores(q, category)             [backend, no lat/lng params exist]
   ↓
StoreServiceImpl.searchStores() — substring match on name/description/category ONLY
   ↓
StoreResponse[] with distanceKm = null (never computed, never set)
   ↓
filteredSearchResults (index.tsx:1549) — rendered as-is, NOT merged with distance
   ↓
renderSearchResults() — UI
```
**This flow has zero location awareness, front to back.** GPS coordinates are never sent, and the backend endpoint has no parameter to accept them even if the frontend tried.

### Flow B — Location-aware "nearby" list (feeds the unified home feed, not the search bar)
```
useLocation().detectAndSave()                             [src/hooks/useLocation.ts:33]
   ↓
ExpoLocation.getCurrentPositionAsync({ accuracy: Balanced })   — ONE-SHOT, not watchPosition
   ↓
setCoords() + storageService.setLocation()  (SecureStore, no TTL)
   ↓
userApi.updateLocation(lat, lng)  → PATCH /api/user/me/location   (best-effort, fire-and-forget)
   ↓
useNearbyStores({ enabled: locationReady && locationSynced })    [src/hooks/useStores.ts:57]
   ↓
storeApi.getNearbyStores() → GET /api/user/stores/nearby/me      (NO params sent at all)
   ↓
UserStoreController.getNearbyStoresForMe(userId, radiusKm=5.0 default)
   ↓
StoreServiceImpl.getNearbyStores(lat, lng, radiusKm) — haversine, filter <= radiusKm, sort ascending
   ↓
storesWithDistance (index.tsx:1469) — merges distanceKm onto the full store list
   ↓
Rendered in the "Recommended for you / Stores near you" section — NEVER in search results
```

### Flow C — "Search an area" (location picker, Nominatim) — this is geocoding, not store search
```
ActiveLocationSheet → handleSearchChange (400ms debounce)
   ↓
searchArea(text)  [index.tsx:301] → fetch nominatim.openstreetmap.org/search (countrycodes=in)
   ↓
User taps a result → applyLocation(lat, lng, name)
   ↓
PATCH /api/user/me/location + invalidate storeKeys.nearby()
```
This is a manual "set my browsing area" tool, unrelated to the store search bar. It correctly implements request-generation cancellation (`searchGenRef`) so stale responses can't overwrite fresh ones.

---

## 2. Root Causes

### 🔴 Critical — Store search has no location awareness anywhere in the stack
**File:** `src/hooks/useStores.ts:83-90` (`useSearchStores`), `src/api/store.api.ts:14-19` (`searchStores`)
**Backend:** `UserStoreController.java:68-73`, `StoreServiceImpl.java:140-155`

**Current behavior:** The search bar calls `GET /api/user/stores/search?q=...`. This endpoint takes only `q` and `category`. The backend service filters purely by substring match on `name`/`description`/`category` — no coordinates are read, no distance is computed, `distanceKm` stays `null` on every result, and there is no radius filtering or proximity sort.

**Why it's wrong:** The user's mental model (and the app's own UI/UX — a header showing "Current Location," a "Near Me" sort chip elsewhere on the same screen) implies search results respect location. They don't. A user in Bangalore searching "pizza" gets every pizza-named store platform-wide, unsorted by distance, with no distance badge — including stores hundreds of km away, mixed in arbitrarily.

**Impact:** This is very likely the primary source of "nearby/relevant locations are not appearing correctly" — because for the search bar specifically, "nearby" was never part of the query in the first place.

**Note:** The backend does expose a genuinely nearby-aware endpoint (`GET /api/user/stores/nearby?lat=&lng=&radiusKm=`) that the frontend never calls. A location-biased search would require either (a) the backend adding lat/lng/radius params to `/search`, or (b) the frontend intersecting/re-sorting search results against `storesWithDistance` client-side.

---

### 🔴 Critical — GPS is captured once per app session; no realtime re-detection, no TTL on cached coordinates
**File:** `src/hooks/useLocation.ts:33-45` (`detectAndSave`), `:123-138` (`initLocation`)

**Current behavior:**
- `detectAndSave` calls `ExpoLocation.getCurrentPositionAsync(...)` — a single snapshot, not `watchPositionAsync`. No `maximumAge`/`timeout` options are set.
- `initLocation` (called once on home-screen mount, gated by `locationStatus === 'idle'`) restores cached coordinates from `SecureStore` with **no staleness check whatsoever** — `stored.updatedAt` is persisted but never compared against the current time. If a cached location exists, GPS is **never** re-queried automatically, no matter how old it is.
- Because `locationStatus` lives in a global Zustand store, once it flips to `'ready'` in a session it stays there — the `useEffect` that triggers `initLocation()` never fires again for the rest of the app's lifetime (until app restart).

**Why it's wrong:** The app is not "realtime" by any definition — it's "once per cold start, or forever-cached across restarts." Scenario E in the brief (user moves to a new location, searches again, expects updated results) fails silently: results keep reflecting wherever the user was when the app was first opened (or last force-quit and reopened without a cache), until they manually tap "Use my location" or pick from the location sheet.

**Impact:** Directly explains "nearby locations not appearing correctly" for any user who travels between app opens/sessions — extremely common (e.g., commuting, opening the app at home vs. at the store).

---

### 🟠 High — Nearby radius is a backend-hardcoded 5 km default, invisible and non-configurable from the frontend
**File:** `src/api/store.api.ts:22-25` (`getNearbyStores` — sends no params)
**Backend:** `UserStoreController.java:51-55` — `@RequestParam(defaultValue = "5.0") double radiusKm`

**Current behavior:** The frontend never sends a `radiusKm` query param to `/nearby/me`, so the backend silently applies its default of 5.0 km on every request. There is no UI anywhere that shows this radius, lets the user change it, or expands it automatically when zero/few results come back.

**Why it's wrong:** In lower-density areas (fewer stores per km²), a fixed 5 km cutoff can easily exclude every legitimately "nearby" store, producing an empty or sparse nearby list that looks like a bug ("expected nearby results missing") when it's actually a silently-applied radius limit.

**Impact:** Directly matches the user-reported symptom "expected nearby results are missing." Also affects the unified home feed's `distanceKm` merge (`storesWithDistance`, `index.tsx:1469`), since it only has backend distances for stores inside that 5 km window — everything else falls back to client-side haversine (correct) but never appears in the backend-driven "near you" ordering the same way.

---

### 🟡 Medium — Location-search (Nominatim) network/parse failures are indistinguishable from "no results found"
**File:** `src/app/(tabs)/index.tsx:301-361` (`searchArea`)

**Current behavior:**
```ts
} catch {
  return [];
}
```
Any failure — network error, Nominatim rate-limiting (the app makes unauthenticated calls to the public `nominatim.openstreetmap.org` endpoint with no API key, which enforces a strict 1 req/sec usage policy and can throttle/block on abuse), non-2xx response, malformed JSON — all collapse into an empty array. The UI (`searchPhase === 'done'` with `geoResults.length === 0`) then renders **"No results found — Try a different name or spelling."**

**Why it's wrong:** This is exactly the anti-pattern called out in the brief — a real infrastructure failure (Scenario I: "Location API/provider fails") is presented to the user as if their search term was simply wrong, with no way to distinguish the two and no error logged for debugging.

**Impact:** Confusing UX during provider outages/rate-limiting; also makes this exact bug class hard to diagnose from user reports ("search doesn't find my area" could mean either "Nominatim has no data for that string" or "Nominatim rejected the request").

---

### 🟢 Low — Leftover debug logging in the nearby-stores query
**File:** `src/hooks/useStores.ts:57-80`

```ts
queryFn: async () => {
  console.log("🚀 Nearby query started");
  try {
    const result = await storeApi.getNearbyStores();
    console.log("✅ Nearby success:", result);
    return result;
  } catch (error) {
    console.log("❌ Nearby failed:", error);
    throw error;
  }
},
```
Not a functional bug (errors are re-thrown, not swallowed — this is actually one of the few honest error paths in the file), but it's leftover ad-hoc debugging instrumentation that will spam the console in production builds and suggests this exact endpoint was already under active investigation before this audit.

---

### 🟢 Low — `app.json` declares an "Always" location permission string that the code never requests
**File:** `app.json:51-57`

```json
["expo-location", {
  "locationAlwaysAndWhenInUsePermission": "Strike needs your location...",
  "locationWhenInUsePermission": "Strike needs your location..."
}]
```
`useLocation.ts` only ever calls `getForegroundPermissionsAsync` / `requestForegroundPermissionsAsync` — background/"Always" permission is never requested. The `locationAlwaysAndWhenInUsePermission` string is dead config (harmless, since iOS never shows it without a background permission request, but it's misleading and should be removed for clarity).

---

## 3. Evidence Summary Table

| # | Issue | File(s) | Severity |
|---|---|---|---|
| 1 | Search endpoint (frontend + backend) has no location/radius awareness at all | `useStores.ts`, `store.api.ts`, `UserStoreController.java`, `StoreServiceImpl.java` | 🔴 Critical |
| 2 | GPS is one-shot per session; cached coords have no TTL/staleness check | `useLocation.ts` (`detectAndSave`, `initLocation`) | 🔴 Critical |
| 3 | Nearby radius hardcoded to 5km backend-side, invisible/non-adjustable from app | `store.api.ts`, `UserStoreController.java` | 🟠 High |
| 4 | Nominatim area-search errors silently become "no results found" | `index.tsx` (`searchArea`) | 🟡 Medium |
| 5 | Debug `console.log`s left in nearby-stores query | `useStores.ts` | 🟢 Low |
| 6 | Dead "Always" location permission string in app.json | `app.json` | 🟢 Low |

### What is *not* broken (verified, ruling out common suspects)
- **No lat/lng coordinate-order bug** — backend consistently uses `(lat, lng)` order end-to-end (`UserStoreController` → `StoreServiceClient` → `StoreServiceImpl.haversineKm`).
- **No serialization field-name mismatch** — `distanceKm`/`latitude`/`longitude` match exactly between both backend DTOs and the frontend `Store` type.
- **No race condition between GPS-ready and backend PATCH** — `locationSynced` flag (documented in `appStore.ts`) correctly gates `useNearbyStores` until the PATCH settles, preventing the classic "search fires before location is saved" race for a new account (this was clearly already fixed deliberately, per the inline comments).
- **No stale-response overwrite bug** — React Query's per-query-key caching for `useSearchStores`/`useNearbyStores`, plus the explicit `searchGenRef` generation-counter in `searchArea`, both correctly prevent an old slow response from clobbering a newer one.
- **Debounce timing (400ms, min 2 chars) is reasonable**, not the bottleneck.
- **Permission handling is solid** — correctly distinguishes `denied` (can ask again) vs `blocked` (must open Settings) on both platforms, has a "Skip"/continue-without-location path, and a dedicated error/retry state for GPS failures.

---

## 4. Recommended Fixes (not yet implemented)

1. **Make search location-aware.** Two options, not mutually exclusive:
   - Backend: add optional `lat`/`lng`/`radiusKm` params to `/api/user/stores/search`, apply the same haversine filter/sort used by `/nearby`, when present.
   - Frontend (no backend change, works today): intersect `searchResults` with `storesWithDistance` by id in `filteredSearchResults` (`index.tsx:1549`) so search results inherit `distanceKm` and can be sorted "nearest first" using data already being fetched for the home feed.

2. **Add staleness handling to cached location.** In `initLocation` (`useLocation.ts:125`), compare `stored.updatedAt` against now; if older than a defined threshold (e.g. 15–30 min), kick off a background `detectAndSave()` refresh instead of trusting the cache indefinitely. Optionally re-check `locationStatus` on app foreground (AppState listener) rather than only on first mount.

3. **Surface/raise the nearby radius.** Either send an explicit, larger `radiusKm` from the frontend (with a sensible UI control, e.g. "Expand search area" shown when nearby returns 0 results), or ask the backend to widen its default and/or auto-expand when the initial radius yields nothing.

4. **Distinguish real failures from empty results in `searchArea`.** Track an explicit `'error'` phase separate from `'done'` with zero results, and log the failure (status code / network error) instead of swallowing it in the `catch`.

5. Remove the stray `console.log`s in `useNearbyStores`, and drop the unused `locationAlwaysAndWhenInUsePermission` string from `app.json`.

---

## 5. Potential Side Effects of Fixing

- **Fix 1 (location-aware search):** If done via backend radius filtering, could reduce result *count* for broad queries (a deliberate, wanted change) — but the frontend fallback (client-side intersection) has zero backend/API risk and is purely additive to what's already fetched.
- **Fix 2 (staleness refresh):** Adds a background GPS call on cache-expiry — minor battery/latency cost, and needs a "don't spam GPS on every mount" guard. Should NOT re-prompt permission dialogs since permission is separately state-tracked.
- **Fix 3 (radius):** Widening the default radius affects every consumer of `/nearby/me` and `/nearby`, including the home feed's "Stores near you" section and its distance sort — needs coordination with backend since the default lives server-side and is presumably shared across other clients (vendor-facing tools, etc., if any exist).
- **Maps / checkout / directions (`openDirections` in `utils/maps.ts`):** unaffected — those consume `store.latitude`/`store.longitude` directly, not the search or nearby flow.
- **Battery usage:** switching from one-shot `getCurrentPositionAsync` to any periodic/`watchPositionAsync` approach would need to stay lightweight (e.g. foreground-only, coarse accuracy, or a TTL-based single re-check rather than continuous tracking) to avoid meaningfully increasing battery drain.

---

## 6. Final Diagnosis

**Why are realtime nearby locations not appearing correctly in the Strike User App?**

1. **The search bar itself is not location-aware, at any layer of the stack.** `GET /api/user/stores/search` is a pure keyword filter with no lat/lng/radius parameters on either the frontend request or the backend implementation — it was never wired to consider the user's location at all. This is almost certainly the main cause of "nearby locations not appearing correctly" when the user types a search.

2. **Location is not actually realtime — it's captured once per app session (or reused indefinitely from cache with zero staleness check).** There is no automatic re-detection when the app is reopened after the user has moved, and no periodic refresh while the app is open.

3. **The one endpoint that IS location-aware (`/nearby/me`) is silently capped at a hardcoded, invisible 5 km radius** that the frontend never overrides or surfaces — plausibly excluding real nearby stores in lower-density areas, which reads to the user as "expected results missing."

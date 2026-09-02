import { useCallback, useEffect } from 'react';
import * as ExpoLocation from 'expo-location';
import { AppState, Linking } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { useAppStore } from '@/store/appStore';
import { userApi } from '@/api/user.api';
import { storageService } from '@/services/storageService';
import { haversineDistanceKm } from '@/utils/maps';
import { storeKeys } from './useStores';

// Below this, a GPS update is noise (device jitter, indoor drift) — not a real
// move worth re-syncing the backend and refetching nearby stores for.
const MOVEMENT_THRESHOLD_KM = 0.5;
// How long a cached/last-known GPS location is trusted before a foreground
// resume triggers a fresh GPS read instead of reusing it as-is. Only applies
// to locationSource 'gps' — a manually-chosen location never goes stale this
// way (see applyLocation).
const STALE_THRESHOLD_MS = 20 * 60 * 1000;
// OS-level throttle passed to watchPositionAsync — coarser than our own
// MOVEMENT_THRESHOLD_KM check, just to cut down how often the callback fires
// at all before we do the real (haversine) evaluation.
const WATCH_DISTANCE_INTERVAL_M = 100;
const WATCH_TIME_INTERVAL_MS = 30_000;

// Module-level (not component-level) singleton state: useLocation() is a hook,
// but the GPS watcher it manages must never have more than one live instance
// no matter how many times the hook is called/re-rendered/re-mounted.
let watchSubscription: ExpoLocation.LocationSubscription | null = null;
let watchStarting = false;
let lastKnownCoords: { latitude: number; longitude: number } | null = null;
let syncGeneration = 0;

export function useLocation() {
  const {
    locationPermission,
    locationStatus,
    coords,
    locationUpdatedAt,
    locationSource,
    setLocationPermission,
    setLocationStatus,
    setCoords,
    setLocationName,
    setLocationSynced,
    setLocationSource,
  } = useAppStore();

  const queryClient = useQueryClient();

  // Shared tail end of "we have new coordinates worth acting on" — persists,
  // updates state, PATCHes the backend, and refreshes nearby stores. Used both
  // by the one-shot detect flow and by the watcher once it sees a >=500m move.
  // Always marks locationSource 'gps' — this is the GPS pipeline; the manual
  // (Set Location) pipeline is applyLocation below.
  //
  // A monotonically increasing generation guards the PATCH: if a newer call
  // starts (a manual refresh, a fresh watcher move) before an older one's
  // network round-trip finishes, the older one's response is discarded so it
  // can never overwrite the backend/UI with an outdated location.
  const applyCoords = useCallback(async (latitude: number, longitude: number) => {
    const gen = ++syncGeneration;
    const updatedAt = new Date().toISOString();
    lastKnownCoords = { latitude, longitude };

    void storageService.setLocation(latitude, longitude, updatedAt, 'gps');
    setCoords({ latitude, longitude }, updatedAt);
    setLocationStatus('ready');
    setLocationSource('gps');

    // PATCH backend — the failure path must not roll back the GPS-ready state
    // already shown to the user (GPS worked; the backend is just unreachable).
    try {
      await userApi.updateLocation(latitude, longitude);
      if (gen !== syncGeneration) return; // superseded by a newer sync — don't refresh on stale data
      console.log('[Location] Backend synchronized');
      void queryClient.invalidateQueries({ queryKey: storeKeys.nearby() });
      console.log('[Nearby] Refresh triggered');
    } catch {
      // Silent — backend will receive the location on next successful request.
    } finally {
      if (gen === syncGeneration) setLocationSynced(true);
    }

    // Reverse-geocode to populate the locality name shown in the header.
    try {
      const [place] = await ExpoLocation.reverseGeocodeAsync({ latitude, longitude });
      if (gen !== syncGeneration) return;
      const name =
        place?.district ??
        place?.subregion ??
        place?.city ??
        place?.region ??
        null;
      setLocationName(name);
      if (name) {
        void storageService.setLocationName(name);
        void storageService.addToLocationHistory({
          latitude,
          longitude,
          name,
          usedAt: updatedAt,
        });
      }
    } catch {
      // Non-fatal — locality name is cosmetic only
    }
  }, [queryClient, setCoords, setLocationName, setLocationStatus, setLocationSynced, setLocationSource]);

  // Step 2 of the flow: GPS is already permitted — get a fresh one-shot fix,
  // persist, mark ready, then sync the backend + reverse-geocode via applyCoords.
  const detectAndSave = useCallback(async () => {
    setLocationStatus('detecting');
    try {
      const loc = await ExpoLocation.getCurrentPositionAsync({
        accuracy: ExpoLocation.Accuracy.Balanced,
      });
      const { latitude, longitude } = loc.coords;
      console.log('[Location] Current coordinates', latitude, longitude);
      await applyCoords(latitude, longitude);
    } catch {
      setLocationStatus('error');
    }
  }, [applyCoords, setLocationStatus]);

  // Step 1: Check current OS permission state, request if needed, then detect.
  const requestPermissionAndLocate = useCallback(async () => {
    setLocationStatus('checking');

    const { status, canAskAgain } = await ExpoLocation.getForegroundPermissionsAsync();

    if (status === ExpoLocation.PermissionStatus.GRANTED) {
      setLocationPermission('granted');
      await detectAndSave();
      return;
    }

    // canAskAgain === false means the user permanently denied (iOS) or
    // dismissed the dialog enough times (Android) — must open Settings.
    if (!canAskAgain) {
      setLocationPermission('blocked');
      setLocationStatus('blocked');
      return;
    }

    setLocationStatus('requesting');
    const result = await ExpoLocation.requestForegroundPermissionsAsync();

    if (result.status === ExpoLocation.PermissionStatus.GRANTED) {
      setLocationPermission('granted');
      await detectAndSave();
    } else if (!result.canAskAgain) {
      setLocationPermission('blocked');
      setLocationStatus('blocked');
    } else {
      setLocationPermission('denied');
      setLocationStatus('denied');
    }
  }, [detectAndSave, setLocationPermission, setLocationStatus]);

  // Watcher callback: only acts once movement crosses MOVEMENT_THRESHOLD_KM
  // from the last coordinates we actually synced, so ordinary GPS jitter
  // never triggers a backend PATCH or a nearby refetch. Also guards against
  // the narrow race where a manual selection lands in the same tick a
  // watcher callback was already in flight — the effect below normally stops
  // the watcher the instant locationSource flips to 'manual', this is belt
  // and suspenders against that race, not the primary guard.
  const handleWatchUpdate = useCallback((point: { latitude: number; longitude: number }) => {
    if (useAppStore.getState().locationSource !== 'gps') return;
    if (!lastKnownCoords) {
      lastKnownCoords = point;
      return;
    }
    const distanceKm = haversineDistanceKm(
      lastKnownCoords.latitude, lastKnownCoords.longitude,
      point.latitude, point.longitude,
    );
    if (distanceKm < MOVEMENT_THRESHOLD_KM) return;

    console.log('[Location] Significant movement detected', `${distanceKm.toFixed(2)}km`);
    void applyCoords(point.latitude, point.longitude);
  }, [applyCoords]);

  // Starts the single shared foreground GPS watcher, if one isn't already
  // running or starting. No-ops without a granted permission. Balanced
  // accuracy + a distance/time throttle — this is not a high-frequency,
  // high-accuracy tracker, just enough to notice the user changed areas.
  const startWatching = useCallback(async () => {
    if (watchSubscription || watchStarting) return;
    watchStarting = true;
    try {
      const { status } = await ExpoLocation.getForegroundPermissionsAsync();
      if (status !== ExpoLocation.PermissionStatus.GRANTED) return;
      if (watchSubscription) return;

      const current = useAppStore.getState().coords;
      if (current) lastKnownCoords = current;

      watchSubscription = await ExpoLocation.watchPositionAsync(
        {
          accuracy: ExpoLocation.Accuracy.Balanced,
          timeInterval: WATCH_TIME_INTERVAL_MS,
          distanceInterval: WATCH_DISTANCE_INTERVAL_M,
        },
        (loc) => handleWatchUpdate(loc.coords),
      );
    } finally {
      watchStarting = false;
    }
  }, [handleWatchUpdate]);

  // Stops and clears the watcher — foreground-only tracking: called whenever
  // the app leaves the foreground, whenever the user picks a manual location,
  // and whenever this effect's deps make it no longer appropriate to be
  // watching (permission lost, GPS not ready, etc).
  const stopWatching = useCallback(() => {
    if (watchSubscription) {
      watchSubscription.remove();
      watchSubscription = null;
    }
  }, []);

  // Called once on home screen mount. Restores stored coords and locality name
  // so the header and nearby section load immediately without triggering GPS.
  // If that cache is a GPS fix older than STALE_THRESHOLD_MS, a fresh GPS read
  // is kicked off in the background — but never for a manually-chosen
  // location, which persists as-is until the user explicitly changes it.
  const initLocation = useCallback(async () => {
    const stored = await storageService.getLocation();
    if (stored) {
      lastKnownCoords = { latitude: stored.latitude, longitude: stored.longitude };
      setCoords({ latitude: stored.latitude, longitude: stored.longitude }, stored.updatedAt);
      setLocationStatus('ready');
      setLocationSource(stored.source);
      // A cached location implies a prior session already PATCHed it to the
      // backend — safe to let nearby-stores fetch immediately.
      setLocationSynced(true);
      const name = await storageService.getLocationName();
      setLocationName(name);

      if (stored.source !== 'gps') return;

      // A cached GPS location implies permission was granted in a prior
      // session — confirm that's still true (read-only check, never a
      // re-prompt) so the realtime watcher below is correctly gated.
      const { status } = await ExpoLocation.getForegroundPermissionsAsync();
      if (status === ExpoLocation.PermissionStatus.GRANTED) {
        setLocationPermission('granted');
        const isStale = Date.now() - new Date(stored.updatedAt).getTime() > STALE_THRESHOLD_MS;
        if (isStale) void detectAndSave();
      }
      return;
    }
    await requestPermissionAndLocate();
  }, [detectAndSave, requestPermissionAndLocate, setCoords, setLocationName, setLocationPermission, setLocationSource, setLocationStatus, setLocationSynced]);

  // Optimistically apply a location the user explicitly chose (Set Location
  // search/history) — updates UI instantly, then PATCHes the backend and
  // invalidates nearby cache. This is a deliberate "browse this area" choice,
  // distinct from GPS: it marks locationSource 'manual' and stops the
  // realtime watcher so a later GPS reading can't silently overwrite it —
  // device GPS resumes only when the user explicitly asks for it again via
  // refresh()/detectAndSave ("Use my current location").
  const applyLocation = useCallback(
    async (latitude: number, longitude: number, name: string) => {
      const gen = ++syncGeneration;
      const updatedAt = new Date().toISOString();
      lastKnownCoords = { latitude, longitude };
      stopWatching();
      setCoords({ latitude, longitude }, updatedAt);
      setLocationStatus('ready');
      setLocationSource('manual');
      setLocationName(name);
      void storageService.setLocation(latitude, longitude, updatedAt, 'manual');
      void storageService.setLocationName(name);
      try {
        await userApi.updateLocation(latitude, longitude);
        if (gen !== syncGeneration) return;
        void queryClient.invalidateQueries({ queryKey: storeKeys.nearby() });
      } catch {
        // Silent fail — the UI already reflects the new location name
      } finally {
        if (gen === syncGeneration) setLocationSynced(true);
      }
    },
    [queryClient, setCoords, setLocationName, setLocationSource, setLocationStatus, setLocationSynced, stopWatching],
  );

  // Manual refresh: re-detect GPS and re-PATCH backend. This is the "Use my
  // current location" action — it always wins back control from a manual
  // Set Location choice (applyCoords marks locationSource 'gps').
  const refresh = useCallback(async () => {
    if (locationPermission === 'blocked') {
      return; // Cannot detect without Settings intervention.
    }
    await detectAndSave();
  }, [detectAndSave, locationPermission]);

  const openSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  // On foreground resume: if a GPS-sourced location is stale, get a fresh fix
  // (which also re-syncs the backend and refreshes nearby stores); otherwise
  // just make sure the watcher is (still) running. A manually-chosen location
  // is left completely alone — no staleness check, no watcher.
  const handleForeground = useCallback(async () => {
    const state = useAppStore.getState();
    if (state.locationPermission !== 'granted' || state.locationStatus !== 'ready') return;
    if (state.locationSource !== 'gps') return;

    const updatedAt = state.locationUpdatedAt;
    const isStale = !updatedAt || Date.now() - new Date(updatedAt).getTime() > STALE_THRESHOLD_MS;
    if (isStale) {
      await detectAndSave();
    } else {
      void startWatching();
    }
  }, [detectAndSave, startWatching]);

  // Foreground-only tracking, tied to app lifecycle: stop the watcher the
  // moment the app leaves the foreground, and either resume it or do a
  // staleness-driven refresh when it comes back (both no-ops while a manual
  // location is active — see handleForeground).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void handleForeground();
      } else {
        stopWatching();
      }
    });
    return () => sub.remove();
  }, [handleForeground, stopWatching]);

  // Start/stop the watcher as location readiness itself changes (e.g. right
  // after the initial permission grant + first GPS fix, if location later
  // errors/gets denied, or when the source switches between 'gps' and
  // 'manual'). Runs only while the app is in the foreground, GPS is the
  // active source, and this hook's consumer is mounted — cleanup here, plus
  // the module-level guards above, keep this to exactly one live watcher.
  useEffect(() => {
    if (locationPermission === 'granted' && locationStatus === 'ready' && locationSource === 'gps') {
      void startWatching();
    }
    return () => stopWatching();
  }, [locationPermission, locationStatus, locationSource, startWatching, stopWatching]);

  return {
    status: locationStatus,
    coords,
    updatedAt: locationUpdatedAt,
    source: locationSource,
    initLocation,
    requestPermissionAndLocate,
    detectAndSave,
    applyLocation,
    refresh,
    openSettings,
  };
}

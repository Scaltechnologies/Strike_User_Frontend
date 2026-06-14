import { useCallback } from 'react';
import * as ExpoLocation from 'expo-location';
import { Linking } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { useAppStore } from '@/store/appStore';
import { userApi } from '@/api/user.api';
import { storageService } from '@/services/storageService';
import { storeKeys } from './useStores';

export function useLocation() {
  const {
    locationPermission,
    locationStatus,
    coords,
    locationUpdatedAt,
    setLocationPermission,
    setLocationStatus,
    setCoords,
    setLocationName,
  } = useAppStore();

  const queryClient = useQueryClient();

  // Step 2 of the flow: GPS is already permitted — get coordinates,
  // persist locally, mark ready, then PATCH the backend and reverse-geocode.
  //
  // IMPORTANT: setCoords + setLocationStatus('ready') happen immediately after
  // GPS succeeds, BEFORE the backend PATCH. A network error on the PATCH must
  // never surface as "Location unavailable" — GPS worked, the backend is just
  // temporarily unreachable.
  const detectAndSave = useCallback(async () => {
    setLocationStatus('detecting');
    try {
      const loc = await ExpoLocation.getCurrentPositionAsync({
        accuracy: ExpoLocation.Accuracy.Balanced,
      });
      const { latitude, longitude } = loc.coords;

      // GPS succeeded — persist and unblock the UI immediately.
      const updatedAt = new Date().toISOString();
      void storageService.setLocation(latitude, longitude, updatedAt);
      setCoords({ latitude, longitude }, updatedAt);
      setLocationStatus('ready');

      // PATCH backend — best-effort. Nearby stores rely on this, but a failure
      // here must not roll back the GPS-ready state already shown to the user.
      try {
        await userApi.updateLocation(latitude, longitude);
        void queryClient.invalidateQueries({ queryKey: storeKeys.nearby() });
      } catch {
        // Silent — backend will receive the location on next successful request.
      }

      // Reverse-geocode to populate the locality name shown in the header.
      try {
        const [place] = await ExpoLocation.reverseGeocodeAsync({ latitude, longitude });
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
    } catch {
      setLocationStatus('error');
    }
  }, [queryClient, setCoords, setLocationName, setLocationStatus]);

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

  // Called once on home screen mount. Restores stored coords and locality name
  // so the header and nearby section load immediately without triggering GPS.
  const initLocation = useCallback(async () => {
    const stored = await storageService.getLocation();
    if (stored) {
      setCoords({ latitude: stored.latitude, longitude: stored.longitude }, stored.updatedAt);
      setLocationStatus('ready');
      const name = await storageService.getLocationName();
      setLocationName(name);
      return;
    }
    await requestPermissionAndLocate();
  }, [requestPermissionAndLocate, setCoords, setLocationName, setLocationStatus]);

  // Optimistically apply a location from history — updates UI instantly, then
  // PATCHes the backend and invalidates nearby cache in the background.
  const applyLocation = useCallback(
    async (latitude: number, longitude: number, name: string) => {
      const updatedAt = new Date().toISOString();
      setCoords({ latitude, longitude }, updatedAt);
      setLocationName(name);
      void storageService.setLocation(latitude, longitude, updatedAt);
      void storageService.setLocationName(name);
      try {
        await userApi.updateLocation(latitude, longitude);
        void queryClient.invalidateQueries({ queryKey: storeKeys.nearby() });
      } catch {
        // Silent fail — the UI already reflects the new location name
      }
    },
    [queryClient, setCoords, setLocationName],
  );

  // Manual refresh: re-detect GPS and re-PATCH backend.
  const refresh = useCallback(async () => {
    if (locationPermission === 'blocked') {
      return; // Cannot detect without Settings intervention.
    }
    await detectAndSave();
  }, [detectAndSave, locationPermission]);

  const openSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  return {
    status: locationStatus,
    coords,
    updatedAt: locationUpdatedAt,
    initLocation,
    requestPermissionAndLocate,
    detectAndSave,
    applyLocation,
    refresh,
    openSettings,
  };
}

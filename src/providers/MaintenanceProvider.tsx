// Checks maintenance status on launch and whenever the app returns to the
// foreground, independent of auth state (a locked-out user still needs to
// see *why* they're locked out). Renders MaintenanceScreen in place of
// `children` while maintenance mode is on.
//
// This is the "cold start" half of maintenance-mode gating. The other half
// is the 503 handler in api/client.ts, which catches an admin flipping the
// switch mid-session.
//
// NOTE: API_ENDPOINTS.APP.STATUS is provisional (see constants/api.ts) —
// confirm the real path/shape with backend, then adjust `checkStatus` below
// if the response doesn't match ApiSuccessResponse<{ maintenanceMode, maintenanceMessage }>.

import { useEffect } from 'react';
import { AppState } from 'react-native';

import { apiClient } from '@/api/client';
import { API_ENDPOINTS } from '@/constants/api';
import { useMaintenanceStore } from '@/store/maintenanceStore';
import { MaintenanceScreen } from '@/components/MaintenanceScreen';
import type { ApiSuccessResponse } from '@/types/api';

interface MaintenanceStatus {
  maintenanceMode: boolean;
  maintenanceMessage: string;
}

async function checkStatus(): Promise<void> {
  try {
    const { data } = await apiClient.get<
      ApiSuccessResponse<MaintenanceStatus> | MaintenanceStatus
    >(API_ENDPOINTS.APP.STATUS);
    const status = 'data' in data ? data.data : data;
    useMaintenanceStore.getState().setMaintenance(status.maintenanceMode, status.maintenanceMessage);
  } catch {
    // Endpoint unreachable/not yet implemented — don't block the app on it.
    // Mid-session 503s are still caught by the response interceptor.
  }
}

interface MaintenanceProviderProps {
  children: React.ReactNode;
}

export function MaintenanceProvider({ children }: MaintenanceProviderProps) {
  const isMaintenance = useMaintenanceStore((s) => s.isMaintenance);
  const message = useMaintenanceStore((s) => s.message);

  useEffect(() => {
    void checkStatus();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkStatus();
    });
    return () => sub.remove();
  }, []);

  if (isMaintenance) {
    return <MaintenanceScreen message={message} />;
  }

  return <>{children}</>;
}

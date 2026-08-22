import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/api/user.api';
import { notify } from '@/services/notificationService';
import type { UserProfile, UpdateProfileRequest } from '@/types/user';

export const profileKeys = {
  all: ['profile'] as const,
};

const EMPTY_PROFILE: Omit<UserProfile, 'id' | 'phone' | 'createdAt' | 'updatedAt'> = {
  name: '',
  email: null,
  avatarUrl: null,
};

export function useProfile() {
  return useQuery({
    queryKey: profileKeys.all,
    queryFn: userApi.getProfile,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updates: UpdateProfileRequest) => userApi.updateProfile(updates),

    // Apply the change immediately in the cache so the UI updates without waiting
    onMutate: async (updates) => {
      await qc.cancelQueries({ queryKey: profileKeys.all });
      const snapshot = qc.getQueryData<UserProfile>(profileKeys.all);

      qc.setQueryData<UserProfile>(profileKeys.all, (prev) => ({
        ...(prev ?? { id: '', phone: '', createdAt: '', updatedAt: '', ...EMPTY_PROFILE }),
        name: updates.name ?? prev?.name ?? '',
        email: updates.email !== undefined
          ? (updates.email || null)
          : (prev?.email ?? null),
      }));

      return { snapshot };
    },

    // On success replace optimistic data with authoritative server response
    onSuccess: (updated) => {
      qc.setQueryData(profileKeys.all, updated);
    },

    // On backend error: keep the optimistic data (local-first — user sees their edit)
    // Do NOT rollback ctx.snapshot — the user entered valid data, it should persist.
  });
}

export function useUploadAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ uri, mimeType }: { uri: string; mimeType: string }) =>
      userApi.uploadAvatar(uri, mimeType),
    onMutate: async ({ uri }) => {
      await qc.cancelQueries({ queryKey: profileKeys.all });
      const snapshot = qc.getQueryData<UserProfile>(profileKeys.all);

      // Show local image immediately — works even if profile wasn't loaded yet
      qc.setQueryData<UserProfile>(profileKeys.all, (prev) =>
        prev
          ? { ...prev, avatarUrl: uri }
          : { id: '', name: '', phone: '', email: null, avatarUrl: uri, createdAt: '', updatedAt: '' },
      );

      return { snapshot };
    },
    onSuccess: (updated) => {
      // Replace with authoritative server URL
      qc.setQueryData(profileKeys.all, updated);
    },
    // On failure the local URI is a dead end (it's never persisted, so it won't
    // survive a refetch/app restart) — roll back to the real photo and tell the
    // user, instead of leaving a photo on screen that silently isn't saved.
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) {
        qc.setQueryData(profileKeys.all, ctx.snapshot);
      }
      notify({
        title: 'Upload failed',
        message: "We couldn't update your profile photo. Please try again.",
        type: 'error',
      });
    },
  });
}

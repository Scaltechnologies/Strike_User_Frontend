import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/api/user.api';
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
      // Show local image immediately — works even if profile wasn't loaded yet
      qc.setQueryData<UserProfile>(profileKeys.all, (prev) =>
        prev
          ? { ...prev, avatarUrl: uri }
          : { id: '', name: '', phone: '', email: null, avatarUrl: uri, createdAt: '', updatedAt: '' },
      );
    },
    onSuccess: (updated) => {
      // Replace with authoritative server URL
      qc.setQueryData(profileKeys.all, updated);
    },
    // onError intentionally absent: keep the local URI visible for this session.
    // The photo is already shown; a silent backend failure is less disruptive than
    // a rollback that makes the image disappear with no explanation.
  });
}

'use client';

import { QueryClient } from '@tanstack/react-query';

export const CACHE_PROFILES = {
  observations: { staleTime: 60_000, gcTime: 600_000 },
  sessions: { staleTime: 120_000, gcTime: 900_000 },
  roster: { staleTime: 300_000, gcTime: 1_800_000 },
  proficiency: { staleTime: 300_000, gcTime: 1_800_000 },
  plans: { staleTime: 300_000, gcTime: 1_800_000 },
  config: { staleTime: 900_000, gcTime: 3_600_000 },
  features: { staleTime: 3_600_000, gcTime: 86_400_000 },
  drills: { staleTime: 3_600_000, gcTime: 86_400_000 },
  branding: { staleTime: 3_600_000, gcTime: 86_400_000 },
  sports: { staleTime: 86_400_000, gcTime: 604_800_000 },
  attendance: { staleTime: 300_000, gcTime: 1_800_000 },
  momentum: { staleTime: 300_000, gcTime: 1_800_000 },
  engagement: { staleTime: 300_000, gcTime: 1_800_000 },
  me: { staleTime: 300_000, gcTime: 1_800_000 },
} as const;

let queryClient: QueryClient | null = null;

export function getQueryClient() {
  if (!queryClient) {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 120_000,
          gcTime: 900_000,
          retry: 2,
          refetchOnWindowFocus: false,
          refetchOnReconnect: true,
        },
      },
    });
  }
  return queryClient;
}

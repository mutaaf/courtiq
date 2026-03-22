'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface FeatureFlagTogglesProps {
  orgId: string;
}

export function FeatureFlagToggles({ orgId }: FeatureFlagTogglesProps) {
  const qc = useQueryClient();

  const { data: flags = [] } = useQuery({
    queryKey: ['all-feature-flags', orgId],
    queryFn: async () => {
      const supabase = createClient();
      const [{ data: systemFlags }, { data: orgFlags }, { data: org }] = await Promise.all([
        supabase.from('feature_flags').select('*').order('flag_key'),
        supabase.from('org_feature_flags').select('*').eq('org_id', orgId),
        supabase.from('organizations').select('tier').eq('id', orgId).single(),
      ]);

      const orgMap = new Map((orgFlags || []).map((f: any) => [f.flag_key, f.enabled]));

      return (systemFlags || []).map((flag: any) => ({
        ...flag,
        enabled: orgMap.has(flag.flag_key)
          ? orgMap.get(flag.flag_key)
          : flag.enabled_tiers.includes(org?.tier || 'free'),
        hasOverride: orgMap.has(flag.flag_key),
        tierEnabled: flag.enabled_tiers.includes(org?.tier || 'free'),
      }));
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ flagKey, enabled }: { flagKey: string; enabled: boolean }) => {
      const res = await fetch(`/api/features/${flagKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, orgId }),
      });
      if (!res.ok) throw new Error('Failed to toggle flag');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-feature-flags', orgId] });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Feature Flags</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {flags.map((flag: any) => (
          <div key={flag.flag_key} className="flex items-center justify-between rounded-lg border border-zinc-800 p-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{flag.name}</span>
                {flag.hasOverride && <Badge variant="warning" className="text-xs">Override</Badge>}
              </div>
              <p className="text-xs text-zinc-500">{flag.description}</p>
              <p className="text-xs text-zinc-600">
                Tiers: {flag.enabled_tiers.join(', ')}
              </p>
            </div>
            <button
              onClick={() => toggleMutation.mutate({ flagKey: flag.flag_key, enabled: !flag.enabled })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                flag.enabled ? 'bg-orange-500' : 'bg-zinc-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  flag.enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

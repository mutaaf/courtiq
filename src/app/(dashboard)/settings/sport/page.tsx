'use client';

import { useState, useEffect } from 'react';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { query, mutate } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { CACHE_PROFILES } from '@/lib/query/config';
import { resolveConfigWithSource, type EffectiveConfig } from '@/lib/config/resolver';
import { SYSTEM_DEFAULTS } from '@/lib/config/defaults';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Save, Loader2, Plus, X, Dumbbell } from 'lucide-react';
import Link from 'next/link';
import type { ConfigScope } from '@/types/database';

const SCOPE_BADGE: Record<ConfigScope | 'system', { label: string; variant: 'default' | 'secondary' | 'success' }> = {
  system: { label: 'System Default', variant: 'secondary' },
  org: { label: 'Org Override', variant: 'default' },
  team: { label: 'Team Override', variant: 'success' },
};

interface StringArrayEditorProps {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  source: ConfigScope;
  placeholder?: string;
}

function StringArrayEditor({ label, items, onChange, source, placeholder }: StringArrayEditorProps) {
  const [newItem, setNewItem] = useState('');

  function addItem() {
    const trimmed = newItem.trim();
    if (trimmed && !items.includes(trimmed)) {
      onChange([...items, trimmed]);
      setNewItem('');
    }
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  const scopeBadge = SCOPE_BADGE[source];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-zinc-300">{label}</label>
        <Badge variant={scopeBadge.variant} className="text-[10px]">
          {scopeBadge.label}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item, i) => (
          <span
            key={`${item}-${i}`}
            className="flex items-center gap-1 rounded-full bg-zinc-800 px-3 py-1 text-sm text-zinc-300"
          >
            {item}
            <button
              type="button"
              onClick={() => removeItem(i)}
              className="ml-0.5 text-zinc-500 hover:text-red-400 transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder={placeholder || `Add new ${label.toLowerCase()}`}
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addItem();
            }
          }}
          className="flex-1"
        />
        <Button type="button" variant="outline" size="sm" onClick={addItem} disabled={!newItem.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function SportConfigPage() {
  const { activeTeam, coach } = useActiveTeam();
  const queryClient = useQueryClient();

  const [positions, setPositions] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [ageGroups, setAgeGroups] = useState<string[]>([]);
  const [initialized, setInitialized] = useState(false);

  const [positionsSource, setPositionsSource] = useState<ConfigScope>('system');
  const [categoriesSource, setCategoriesSource] = useState<ConfigScope>('system');
  const [ageGroupsSource, setAgeGroupsSource] = useState<ConfigScope>('system');

  const { data: configData, isLoading } = useQuery({
    queryKey: activeTeam
      ? queryKeys.config.resolved(activeTeam.org_id, activeTeam.id, 'sport')
      : ['config-none'],
    queryFn: async () => {
      if (!activeTeam) return null;

      // Fetch org overrides
      const orgOverrides = await query<{ domain: string; key: string; value: unknown }[]>({
        table: 'config_overrides',
        select: 'domain, key, value',
        filters: { org_id: activeTeam.org_id, team_id: null },
      });

      const orgMap: Record<string, unknown> = {};
      (orgOverrides || []).forEach((o: any) => {
        orgMap[`${o.domain}.${o.key}`] = o.value;
      });

      // Fetch team overrides
      const teamOverrides = await query<{ domain: string; key: string; value: unknown }[]>({
        table: 'config_overrides',
        select: 'domain, key, value',
        filters: { team_id: activeTeam.id },
      });

      const teamMap: Record<string, unknown> = {};
      (teamOverrides || []).forEach((o: any) => {
        teamMap[`${o.domain}.${o.key}`] = o.value;
      });

      const params = {
        domain: 'sport',
        systemDefaults: SYSTEM_DEFAULTS as any,
        orgOverrides: orgMap,
        teamOverrides: teamMap,
      };

      return {
        positions: resolveConfigWithSource<string[]>({ ...params, key: 'positions' }),
        categories: resolveConfigWithSource<string[]>({ ...params, key: 'categories' }),
        age_groups: resolveConfigWithSource<string[]>({ ...params, key: 'age_groups' }),
      };
    },
    enabled: !!activeTeam,
    ...CACHE_PROFILES.config,
  });

  useEffect(() => {
    if (configData && !initialized) {
      setPositions(configData.positions.value || []);
      setCategories(configData.categories.value || []);
      setAgeGroups(configData.age_groups.value || []);
      setPositionsSource(configData.positions.source);
      setCategoriesSource(configData.categories.source);
      setAgeGroupsSource(configData.age_groups.source);
      setInitialized(true);
    }
  }, [configData, initialized]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!activeTeam) throw new Error('No team');
      if (!coach) throw new Error('Not authenticated');

      const overrides = [
        { domain: 'sport', key: 'positions', value: positions },
        { domain: 'sport', key: 'categories', value: categories },
        { domain: 'sport', key: 'age_groups', value: ageGroups },
      ];

      for (const override of overrides) {
        // Check if override already exists
        const existing = await query<{ id: string }[]>({
          table: 'config_overrides',
          select: 'id',
          filters: {
            org_id: activeTeam.org_id,
            domain: override.domain,
            key: override.key,
            team_id: null,
          },
          limit: 1,
        });

        if (existing && existing.length > 0) {
          await mutate({
            table: 'config_overrides',
            operation: 'update',
            data: {
              value: override.value as any,
              changed_by: coach.id,
            },
            filters: { id: existing[0].id },
          });
        } else {
          await mutate({
            table: 'config_overrides',
            operation: 'insert',
            data: {
              org_id: activeTeam.org_id,
              scope: 'org' as const,
              domain: override.domain,
              key: override.key,
              value: override.value as any,
              changed_by: coach.id,
            },
          });
        }
      }
    },
    onSuccess: () => {
      if (activeTeam) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.config.resolved(activeTeam.org_id, activeTeam.id, 'sport'),
        });
      }
    },
  });

  return (
    <div className="p-4 lg:p-8 space-y-6 pb-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/settings">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Sport Configuration</h1>
          <p className="text-zinc-400 text-sm">Customize positions, categories, and age groups</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Dumbbell className="h-5 w-5 text-orange-400" />
                Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-8">
              <StringArrayEditor
                label="Positions"
                items={positions}
                onChange={setPositions}
                source={positionsSource}
                placeholder="e.g. PG, SG, SF"
              />

              <StringArrayEditor
                label="Observation Categories"
                items={categories}
                onChange={setCategories}
                source={categoriesSource}
                placeholder="e.g. Shooting, Defense"
              />

              <StringArrayEditor
                label="Age Groups"
                items={ageGroups}
                onChange={setAgeGroups}
                source={ageGroupsSource}
                placeholder="e.g. 8-10, 11-13"
              />

              <div className="flex justify-end pt-2">
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save Configuration
                </Button>
              </div>

              {saveMutation.isSuccess && (
                <p className="text-xs text-emerald-400">Configuration saved successfully.</p>
              )}
              {saveMutation.isError && (
                <p className="text-xs text-red-400">Failed to save. Please try again.</p>
              )}
            </CardContent>
          </Card>

          {/* Inheritance info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-zinc-400">How configuration inheritance works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-zinc-500">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">System Default</Badge>
                <span>Built-in defaults for the sport</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="default" className="text-[10px]">Org Override</Badge>
                <span>Overrides system defaults for your organization</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="success" className="text-[10px]">Team Override</Badge>
                <span>Overrides org settings for a specific team</span>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

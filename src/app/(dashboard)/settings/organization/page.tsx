'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { queryKeys } from '@/lib/query/keys';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Save, Loader2, Building2, Shield } from 'lucide-react';
import Link from 'next/link';

export default function OrganizationSettingsPage() {
  const queryClient = useQueryClient();

  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [initialized, setInitialized] = useState(false);

  const { data: coachWithOrg, isLoading } = useQuery({
    queryKey: [...queryKeys.coach.current(), 'with-org'],
    queryFn: async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from('coaches')
        .select('*, organizations(*)')
        .eq('id', user.id)
        .single();
      return data;
    },
  });

  const coach = coachWithOrg;
  const org = coachWithOrg?.organizations;
  const isAdmin = coach?.role === 'admin' || coach?.role === 'head_coach';

  useEffect(() => {
    if (org && !initialized) {
      setOrgName(org.name || '');
      setOrgSlug(org.slug || '');
      setInitialized(true);
    }
  }, [org, initialized]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!org) throw new Error('No organization');
      const supabase = createClient();
      const { error } = await supabase
        .from('organizations')
        .update({
          name: orgName,
          slug: orgSlug,
        })
        .eq('id', org.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.coach.current() });
    },
  });

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/settings">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Organization</h1>
          <p className="text-zinc-400 text-sm">Manage your organization settings</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : !isAdmin ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Shield className="h-12 w-12 text-zinc-600 mb-4" />
            <p className="text-zinc-400 text-sm">
              You need admin or head coach permissions to edit organization settings.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-5 w-5 text-purple-400" />
                Organization Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Organization Name</label>
                <Input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="e.g. Westside Basketball Academy"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Slug</label>
                <Input
                  value={orgSlug}
                  onChange={(e) =>
                    setOrgSlug(
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, '-')
                        .replace(/-+/g, '-')
                    )
                  }
                  placeholder="westside-basketball"
                />
                <p className="text-xs text-zinc-500">
                  Used in share links and public pages
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  onClick={() => updateMutation.mutate()}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save Changes
                </Button>
              </div>

              {updateMutation.isSuccess && (
                <p className="text-xs text-emerald-400">Organization updated successfully.</p>
              )}
              {updateMutation.isError && (
                <p className="text-xs text-red-400">Failed to update. Please try again.</p>
              )}
            </CardContent>
          </Card>

          {/* Tier info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Subscription</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-300">Current Plan</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Manage your subscription and billing
                  </p>
                </div>
                <Badge variant="default" className="text-sm">
                  {(org?.settings as any)?.tier || 'Free'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mutate } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTier } from '@/hooks/use-tier';
import { ArrowLeft, Save, Loader2, Building2, Shield, Palette, Eye, Lock } from 'lucide-react';
import Link from 'next/link';

interface OrgBranding {
  primary_color: string;
  logo_light_url: string | null;
  parent_portal_header_text: string | null;
}

// --- Mini preview of the parent portal header ---
function BrandingPreview({ color, logoUrl, headerText }: { color: string; logoUrl: string; headerText: string }) {
  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden">
      <div className="px-3 py-1.5 flex items-center gap-1.5 border-b border-zinc-700 bg-zinc-800">
        <div className="h-2 w-2 rounded-full bg-zinc-600" />
        <div className="h-2 w-2 rounded-full bg-zinc-600" />
        <div className="h-2 w-2 rounded-full bg-zinc-600" />
        <span className="ml-1 text-[10px] text-zinc-500">Parent Report Preview</span>
      </div>
      <div className="bg-gray-50 px-6 pt-6 pb-4 text-center space-y-2">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt="Org logo"
            className="mx-auto h-8 w-auto object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
          {headerText || 'Progress Report'}
        </p>
        <p className="text-base font-bold" style={{ color }}>Your Team Name</p>
        <p className="text-[11px] text-gray-500">Player Progress Report · Season 2026</p>
      </div>
    </div>
  );
}

export default function OrganizationSettingsPage() {
  const queryClient = useQueryClient();
  const { canAccess } = useTier();
  const hasBranding = canAccess('custom_branding');

  // Org details
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [initialized, setInitialized] = useState(false);

  // Branding
  const [primaryColor, setPrimaryColor] = useState('#F97316');
  const [logoUrl, setLogoUrl] = useState('');
  const [headerText, setHeaderText] = useState('');
  const [brandingInitialized, setBrandingInitialized] = useState(false);

  const { data: coachWithOrg, isLoading } = useQuery({
    queryKey: [...queryKeys.coach.current(), 'with-org'],
    queryFn: async () => {
      const res = await fetch('/api/me');
      if (!res.ok) return null;
      const meData = await res.json();
      return meData.coach;
    },
  });

  const { data: brandingData, isLoading: brandingLoading } = useQuery({
    queryKey: ['org-branding'],
    queryFn: async () => {
      const res = await fetch('/api/branding');
      if (!res.ok) return null;
      const d = await res.json();
      return d.branding as OrgBranding | null;
    },
    enabled: hasBranding,
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

  useEffect(() => {
    if (brandingData && !brandingInitialized) {
      setPrimaryColor(brandingData.primary_color || '#F97316');
      setLogoUrl(brandingData.logo_light_url || '');
      setHeaderText(brandingData.parent_portal_header_text || '');
      setBrandingInitialized(true);
    }
  }, [brandingData, brandingInitialized]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!org) throw new Error('No organization');
      await mutate({
        table: 'organizations',
        operation: 'update',
        data: { name: orgName, slug: orgSlug },
        filters: { id: org.id },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.coach.current() });
    },
  });

  const brandingMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primary_color: primaryColor,
          logo_light_url: logoUrl || null,
          parent_portal_header_text: headerText || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save branding');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-branding'] });
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
          {/* Org Details */}
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
                <p className="text-xs text-zinc-500">Used in share links and public pages</p>
              </div>
              <div className="flex justify-end pt-2">
                <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
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

          {/* Parent Portal Branding */}
          {hasBranding ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Palette className="h-5 w-5 text-pink-400" />
                  Parent Portal Branding
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {brandingLoading ? (
                  <Skeleton className="h-32 w-full rounded-xl" />
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Color picker */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-300">Accent Color</label>
                        <div className="flex items-center gap-2">
                          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-zinc-600 cursor-pointer">
                            <input
                              type="color"
                              value={primaryColor}
                              onChange={(e) => setPrimaryColor(e.target.value)}
                              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                              aria-label="Pick accent color"
                            />
                            <div className="h-full w-full rounded-lg" style={{ background: primaryColor }} />
                          </div>
                          <Input
                            value={primaryColor}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setPrimaryColor(v);
                            }}
                            placeholder="#F97316"
                            className="font-mono"
                          />
                        </div>
                        <p className="text-xs text-zinc-500">
                          Shown as the team name color on parent reports
                        </p>
                      </div>

                      {/* Logo URL */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-300">Logo URL</label>
                        <Input
                          value={logoUrl}
                          onChange={(e) => setLogoUrl(e.target.value)}
                          placeholder="https://yourorg.com/logo.png"
                        />
                        <p className="text-xs text-zinc-500">
                          Appears above every parent progress report
                        </p>
                      </div>
                    </div>

                    {/* Header text */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-300">
                        Report Header Text
                      </label>
                      <Input
                        value={headerText}
                        onChange={(e) => setHeaderText(e.target.value)}
                        placeholder="Progress Report"
                        maxLength={60}
                      />
                      <p className="text-xs text-zinc-500">
                        Small label above the team name (e.g. &ldquo;YMCA Winter Season Report&rdquo;)
                      </p>
                    </div>

                    {/* Live preview */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
                        <Eye className="h-3.5 w-3.5" />
                        Preview
                      </div>
                      <BrandingPreview
                        color={primaryColor}
                        logoUrl={logoUrl}
                        headerText={headerText}
                      />
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <p className="text-xs text-zinc-500">
                        Applied to all parent share links for your organization
                      </p>
                      <Button
                        onClick={() => brandingMutation.mutate()}
                        disabled={brandingMutation.isPending}
                      >
                        {brandingMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        Save Branding
                      </Button>
                    </div>
                    {brandingMutation.isSuccess && (
                      <p className="text-xs text-emerald-400">Branding saved — live on all parent portals.</p>
                    )}
                    {brandingMutation.isError && (
                      <p className="text-xs text-red-400">
                        {(brandingMutation.error as Error)?.message || 'Failed to save branding.'}
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dashed border-zinc-700">
              <CardContent className="flex items-center gap-4 py-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-800">
                  <Lock className="h-5 w-5 text-zinc-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-300">Custom Branding</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Set your logo, accent color, and report header text on every parent portal.
                    Available on the Organization plan.
                  </p>
                </div>
                <Link href="/settings/upgrade" className="shrink-0">
                  <Button size="sm" variant="outline">Upgrade</Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Subscription */}
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

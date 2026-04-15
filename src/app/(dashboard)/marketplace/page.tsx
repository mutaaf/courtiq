'use client';

import { useState } from 'react';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useTier } from '@/hooks/use-tier';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { query } from '@/lib/api';
import { CACHE_PROFILES } from '@/lib/query/config';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Store,
  BookOpen,
  Download,
  Globe,
  Lock,
  Loader2,
  CheckCircle2,
  Upload,
  Search,
  Users,
  X,
  AlertCircle,
} from 'lucide-react';
import type { Curriculum, Team } from '@/types/database';

type MarketplaceCurriculum = Curriculum & {
  skill_count: number;
  is_own: boolean;
  sports: { id: string; name: string; slug: string; icon: string | null } | null;
};

export default function MarketplacePage() {
  const { activeTeam } = useActiveTeam();
  const { canAccess } = useTier();
  const qc = useQueryClient();
  const canPublish = canAccess('curriculum_publish');

  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [publishModalId, setPublishModalId] = useState<string | null>(null);
  const [publisherName, setPublisherName] = useState('');

  // All public curricula
  const { data, isLoading } = useQuery({
    queryKey: ['marketplace'],
    queryFn: async () => {
      const res = await fetch('/api/marketplace');
      if (!res.ok) throw new Error('Failed to load marketplace');
      return res.json() as Promise<{ curricula: MarketplaceCurriculum[] }>;
    },
    ...CACHE_PROFILES.sessions,
  });

  // Coach's own curricula (for the "Publish" tab)
  const { data: ownData } = useQuery({
    queryKey: ['own-curricula'],
    queryFn: async () => {
      const res = await query<Curriculum[]>({
        table: 'curricula',
        select: 'id, name, description, is_public, publisher_name, org_id',
        filters: { org_id: activeTeam?.org_id ?? '' },
        order: { column: 'created_at', ascending: false },
      });
      return res ?? [];
    },
    enabled: !!activeTeam?.org_id && canPublish,
    ...CACHE_PROFILES.config,
  });

  // Teams in this org (for import target)
  const { data: teamsData } = useQuery({
    queryKey: ['org-teams', activeTeam?.org_id],
    queryFn: async () =>
      query<Team[]>({
        table: 'teams',
        select: 'id, name, age_group',
        filters: { org_id: activeTeam?.org_id ?? '', is_active: true },
        order: { column: 'name', ascending: true },
      }),
    enabled: !!activeTeam?.org_id,
    ...CACHE_PROFILES.sessions,
  });

  const teams: Team[] = teamsData ?? [];
  const marketplaceCurricula: MarketplaceCurriculum[] = (data as { curricula: MarketplaceCurriculum[] } | undefined)?.curricula ?? [];
  const ownCurricula: Curriculum[] = ownData ?? [];

  const filtered = marketplaceCurricula.filter((c) =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.description ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (c.publisher_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (c.sports?.name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  async function handleImport(curriculumId: string) {
    setImporting(curriculumId);
    setImportError(null);
    setImportSuccess(null);
    try {
      const res = await fetch('/api/marketplace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'import',
          curriculum_id: curriculumId,
          team_id: activeTeam?.id,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Import failed');
      setImportSuccess(curriculumId);
      qc.invalidateQueries({ queryKey: ['marketplace'] });
      qc.invalidateQueries({ queryKey: ['own-curricula'] });
    } catch (e: any) {
      setImportError(e.message);
    } finally {
      setImporting(null);
    }
  }

  async function handlePublishToggle(curriculumId: string) {
    setPublishing(curriculumId);
    try {
      const res = await fetch('/api/marketplace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'publish',
          curriculum_id: curriculumId,
          publisher_name: publisherName.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to update publish status');
      qc.invalidateQueries({ queryKey: ['marketplace'] });
      qc.invalidateQueries({ queryKey: ['own-curricula'] });
      setPublishModalId(null);
      setPublisherName('');
    } catch (e: any) {
      console.error(e);
    } finally {
      setPublishing(null);
    }
  }

  const [activeTab, setActiveTab] = useState<'browse' | 'manage'>('browse');

  return (
    <div className="p-4 lg:p-8 space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Store className="h-6 w-6 text-orange-500" />
            <h1 className="text-2xl font-bold">Curriculum Marketplace</h1>
          </div>
          <p className="text-zinc-400 text-sm mt-1">
            Browse and import skill curricula shared by coaches worldwide
          </p>
        </div>
        {canPublish && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setActiveTab(activeTab === 'manage' ? 'browse' : 'manage')}
            className="shrink-0"
          >
            {activeTab === 'manage' ? (
              <>
                <Store className="h-4 w-4 mr-2" />
                Browse
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Manage Published
              </>
            )}
          </Button>
        )}
      </div>

      {/* Tab: Manage own published curricula */}
      {activeTab === 'manage' && canPublish && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
            Your Curricula
          </h2>
          {ownCurricula.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-zinc-500">
                <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No curricula in your organization yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {ownCurricula.map((c) => (
                <Card key={c.id} className="relative">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-zinc-100 truncate">{c.name}</p>
                        {c.description && (
                          <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2">{c.description}</p>
                        )}
                      </div>
                      {c.is_public ? (
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shrink-0">
                          <Globe className="h-3 w-3 mr-1" />
                          Public
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-zinc-500 shrink-0">
                          <Lock className="h-3 w-3 mr-1" />
                          Private
                        </Badge>
                      )}
                    </div>
                    {c.is_public && c.publisher_name && (
                      <p className="text-xs text-zinc-500">Published as: {c.publisher_name}</p>
                    )}
                    <Button
                      size="sm"
                      variant={c.is_public ? 'outline' : 'default'}
                      className={`w-full ${!c.is_public ? 'bg-orange-500 hover:bg-orange-600 text-white' : ''}`}
                      onClick={() => {
                        if (c.is_public) {
                          // Unpublish directly
                          handlePublishToggle(c.id);
                        } else {
                          setPublishModalId(c.id);
                        }
                      }}
                      disabled={publishing === c.id}
                    >
                      {publishing === c.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : c.is_public ? (
                        <>
                          <Lock className="h-4 w-4 mr-2" />
                          Unpublish
                        </>
                      ) : (
                        <>
                          <Globe className="h-4 w-4 mr-2" />
                          Publish to Marketplace
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Browse marketplace */}
      {activeTab === 'browse' && (
        <>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by name, sport, or publisher…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
            />
          </div>

          {/* Error banner */}
          {importError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {importError}
              <button onClick={() => setImportError(null)} className="ml-auto">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-48 rounded-xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-16 flex flex-col items-center text-center text-zinc-500">
                <Store className="h-14 w-14 mb-4 opacity-30" />
                <p className="font-medium text-zinc-300">
                  {search ? 'No curricula match your search' : 'No curricula published yet'}
                </p>
                <p className="text-sm mt-1">
                  {search
                    ? 'Try a different keyword'
                    : canPublish
                    ? 'Be the first! Switch to "Manage Published" to share your curriculum.'
                    : 'Upgrade to Pro Coach to publish your own curricula.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((c) => {
                const isImporting = importing === c.id;
                const succeeded = importSuccess === c.id;

                return (
                  <Card
                    key={c.id}
                    className={`transition-all ${c.is_own ? 'border-orange-500/30 ring-1 ring-orange-500/10' : ''}`}
                  >
                    <CardContent className="p-4 flex flex-col gap-3 h-full">
                      {/* Sport + own badge */}
                      <div className="flex items-center gap-2">
                        {c.sports && (
                          <Badge variant="outline" className="text-xs text-zinc-400">
                            {c.sports.icon && <span className="mr-1">{c.sports.icon}</span>}
                            {c.sports.name}
                          </Badge>
                        )}
                        {c.is_own && (
                          <Badge className="text-xs bg-orange-500/20 text-orange-400 border-orange-500/30">
                            Yours
                          </Badge>
                        )}
                      </div>

                      {/* Name + description */}
                      <div className="flex-1">
                        <p className="font-semibold text-zinc-100 leading-tight">{c.name}</p>
                        {c.description && (
                          <p className="text-xs text-zinc-400 mt-1 line-clamp-3">{c.description}</p>
                        )}
                      </div>

                      {/* Stats row */}
                      <div className="flex items-center gap-4 text-xs text-zinc-500">
                        <span className="flex items-center gap-1">
                          <BookOpen className="h-3.5 w-3.5" />
                          {c.skill_count} skill{c.skill_count !== 1 ? 's' : ''}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {c.import_count} import{c.import_count !== 1 ? 's' : ''}
                        </span>
                        {c.publisher_name && (
                          <span className="flex items-center gap-1 ml-auto truncate max-w-[120px]">
                            <Globe className="h-3.5 w-3.5 shrink-0" />
                            {c.publisher_name}
                          </span>
                        )}
                      </div>

                      {/* Import button */}
                      {!c.is_own && (
                        <Button
                          size="sm"
                          className="w-full bg-orange-500 hover:bg-orange-600 text-white touch-manipulation active:scale-[0.98]"
                          onClick={() => handleImport(c.id)}
                          disabled={isImporting || succeeded}
                        >
                          {isImporting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : succeeded ? (
                            <>
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                              Imported!
                            </>
                          ) : (
                            <>
                              <Download className="h-4 w-4 mr-2" />
                              Import Curriculum
                            </>
                          )}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Stats footer */}
          {!isLoading && filtered.length > 0 && (
            <p className="text-xs text-zinc-600 text-center">
              {filtered.length} curriculum{filtered.length !== 1 ? 's' : ''} available
            </p>
          )}
        </>
      )}

      {/* Publish modal */}
      {publishModalId && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <Card className="w-full max-w-md animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Publish to Marketplace</h2>
                <button
                  onClick={() => { setPublishModalId(null); setPublisherName(''); }}
                  className="text-zinc-400 hover:text-zinc-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="text-sm text-zinc-400">
                Your curriculum will be visible to all SportsIQ coaches. They can import a copy —
                your original stays private.
              </p>
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400 font-medium">
                  Publisher name (shown in marketplace)
                </label>
                <input
                  type="text"
                  placeholder="e.g. YMCA Metro, Coach Williams…"
                  value={publisherName}
                  onChange={(e) => setPublisherName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                />
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setPublishModalId(null); setPublisherName(''); }}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                  onClick={() => handlePublishToggle(publishModalId)}
                  disabled={!!publishing}
                >
                  {publishing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Globe className="h-4 w-4 mr-2" />
                      Publish
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

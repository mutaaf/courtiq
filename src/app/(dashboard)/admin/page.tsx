'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useTier } from '@/hooks/use-tier';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  ShieldCheck,
  Users,
  UserPlus,
  Loader2,
  Crown,
  BarChart2,
  ArrowRight,
} from 'lucide-react';
import type { CoachRole } from '@/types/database';

interface OrgCoach {
  id: string;
  full_name: string;
  email: string;
  role: CoachRole;
  created_at: string;
}

interface OrgTeam {
  id: string;
  name: string;
  player_count: number;
}

const ROLE_OPTIONS: CoachRole[] = ['admin', 'head_coach', 'coach', 'assistant'];

function roleBadgeColor(role: CoachRole) {
  switch (role) {
    case 'admin': return 'bg-red-500/15 text-red-400 border-red-500/20';
    case 'head_coach': return 'bg-orange-500/15 text-orange-400 border-orange-500/20';
    case 'coach': return 'bg-blue-500/15 text-blue-400 border-blue-500/20';
    case 'assistant': return 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20';
    default: return 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20';
  }
}

export default function AdminPage() {
  const { coach } = useActiveTeam();
  const { tier, isOrg } = useTier();

  const [coaches, setCoaches] = useState<OrgCoach[]>([]);
  const [teams, setTeams] = useState<OrgTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<string | null>(null);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);

  const isAdminUser = coach?.role === 'admin';

  useEffect(() => {
    if (!isAdminUser) return;
    loadData();
  }, [isAdminUser]);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/coaches');
      if (res.ok) {
        const data = await res.json();
        setCoaches(data.coaches || []);
        setTeams(data.teams || []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteResult(null);
    try {
      const res = await fetch('/api/admin/coaches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setInviteResult(`Invitation sent to ${inviteEmail}`);
        setInviteEmail('');
        loadData();
      } else {
        setInviteResult(data.error || 'Failed to send invite');
      }
    } catch {
      setInviteResult('Failed to send invite');
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(coachId: string, newRole: CoachRole) {
    const previousRole = coaches.find((c) => c.id === coachId)?.role;
    setUpdatingRole(coachId);
    setRoleError(null);
    // Optimistic update
    setCoaches((prev) =>
      prev.map((c) => (c.id === coachId ? { ...c, role: newRole } : c))
    );
    try {
      const res = await fetch('/api/admin/coaches', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachId, role: newRole }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // Rollback optimistic update
        if (previousRole) {
          setCoaches((prev) =>
            prev.map((c) => (c.id === coachId ? { ...c, role: previousRole } : c))
          );
        }
        setRoleError(data.error || 'Failed to update role. Please try again.');
      }
    } catch {
      // Rollback optimistic update on network error
      if (previousRole) {
        setCoaches((prev) =>
          prev.map((c) => (c.id === coachId ? { ...c, role: previousRole } : c))
        );
      }
      setRoleError('Network error — role change not saved.');
    } finally {
      setUpdatingRole(null);
    }
  }

  if (!isAdminUser || !isOrg) {
    return (
      <div className="flex items-center justify-center p-8 min-h-[60vh]">
        <Card className="max-w-md text-center">
          <CardContent className="p-8">
            <ShieldCheck className="mx-auto h-10 w-10 text-zinc-600 mb-4" />
            <h3 className="text-lg font-semibold">Admin Access Required</h3>
            <p className="text-sm text-zinc-400 mt-2">
              This page is only available to organization administrators.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <ShieldCheck className="h-7 w-7 text-orange-500" />
          Admin Panel
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Manage coaches, teams, and organization settings
        </p>
      </div>

      {/* Org Tier */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Crown className="h-4 w-4 text-orange-400" />
            Organization Plan
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <Badge className={`text-sm capitalize ${roleBadgeColor('admin')}`}>
            {tier.replace('_', ' ')}
          </Badge>
          <Link href="/admin/org-analytics" className="ml-auto">
            <Button variant="outline" size="sm" className="gap-2 text-xs h-8">
              <BarChart2 className="h-3.5 w-3.5 text-orange-400" />
              Cross-Team Analytics
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Coaches list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-400" />
            Coaches ({coaches.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {roleError && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {roleError}
            </p>
          )}
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
            </div>
          ) : coaches.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-4">No coaches found</p>
          ) : (
            coaches.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/30 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-200 truncate">{c.full_name}</p>
                  <p className="text-xs text-zinc-500 truncate">{c.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <select
                    value={c.role}
                    onChange={(e) => handleRoleChange(c.id, e.target.value as CoachRole)}
                    disabled={c.id === coach?.id || updatingRole === c.id}
                    className="h-8 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-50"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                  {updatingRole === c.id && (
                    <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Invite coach */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-emerald-400" />
            Invite Coach
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="coach@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1"
            />
            <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
              {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Invite
            </Button>
          </div>
          {inviteResult && (
            <p className="text-sm text-zinc-400">{inviteResult}</p>
          )}
        </CardContent>
      </Card>

      {/* Teams overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-purple-400" />
            Teams ({teams.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
            </div>
          ) : teams.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-4">No teams found</p>
          ) : (
            <div className="space-y-2">
              {teams.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/30 p-3"
                >
                  <span className="text-sm font-medium text-zinc-200">{t.name}</span>
                  <span className="text-xs text-zinc-500">{t.player_count} players</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

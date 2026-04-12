import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

export type EngagementStatus = 'engaged' | 'moderate' | 'stale' | 'never_opened' | 'unshared';

export interface PlayerEngagement {
  id: string;
  name: string;
  nickname: string | null;
  jersey_number: number | null;
  photo_url: string | null;
  status: EngagementStatus;
  score: number; // 0–4
  viewCount: number;
  lastViewed: string | null;
  shareToken: string | null;
}

export interface EngagementSummary {
  total: number;
  engaged: number;
  moderate: number;
  stale: number;
  never_opened: number;
  unshared: number;
}

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('team_id');
  if (!teamId) return NextResponse.json({ error: 'team_id required' }, { status: 400 });

  const admin = await createServiceSupabase();

  // Verify coach belongs to this team
  const { data: membership } = await admin
    .from('team_coaches')
    .select('id')
    .eq('team_id', teamId)
    .eq('coach_id', user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [{ data: players }, { data: shares }] = await Promise.all([
    admin
      .from('players')
      .select('id, name, nickname, jersey_number, photo_url')
      .eq('team_id', teamId)
      .eq('is_active', true)
      .order('name'),
    admin
      .from('parent_shares')
      .select('player_id, view_count, last_viewed_at, created_at, share_token')
      .eq('team_id', teamId)
      .eq('is_active', true),
  ]);

  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

  // Build player_id → most recent active share
  const shareMap: Record<string, { view_count: number; last_viewed_at: string | null; share_token: string }> = {};
  for (const share of shares ?? []) {
    const existing = shareMap[share.player_id];
    if (!existing || new Date(share.created_at) > new Date((shares ?? []).find(s => s.share_token === existing.share_token)?.created_at ?? 0)) {
      shareMap[share.player_id] = {
        view_count: share.view_count ?? 0,
        last_viewed_at: share.last_viewed_at,
        share_token: share.share_token,
      };
    }
  }

  const playerEngagement: PlayerEngagement[] = (players ?? []).map((player) => {
    const share = shareMap[player.id];

    if (!share) {
      return { ...player, status: 'unshared' as EngagementStatus, score: 0, viewCount: 0, lastViewed: null, shareToken: null };
    }

    if (!share.view_count || share.view_count === 0) {
      return { ...player, status: 'never_opened' as EngagementStatus, score: 1, viewCount: 0, lastViewed: null, shareToken: share.share_token };
    }

    const msAgo = now - new Date(share.last_viewed_at!).getTime();

    if (msAgo <= sevenDaysMs) {
      return { ...player, status: 'engaged' as EngagementStatus, score: 4, viewCount: share.view_count, lastViewed: share.last_viewed_at, shareToken: share.share_token };
    }
    if (msAgo <= fourteenDaysMs) {
      return { ...player, status: 'moderate' as EngagementStatus, score: 3, viewCount: share.view_count, lastViewed: share.last_viewed_at, shareToken: share.share_token };
    }
    return { ...player, status: 'stale' as EngagementStatus, score: 2, viewCount: share.view_count, lastViewed: share.last_viewed_at, shareToken: share.share_token };
  });

  const summary: EngagementSummary = {
    total: playerEngagement.length,
    engaged: playerEngagement.filter((p) => p.status === 'engaged').length,
    moderate: playerEngagement.filter((p) => p.status === 'moderate').length,
    stale: playerEngagement.filter((p) => p.status === 'stale').length,
    never_opened: playerEngagement.filter((p) => p.status === 'never_opened').length,
    unshared: playerEngagement.filter((p) => p.status === 'unshared').length,
  };

  return NextResponse.json({ players: playerEngagement, summary });
}

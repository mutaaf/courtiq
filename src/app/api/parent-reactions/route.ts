import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import {
  isValidReaction,
  isValidMessage,
  isValidParentName,
  ALLOWED_REACTIONS,
} from '@/lib/parent-reaction-utils';

// ─── IP rate limit: 30 reactions per 24h per IP ──────────────────────────────

interface IpEntry {
  count: number;
  resetAt: number;
}

const ipMap = new Map<string, IpEntry>();
const IP_LIMIT = 30;
const IP_WINDOW_MS = 86_400_000; // 24 hours

function checkIpLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipMap.get(ip);

  if (!entry || entry.resetAt <= now) {
    if (ipMap.size > 5_000 && Math.random() < 0.05) {
      for (const [k, v] of ipMap) {
        if (v.resetAt <= now) ipMap.delete(k);
      }
    }
    ipMap.set(ip, { count: 1, resetAt: now + IP_WINDOW_MS });
    return true;
  }

  entry.count += 1;
  return entry.count <= IP_LIMIT;
}

// ─── GET /api/parent-reactions?team_id=xxx ────────────────────────────────────
// Returns reactions for the authenticated coach's team.

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('team_id');
    if (!teamId) return NextResponse.json({ error: 'team_id required' }, { status: 400 });

    const admin = await createServiceSupabase();

    // Verify coach is a member of this team. team_coaches has a composite
    // (team_id, coach_id) key — no `id` column — so we select team_id and
    // .maybeSingle() instead of .single() to avoid throwing on no-row.
    const { data: membership } = await admin
      .from('team_coaches')
      .select('team_id')
      .eq('team_id', teamId)
      .eq('coach_id', user.id)
      .maybeSingle();
    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: reactions, error } = await admin
      .from('parent_reactions')
      .select('*, players(name, nickname)')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return NextResponse.json({ reactions: reactions ?? [] });
  } catch (err) {
    console.error('[parent-reactions GET]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ─── POST /api/parent-reactions ───────────────────────────────────────────────
// Public endpoint — parents submit a reaction from the share portal.
// Body: { share_token, reaction, message?, parent_name? }

export async function POST(request: Request) {
  try {
    // IP rate limit
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown';

    if (!checkIpLimit(ip)) {
      return NextResponse.json(
        { error: 'Too many reactions. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

    const { share_token, reaction, message, parent_name } = body;

    // Validate fields
    if (!share_token || typeof share_token !== 'string') {
      return NextResponse.json({ error: 'share_token required' }, { status: 400 });
    }
    const emoji = reaction ?? ALLOWED_REACTIONS[0];
    if (!isValidReaction(emoji)) {
      return NextResponse.json({ error: 'Invalid reaction emoji' }, { status: 400 });
    }
    if (!isValidMessage(message)) {
      return NextResponse.json({ error: 'Message too long (max 200 characters)' }, { status: 400 });
    }
    if (!isValidParentName(parent_name)) {
      return NextResponse.json({ error: 'Name too long (max 50 characters)' }, { status: 400 });
    }

    const admin = await createServiceSupabase();

    // Verify the share token is valid and active
    const { data: share } = await admin
      .from('parent_shares')
      .select('player_id, team_id, coach_id, is_active, expires_at')
      .eq('share_token', share_token)
      .eq('is_active', true)
      .single();

    if (!share) {
      return NextResponse.json({ error: 'Invalid share link' }, { status: 404 });
    }
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Share link has expired' }, { status: 410 });
    }

    const { error: insertError } = await admin.from('parent_reactions').insert({
      share_token,
      player_id: share.player_id,
      team_id: share.team_id,
      coach_id: share.coach_id,
      reaction: emoji,
      message: message?.trim() || null,
      parent_name: parent_name?.trim() || null,
      is_read: false,
    });

    if (insertError) throw insertError;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[parent-reactions POST]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ─── PATCH /api/parent-reactions?team_id=xxx ─────────────────────────────────
// Mark all reactions as read for a team.

export async function PATCH(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('team_id');
    if (!teamId) return NextResponse.json({ error: 'team_id required' }, { status: 400 });

    const admin = await createServiceSupabase();

    // Verify coach access
    const { data: teamOwner } = await admin
      .from('teams')
      .select('id')
      .eq('id', teamId)
      .eq('coach_id', user.id)
      .single();
    if (!teamOwner) {
      const { data: membership } = await admin
        .from('team_coaches')
        .select('team_id')
        .eq('team_id', teamId)
        .eq('coach_id', user.id)
        .maybeSingle();
      if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await admin
      .from('parent_reactions')
      .update({ is_read: true })
      .eq('team_id', teamId)
      .eq('is_read', false);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[parent-reactions PATCH]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

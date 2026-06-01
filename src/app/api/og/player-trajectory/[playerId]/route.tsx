/**
 * Ticket 0061 — GET /api/og/player-trajectory/[playerId].
 *
 * Renders a 1280x720 portrait card with the SAME cached started + now
 * sentences the JSON route writes. NEVER invokes the AI — the route reads
 * the existing cache row at the player's CURRENT bucket and 404s if no row
 * exists (the UI falls back to the inline card without the OG image).
 *
 * Authed: head coach of the player's team only. NOT in `publicPaths` —
 * the coach screenshots and shares manually (the AC's anti-goal: no
 * public token surface in v1).
 *
 * Per LESSONS#0060 — tested by vi.mock('next/og') asserting status +
 * content-type only (no real satori render).
 *
 * COPPA: the rendered React tree contains the player's FIRST NAME only
 * (never the last name, parent contact, or DOB).
 */
import { ImageResponse } from 'next/og';
import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { firstNameOf, observationBucket } from '@/lib/player-trajectory-utils';

export const runtime = 'nodejs';

const SIZE = { width: 1280, height: 720 };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ playerId: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { playerId } = await params;
  if (!playerId) {
    return NextResponse.json({ error: 'playerId required' }, { status: 400 });
  }

  const admin = await createServiceSupabase();

  // 1) player lookup. Same COPPA posture as the JSON route: read parent_email
  //    / parent_phone / date_of_birth here ONLY to verify existence; none
  //    reach the rendered card.
  const { data: player } = await admin
    .from('players')
    .select('id, team_id, name')
    .eq('id', playerId)
    .single();
  if (!player) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  }
  const teamId = (player as { team_id: string }).team_id;
  const playerFirstName = firstNameOf((player as { name: string }).name);

  // 2) head-coach ownership via team_coaches (LESSONS#0057).
  const { data: teamCoach } = await admin
    .from('team_coaches')
    .select('coach_id')
    .eq('team_id', teamId)
    .eq('coach_id', user.id)
    .maybeSingle();
  if (!teamCoach) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 3) team display (for the team-name label on the card).
  const { data: team } = await admin
    .from('teams')
    .select('id, name')
    .eq('id', teamId)
    .single();
  const teamName = (team as { name?: string } | null)?.name || 'the team';

  // 4) cache lookup at the MOST RECENT bucket. The OG route does NOT call
  //    callAI — if there is no cache row, render a 404 and let the UI fall
  //    back to the inline page.
  const { data: cacheRow } = await admin
    .from('player_trajectories')
    .select('id, player_id, observation_count_bucket, started, now, turning_points')
    .eq('player_id', playerId)
    .order('observation_count_bucket', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!cacheRow) {
    return NextResponse.json({ error: 'No cached trajectory' }, { status: 404 });
  }

  const started = (cacheRow as { started: { headline: string; sentence: string } }).started;
  const now = (cacheRow as { now: { headline: string; sentence: string } }).now;
  const bucket = (cacheRow as { observation_count_bucket: number }).observation_count_bucket;
  // The bucket is observation-count-based; surface it as a quiet footnote on
  // the card (the coach can read "9 observations" without seeing the count
  // arithmetic).
  const bucketLabel = `${observationBucket(bucket)} observations`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#09090b',
          color: '#fafafa',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '64px 80px',
          position: 'relative',
        }}
      >
        {/* Accent stripe */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: 6,
            background: 'linear-gradient(180deg, #F97316 0%, #C2410C 100%)',
            display: 'flex',
          }}
        />

        {/* Header: wordmark + team name */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '0.2em', color: '#fafafa' }}>
            SportsIQ
          </span>
          <span style={{ fontSize: 16, color: '#a1a1aa' }}>{teamName}</span>
        </div>

        {/* Headline */}
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 28 }}>
          <span style={{ fontSize: 56, fontWeight: 700, color: '#fafafa', letterSpacing: '-0.02em' }}>
            {playerFirstName}&apos;s growth
          </span>
          <span style={{ fontSize: 20, color: '#a1a1aa', marginTop: 8 }}>{bucketLabel}</span>
        </div>

        {/* Two columns: started / now */}
        <div style={{ display: 'flex', flex: 1, gap: 40, marginTop: 36 }}>
          <div style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: 12 }}>
            <span style={{ fontSize: 14, color: '#71717a', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
              Where {playerFirstName} started
            </span>
            <span style={{ fontSize: 28, color: '#fafafa', lineHeight: 1.3 }}>
              {started.sentence}
            </span>
          </div>
          <div style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: 12 }}>
            <span style={{ fontSize: 14, color: '#F97316', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
              Where {playerFirstName} is now
            </span>
            <span style={{ fontSize: 28, color: '#fafafa', lineHeight: 1.3 }}>
              {now.sentence}
            </span>
          </div>
        </div>

        {/* Footer attribution */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            paddingTop: 16,
            fontSize: 14,
            color: '#71717a',
          }}
        >
          <span>Made with SportsIQ</span>
          <span>youthsportsiq.com</span>
        </div>
      </div>
    ),
    SIZE,
  );
}

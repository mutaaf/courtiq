import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { currentIsoWeek, generateShareToken } from '@/lib/weekly-pulse-utils';

// POST /api/weekly-pulse/create — turn the caller's current ISO week of
// observations + sessions on ONE of their teams into a public token (ticket
// 0057). The public page at /week/<token> renders an aggregate "what we are
// working on this week" card the coach drops in the league group chat. Free
// for every tier — gating a viral surface inverts the loop (ticket decision).
//
// This route is AUTHENTICATED — it is NOT in publicPaths (only the public
// GET /api/weekly-pulse/<token> is). It self-enforces auth below so even
// the publicPaths blanket prefix never bypasses the 401.
//
// Idempotency: a second POST for the same (coach_id, team_id, iso_week) reuses
// the existing active row (mirrors the 0049 publish-twice path). The
// migration's UNIQUE (coach_id, team_id, iso_week) constraint is the
// defense-in-depth guard.
//
// Optional `caption` updates an existing row in place when the publisher taps
// "Edit caption" in the sheet on /home — the existing token stays stable so a
// caption tweak never invalidates a link the coach already pasted.
export async function POST(request: Request) {
  // Server supabase only for the auth check.
  const authSupabase = await createServerSupabase();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { teamId, isoWeek, caption } = body as {
    teamId?: string;
    isoWeek?: string;
    caption?: string;
  };
  if (!teamId) {
    return NextResponse.json({ error: 'teamId required' }, { status: 400 });
  }

  // Default isoWeek to the current ISO week if omitted (the home-card sheet
  // never sends it; an explicit value is accepted for back-dated shares).
  const targetIsoWeek =
    typeof isoWeek === 'string' && /^\d{4}-W\d{2}$/.test(isoWeek)
      ? isoWeek
      : currentIsoWeek();

  // Trim + length-bound the caption so the public page stays readable; null
  // when omitted or empty so a missing caption never renders an empty quote.
  const trimmedCaption =
    typeof caption === 'string' && caption.trim().length > 0
      ? caption.trim().slice(0, 280)
      : null;

  // Service role for all DB operations (bypasses RLS).
  const supabase = await createServiceSupabase();

  try {
    // Verify the team belongs to the caller. The coach-to-team relationship
    // lives on the `team_coaches` join table (NOT a `teams.coach_id` column —
    // teams has no such column; LESSONS#0039 / #0051 family: schema wins
    // over prose). A foreign team simply returns null → 404, no cross-coach
    // leakage.
    const { data: teamCoach } = await supabase
      .from('team_coaches')
      .select('coach_id')
      .eq('team_id', teamId)
      .eq('coach_id', user.id)
      .maybeSingle();

    if (!teamCoach) {
      return NextResponse.json(
        { error: 'Team not found for this coach' },
        { status: 404 },
      );
    }

    const { data: team } = await supabase
      .from('teams')
      .select('id, name')
      .eq('id', teamId)
      .single();

    if (!team) {
      return NextResponse.json(
        { error: 'Team not found' },
        { status: 404 },
      );
    }

    // Idempotency: a re-publish for the same (coach, team, week) reuses the
    // existing active row's token. When the caller supplied a NEW caption,
    // update the existing row in place rather than minting a new row.
    const { data: existing } = await supabase
      .from('weekly_pulse_shares')
      .select('id, token, coach_id, team_id, iso_week, caption, is_active')
      .eq('coach_id', user.id)
      .eq('team_id', team.id)
      .eq('iso_week', targetIsoWeek)
      .eq('is_active', true)
      .single();

    if (existing && existing.token) {
      // If the caller passed a caption that differs from the stored one,
      // update it in place — keep the token stable.
      if (trimmedCaption !== null && trimmedCaption !== existing.caption) {
        await supabase
          .from('weekly_pulse_shares')
          .update({ caption: trimmedCaption })
          .eq('id', existing.id);
      }
      return NextResponse.json({
        share: { ...existing, caption: trimmedCaption ?? existing.caption ?? null },
        token: existing.token,
        url: `/week/${existing.token}`,
      });
    }

    const token = generateShareToken();

    const { data: share, error } = await supabase
      .from('weekly_pulse_shares')
      .insert({
        token,
        coach_id: user.id,
        team_id: team.id,
        iso_week: targetIsoWeek,
        caption: trimmedCaption,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      share,
      token,
      url: `/week/${token}`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Weekly pulse share create error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

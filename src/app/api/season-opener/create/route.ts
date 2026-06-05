import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { containsBannedWord } from '@/lib/player-trajectory-utils';

// POST /api/season-opener/create — turn ONE team-and-season into a public,
// no-auth parent-facing intro card (ticket 0068).
//
// This route is AUTHENTICATED — it is NOT in publicPaths (only
// /api/season-opener/<token> is public). It self-enforces auth below
// (same posture as /api/sub-handoff/create, /api/practice-plan-shares/create,
// /api/drill-shares/create).
//
// Free for every tier — the first-touch parent surface is a moat primitive
// (every parent on every team is structurally exposed to SportsIQ on day 1
// of the season); gating it would invert the moat. This route DOES NOT
// import @/lib/tier.
//
// Idempotency: a second invocation on the same (team_id, season_label)
// UPDATES the existing row with the new focus_line + a fresh token, so
// the coach can refresh a stale link in one tap without piling up dead
// rows for the same team's same season.
//
// Head-coach check: scoped via `team_coaches` (LESSONS#0057 — never
// `teams.coach_id`, that column does not exist).
export async function POST(request: Request) {
  // Server supabase only for the auth check.
  const authSupabase = await createServerSupabase();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { teamId, focusLine } = body as {
    teamId?: string;
    focusLine?: unknown;
  };

  if (!teamId) {
    return NextResponse.json({ error: 'teamId required' }, { status: 400 });
  }

  // Length + content validation BEFORE any DB work.
  // The focus line is 1..80 chars, voice-clean per LESSONS#0023 (the prompt
  // / placeholder instructs positively; the structural guarantee is the
  // scan here on submit).
  if (typeof focusLine !== 'string') {
    return NextResponse.json({ error: 'focusLine required' }, { status: 400 });
  }
  const trimmedFocus = focusLine.trim();
  if (trimmedFocus.length === 0 || trimmedFocus.length > 80) {
    return NextResponse.json({ error: 'focusLine length 1..80' }, { status: 400 });
  }
  if (containsBannedWord(trimmedFocus)) {
    return NextResponse.json(
      {
        reason: 'voice',
        field: 'focusLine',
        hint:
          'write it like a text to a friend — keep it short and concrete',
      },
      { status: 400 },
    );
  }

  // Service role for all DB operations (bypasses RLS).
  const supabase = await createServiceSupabase();

  try {
    // Resolve the team. The `.select()` is an explicit allow-list — never
    // a `*` — so a future schema widening on `teams` does not quietly leak.
    // We read `season` (the optional human-readable season label) and
    // `created_at` so we can derive a "Season <YYYY>" fallback when the
    // coach left the optional season field blank during onboarding.
    const { data: team } = await supabase
      .from('teams')
      .select('id, name, age_group, season, sport_id, created_at')
      .eq('id', teamId)
      .single();

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Head-coach check via team_coaches (LESSONS#0057). Accept any role on
    // the team — head_coach, coach, assistant — every role gets a season
    // opener for the team they coach.
    const { data: teamCoach } = await supabase
      .from('team_coaches')
      .select('coach_id')
      .eq('team_id', team.id)
      .eq('coach_id', user.id)
      .single();

    if (!teamCoach) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Derive the season label. Prefer the team's own `season` text; fall
    // back to "Season YYYY" from the team's created_at year. The fallback
    // is deterministic and never empty — the column is NOT NULL.
    const seasonLabel = deriveSeasonLabel(team.season, team.created_at);

    // Same token shape as /api/practice-plan-shares/create,
    // /api/drill-shares/create — 16 bytes hex (LESSONS#0096 — read the
    // existing pattern at pickup, don't re-invent).
    const newToken = randomBytes(16).toString('hex');

    // Idempotency on (team_id, season_label): if a row already exists,
    // UPDATE it (rolling the focus_line + the token); if not, INSERT.
    // Two roundtrips kept clear so the test can sequence
    // mockReturnValueOnce chains predictably.
    const { data: existing } = await supabase
      .from('season_opener_shares')
      .select('id, team_id, coach_id, token, season_label, focus_line, created_at')
      .eq('team_id', team.id)
      .eq('season_label', seasonLabel)
      .single();

    let row;
    if (existing) {
      const { data: updated, error: updateErr } = await supabase
        .from('season_opener_shares')
        .update({
          token: newToken,
          focus_line: trimmedFocus,
          coach_id: user.id,
        })
        .eq('id', existing.id)
        .select()
        .single();
      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }
      row = updated;
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from('season_opener_shares')
        .insert({
          team_id: team.id,
          coach_id: user.id,
          token: newToken,
          season_label: seasonLabel,
          focus_line: trimmedFocus,
        })
        .select()
        .single();
      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }
      row = inserted;
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || request.headers.get('origin') || '';
    const url = `${appUrl}/opener/${newToken}`;

    return NextResponse.json({
      token: newToken,
      url,
      share: row,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Season-opener create error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Derive the season label. Prefer `teams.season` text; fall back to
// "Season YYYY" from the team's created_at year. Exported only for tests
// (kept private here — the route is the single caller).
function deriveSeasonLabel(
  rawSeason: string | null | undefined,
  createdAt: string | null | undefined,
): string {
  const cleaned = typeof rawSeason === 'string' ? rawSeason.trim() : '';
  if (cleaned.length > 0) return cleaned;
  const year =
    typeof createdAt === 'string' && createdAt.length >= 4
      ? createdAt.slice(0, 4)
      : new Date().getUTCFullYear().toString();
  return `Season ${year}`;
}

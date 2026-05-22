import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import { makeReferralCode } from '@/lib/referral-code';

// The ONLY fields from season_summary.content_structured that are exposed on the
// public recap. This is an allow-list, not a deny-list: anything not named here —
// crucially `player_breakthroughs`, which carries `player_name` for minors —
// never reaches the public payload. (AGENTS.md COPPA / data-minimization — ticket
// 0017.) These are exactly the team-level fields enumerated in the ticket ACs.
const PUBLIC_RECAP_FIELDS = [
  'headline',
  'season_period',
  'overall_assessment',
  'team_highlights',
  'skill_progress',
  'team_challenges',
  'coaching_insights',
  'next_season_priorities',
  'closing_message',
] as const;

function pickTeamLevelFields(content: Record<string, unknown> | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!content) return out;
  for (const key of PUBLIC_RECAP_FIELDS) {
    if (content[key] !== undefined) out[key] = content[key];
  }
  return out;
}

// GET /api/season-recap/[token] — public, no auth. Resolves token → season_summary
// plan → team name + the creating coach's first name + referral code (lazily
// generated with the SAME algorithm as /api/referrals). Renders team-level fields
// only; player_breakthroughs and every per-player field are stripped.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 });
  }

  const supabase = await createServiceSupabase();

  try {
    // Resolve the active share token.
    const { data: share } = await supabase
      .from('season_recap_shares')
      .select('id, plan_id, coach_id, is_active')
      .eq('token', token)
      .eq('is_active', true)
      .single();

    if (!share) {
      return NextResponse.json({ error: 'Season recap not found or inactive' }, { status: 404 });
    }

    // Resolve the season_summary plan it points at.
    const { data: plan } = await supabase
      .from('plans')
      .select('id, team_id, coach_id, type, content_structured')
      .eq('id', share.plan_id)
      .eq('type', 'season_summary')
      .single();

    if (!plan) {
      return NextResponse.json({ error: 'Season recap not found or inactive' }, { status: 404 });
    }

    // Team name (the only team-level identifier we expose).
    const { data: team } = await supabase
      .from('teams')
      .select('name')
      .eq('id', plan.team_id)
      .single();

    // Resolve the creating coach's referral code, lazily generating + persisting
    // it the same way /api/referrals does when absent.
    const { data: coach } = await supabase
      .from('coaches')
      .select('id, full_name, preferences')
      .eq('id', share.coach_id)
      .single();

    const prefs = ((coach?.preferences as Record<string, unknown>) ?? {});
    let referralCode = (prefs.referral_code as string) ?? '';
    if (!referralCode && coach?.id) {
      referralCode = makeReferralCode(coach.id);
      await supabase
        .from('coaches')
        .update({ preferences: { ...prefs, referral_code: referralCode } })
        .eq('id', coach.id);
    }

    // Team-level recap fields ONLY — player_breakthroughs and any per-minor data
    // are stripped by the allow-list above.
    const recap = pickTeamLevelFields(
      (plan.content_structured as Record<string, unknown>) ?? null,
    );

    return NextResponse.json({
      recap,
      teamName: team?.name ?? null,
      // Coach FIRST name only — coaching attribution, not contact info.
      coachFirstName: coach?.full_name ? coach.full_name.split(' ')[0] : null,
      referralCode,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Season recap view error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

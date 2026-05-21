import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import { makeReferralCode } from '@/lib/referral-code';

// The ONLY fields from team_personality.content_structured that are exposed on
// the public card. This is an allow-list, not a deny-list: anything not named
// here (e.g. sampleObservations, which references players by first name) never
// reaches the public payload. (AGENTS.md COPPA / data-minimization — ticket 0010.)
const PUBLIC_PERSONALITY_FIELDS = [
  'team_type',
  'type_emoji',
  'tagline',
  'description',
  'traits',
  'strengths',
  'growth_areas',
  'coaching_tips',
  'team_motto',
] as const;

function pickTeamLevelFields(content: Record<string, unknown> | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!content) return out;
  for (const key of PUBLIC_PERSONALITY_FIELDS) {
    if (content[key] !== undefined) out[key] = content[key];
  }
  return out;
}

// GET /api/team-card/[token] — public, no auth. Resolves token → team_personality
// plan → team name + the creating coach's referral code (lazily generated with
// the SAME algorithm as /api/referrals). Renders team-level fields only.
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
      .from('team_card_shares')
      .select('id, plan_id, coach_id, is_active')
      .eq('token', token)
      .eq('is_active', true)
      .single();

    if (!share) {
      return NextResponse.json({ error: 'Team card not found or inactive' }, { status: 404 });
    }

    // Resolve the team_personality plan it points at.
    const { data: plan } = await supabase
      .from('plans')
      .select('id, team_id, coach_id, type, content_structured')
      .eq('id', share.plan_id)
      .eq('type', 'team_personality')
      .single();

    if (!plan) {
      return NextResponse.json({ error: 'Team card not found or inactive' }, { status: 404 });
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

    // Team-level personality fields ONLY — sampleObservations and any per-minor
    // data are stripped by the allow-list.
    const personality = pickTeamLevelFields(
      (plan.content_structured as Record<string, unknown>) ?? null,
    );

    return NextResponse.json({
      personality,
      teamName: team?.name ?? null,
      // Coach FIRST name only — coaching attribution, not contact info.
      coachFirstName: coach?.full_name ? coach.full_name.split(' ')[0] : null,
      referralCode,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Team card view error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

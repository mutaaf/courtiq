import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Public team-newsletter share API (ticket 0043).
//
// GET /api/share/team-newsletter/[token] — no auth. Resolves the public token
// to a `team_card_shares` row WHERE type='mid_season_team_newsletter' AND
// is_active=true, then to the underlying `plans` row of the SAME plan type,
// then the team name + the creating coach's first name.
//
// The share table is shared with the 0010 coach-to-coach referral cards;
// the .eq('type', 'mid_season_team_newsletter') pin on the share table AND
// the .eq('type', 'mid_season_team_newsletter') pin on the plan row guarantee
// the two share kinds can never cross.
//
// The response is the FIVE-key newsletter body verbatim (the AI schema has
// no per-player field, so there is no per-minor data to strip — the COPPA
// boundary is structural, not a runtime allow-list). The team name + coach
// first name are attribution context, no contact data.
// ---------------------------------------------------------------------------

// Strict allow-list of the keys the public surface returns from the saved
// newsletter. The AI schema is already five-keys-only, but this defends
// against any future widening of `content_structured` from leaking to the
// public page (same defense-in-depth as 0010's team-card route).
const PUBLIC_NEWSLETTER_FIELDS = [
  'headline',
  'arc_summary',
  'team_strengths',
  'focus_areas',
  'coach_voice_quote',
] as const;

function pickPublicFields(content: Record<string, unknown> | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!content) return out;
  for (const key of PUBLIC_NEWSLETTER_FIELDS) {
    if (content[key] !== undefined) out[key] = content[key];
  }
  return out;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 });
  }

  const supabase = await createServiceSupabase();

  try {
    // Resolve the active share token, scoped to the newsletter type.
    const { data: share } = await supabase
      .from('team_card_shares')
      .select('id, plan_id, coach_id, is_active, type')
      .eq('token', token)
      .eq('is_active', true)
      .eq('type', 'mid_season_team_newsletter')
      .single();

    if (!share) {
      return NextResponse.json(
        { error: 'Team newsletter not found or inactive' },
        { status: 404 },
      );
    }

    // Resolve the saved plan; pin to the matching type so even a wrong
    // share/plan pairing can never cross types.
    const { data: plan } = await supabase
      .from('plans')
      .select('id, team_id, coach_id, type, content_structured')
      .eq('id', (share as { plan_id: string }).plan_id)
      .eq('type', 'mid_season_team_newsletter')
      .single();

    if (!plan) {
      return NextResponse.json(
        { error: 'Team newsletter not found or inactive' },
        { status: 404 },
      );
    }

    // Team name (attribution context only — no minor data).
    const { data: team } = await supabase
      .from('teams')
      .select('name')
      .eq('id', (plan as { team_id: string }).team_id)
      .single();

    // Coach first name (attribution only — never email / phone / surname).
    const { data: coach } = await supabase
      .from('coaches')
      .select('full_name')
      .eq('id', (share as { coach_id: string }).coach_id)
      .single();

    const newsletter = pickPublicFields(
      (plan as { content_structured: Record<string, unknown> | null }).content_structured ?? null,
    );

    return NextResponse.json({
      newsletter,
      teamName: (team as { name?: string } | null)?.name ?? null,
      coachFirstName: (coach as { full_name?: string } | null)?.full_name
        ? (coach as { full_name: string }).full_name.split(' ')[0]
        : null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Team newsletter view error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

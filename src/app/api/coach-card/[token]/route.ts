import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import { makeReferralCode } from '@/lib/referral-code';
import { isValidHandleShape } from '@/lib/coach-handle-utils';

// The EXACT set of keys the public coach-card payload exposes. This is an
// allow-list, not a deny-list: the response object is BUILT from these keys only,
// so anything player-scoped (player names, jerseys, observation text) is
// structurally excluded — it can never be added by accident. The stats are
// aggregate integers derived from existing rows. (AGENTS.md COPPA /
// data-minimization — ticket 0026.) Mirrors PUBLIC_PERSONALITY_FIELDS in
// src/app/api/team-card/[token]/route.ts.
const PUBLIC_COACH_CARD_FIELDS = [
  'display_name',
  'sports',
  'age_groups',
  'weeks_coaching',
  'practices_logged',
  'players_observed',
  'referral_code',
] as const;

// GET /api/coach-card/[token] — public, no auth, service-role. Resolves token →
// coach → the sports/age-groups they coach (DERIVED from their teams, never a new
// field) + aggregate counts + the coach's lazily-generated referral code, so the
// public page can deep-link to /signup?ref=CODE.
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
    // ── Handle-vs-token dispatch (ticket 0054) ─────────────────────────────
    // The [token] segment is now overloaded: it accepts EITHER an opaque
    // share token (existing 0026 shape — 32-char hex by default) OR a
    // `coaches.handle` (lowercase alphanumeric + hyphens, 2–32, no
    // leading/trailing hyphen). The dispatch is "token first, handle as
    // fallback":
    //   1) Always try the existing coach_card_shares lookup by token —
    //      this preserves byte-identical behavior for every existing 0026
    //      share token (and is cheap; one indexed read).
    //   2) Only on a token miss AND if the segment matches the handle
    //      regex, fall back to a handle lookup. The handle resolves the
    //      coach, then their most-recent active coach_card_shares row;
    //      if the coach has no active card, return 404 (the handle is an
    //      alternate URL to an existing profile, never a new surface).
    let share: { id: string; coach_id: string; is_active: boolean } | null = null;

    const { data: tokenShare } = await supabase
      .from('coach_card_shares')
      .select('id, coach_id, is_active')
      .eq('token', token)
      .eq('is_active', true)
      .maybeSingle();
    share = (tokenShare ?? null) as typeof share;

    if (!share && isValidHandleShape(token)) {
      // Handle fallback. Resolve coach by handle, then their active share row.
      const { data: coachByHandle } = await supabase
        .from('coaches')
        .select('id')
        .eq('handle', token)
        .maybeSingle();

      if (coachByHandle) {
        const { data: handleShare } = await supabase
          .from('coach_card_shares')
          .select('id, coach_id, is_active')
          .eq('coach_id', coachByHandle.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        share = (handleShare ?? null) as typeof share;
      }
    }

    if (!share) {
      return NextResponse.json({ error: 'Coach card not found or inactive' }, { status: 404 });
    }

    // Resolve the coach this share points at.
    const { data: coach } = await supabase
      .from('coaches')
      .select('id, full_name, preferences, created_at')
      .eq('id', share.coach_id)
      .single();

    if (!coach) {
      return NextResponse.json({ error: 'Coach card not found or inactive' }, { status: 404 });
    }

    // ── Sports + age groups: DERIVED from the coach's teams (no new field). ──
    const { data: teamCoachRows } = await supabase
      .from('team_coaches')
      .select('team_id')
      .eq('coach_id', coach.id);

    const teamIds = (teamCoachRows ?? [])
      .map((r: { team_id: string }) => r.team_id)
      .filter(Boolean);

    let sports: string[] = [];
    let ageGroups: string[] = [];
    if (teamIds.length > 0) {
      const { data: teams } = await supabase
        .from('teams')
        .select('id, age_group, sport_id')
        .in('id', teamIds);

      const teamRows = teams ?? [];
      ageGroups = Array.from(
        new Set(
          teamRows
            .map((t: { age_group: string | null }) => t.age_group)
            .filter((a): a is string => Boolean(a)),
        ),
      );

      const sportIds = Array.from(
        new Set(
          teamRows
            .map((t: { sport_id: string | null }) => t.sport_id)
            .filter((s): s is string => Boolean(s)),
        ),
      );
      if (sportIds.length > 0) {
        const { data: sportRows } = await supabase
          .from('sports')
          .select('id, name')
          .in('id', sportIds);
        sports = Array.from(
          new Set(
            (sportRows ?? [])
              .map((s: { name: string | null }) => s.name)
              .filter((n): n is string => Boolean(n)),
          ),
        );
      }
    }

    // ── Aggregate counts (integers only, no per-row data exposed). ──
    // practices_logged: practice-type sessions the coach owns.
    const { count: practiceCount } = await supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('coach_id', coach.id)
      .eq('type', 'practice');

    // players_observed: distinct players across the coach's observations. We pull
    // player_id only and de-dupe in JS so no minor-identifying field is ever read.
    const { data: obsRows } = await supabase
      .from('observations')
      .select('player_id')
      .eq('coach_id', coach.id)
      .not('player_id', 'is', null);

    const playersObserved = new Set(
      (obsRows ?? [])
        .map((o: { player_id: string | null }) => o.player_id)
        .filter((p): p is string => Boolean(p)),
    ).size;

    // weeks_coaching: from the coach's account start to now (aggregate integer).
    let weeksCoaching = 0;
    if (coach.created_at) {
      const ms = Date.now() - new Date(coach.created_at).getTime();
      weeksCoaching = Math.max(0, Math.floor(ms / (7 * 24 * 60 * 60 * 1000)));
    }

    // Resolve the coach's referral code, lazily generating + persisting it the
    // same way /api/referrals does when absent (deterministic per coach id).
    const prefs = ((coach.preferences as Record<string, unknown>) ?? {});
    let referralCode = (prefs.referral_code as string) ?? '';
    if (!referralCode && coach.id) {
      referralCode = makeReferralCode(coach.id);
      await supabase
        .from('coaches')
        .update({ preferences: { ...prefs, referral_code: referralCode } })
        .eq('id', coach.id);
    }

    // Build the payload from the allow-list ONLY — coach-level fields + aggregate
    // integers. Nothing player-scoped can reach this object.
    const payload: Record<string, unknown> = {
      display_name: coach.full_name ?? null,
      sports,
      age_groups: ageGroups,
      weeks_coaching: weeksCoaching,
      practices_logged: practiceCount ?? 0,
      players_observed: playersObserved,
      referral_code: referralCode,
    };

    // Defensive: serialize only the allow-listed keys (so a future edit that adds
    // a stray field to `payload` still cannot leak it).
    const safe: Record<string, unknown> = {};
    for (const key of PUBLIC_COACH_CARD_FIELDS) safe[key] = payload[key];

    return NextResponse.json(safe);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Coach card view error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

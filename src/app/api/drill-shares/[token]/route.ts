import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';

// GET /api/drill-shares/[token] — public, no auth (ticket 0064).
//
// Resolves a token → its drill_shares row → the underlying drill's name +
// setup + the publishing coach's FIRST name (server-side split via
// full_name.split(' ')[0] — never a client-side splitter) + the optional
// handle the coach claimed under 0054.
//
// Three response states:
//   - 200 (is_active = true): the full payload (see allow-list below).
//   - 410 (is_active = false): "the publisher unpublished this drill" — so
//     a cloning coach who bookmarked the link sees a friendly "gone" state
//     rather than a confusing 404.
//   - 404 (no row at this token): unknown token.
//
// Payload allow-list (TOP LEVEL):
//   drill:      { id, name, setup, sportSlug, ageGroupHint }
//   caption:    string | null   — coach-typed (voice-scanned at write time)
//   publisher:  { firstName, handle | null }
//   createdAt:  ISO string
//   isActive:   boolean
//
// COPPA: this route NEVER references a player, parent, session, or team.
// The publisher's first name + handle are the only person-shaped fields,
// and both are already public (the handle is on /coach/<handle> per 0054).
// Last name, email, parent contact, and any other field are never read.
// The route's .select() calls are EXPLICIT ALLOW-LISTS per LESSONS#0036.
//
// LESSONS#0096 — drills are a real DB table; the resolution is a
// `from('drills')` lookup + a `from('sports')` join for the slug. The
// route hard-pins NO type field on drills (every row is a drill).
//
// This route is in publicPaths in src/lib/supabase/middleware.ts via the
// blanket '/api/drill-shares/' prefix; /create, /clone, /unpublish, and
// /mine each self-enforce auth in their handlers (LESSONS#0091 / #0104).
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
    // Resolve the share row. We deliberately do NOT filter by is_active
    // here — we need to distinguish unknown-token (404) from unpublished
    // (410). The route below branches on is_active.
    const { data: share } = await supabase
      .from('drill_shares')
      .select('id, coach_id, drill_id, share_token, caption, is_active, created_at')
      .eq('share_token', token)
      .maybeSingle();

    if (!share) {
      return NextResponse.json({ error: 'Drill share not found' }, { status: 404 });
    }
    if (!share.is_active) {
      return NextResponse.json(
        { error: 'This drill share was unpublished' },
        { status: 410 },
      );
    }

    // Resolve the underlying drill. EXPLICIT allow-list of FIVE columns
    // (LESSONS#0036) — no setup_video, no equipment, no creator metadata.
    const { data: drill } = await supabase
      .from('drills')
      .select('id, name, setup_instructions, sport_id, age_groups')
      .eq('id', share.drill_id)
      .single();

    if (!drill) {
      // The FK ON DELETE CASCADE keeps this from happening in practice.
      return NextResponse.json({ error: 'Drill not found' }, { status: 404 });
    }

    // Resolve the sport's slug for the public-page header hint.
    const { data: sport } = await supabase
      .from('sports')
      .select('id, slug')
      .eq('id', drill.sport_id)
      .single();

    // Resolve the publishing coach's first name + handle.
    const { data: coach } = await supabase
      .from('coaches')
      .select('id, full_name, handle')
      .eq('id', share.coach_id)
      .single();

    const firstName = coach?.full_name
      ? String(coach.full_name).split(' ')[0]
      : null;

    // ageGroupHint: the first age band the drill carries (the page only
    // surfaces the most-junior band; the full list is on the dashboard).
    const ageGroups = Array.isArray(drill.age_groups) ? drill.age_groups : [];
    const ageGroupHint = ageGroups.length > 0 ? String(ageGroups[0]) : null;

    return NextResponse.json({
      drill: {
        id: drill.id,
        name: drill.name,
        setup: drill.setup_instructions ?? null,
        sportSlug: sport?.slug ?? null,
        ageGroupHint,
      },
      caption: share.caption ?? null,
      publisher: {
        firstName,
        handle: coach?.handle ?? null,
      },
      createdAt: share.created_at,
      isActive: share.is_active,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Drill share view error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

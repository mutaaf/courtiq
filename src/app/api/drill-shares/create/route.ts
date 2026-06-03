import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { randomBytes } from 'crypto';
import { containsBannedWord } from '@/lib/player-trajectory-utils';

// POST /api/drill-shares/create — publish ONE drill as a public, no-auth
// share token a peer coach can tap to clone into their own favorites
// library (ticket 0064). The public page at /drill/[token] renders the
// drill name + setup + the publishing coach's optional caption + a one-tap
// "Save to my library" button.
//
// AUTH: self-enforces via auth.getUser() — the route is NOT a public
// surface (only the /api/drill-shares/<token> GET is public; this create
// path is the publisher-side write). Same posture as 0049's create route.
//
// IDEMPOTENCY: the table's UNIQUE(coach_id, drill_id) makes re-publish a
// no-token-mint UPDATE — a publisher who taps Publish twice on the same
// drill never ends up with two tokens. The route returns
// alreadyPublished:true on every re-tap so the UI can flip to "Edit
// caption" instead of "Publish".
//
// FREE for every tier — publishing is universal so the graph remains
// open (same posture as 0049 / 0055 / 0063). The route does NOT import
// tier.ts and does not consult canAccess().
//
// VOICE: the coach-typed caption is scanned at render time via the
// existing containsBannedWord helper from player-trajectory-utils.ts
// (LESSONS#0023 — the scan is structural, the prompt voice is positive).
// Banned words → 400 { reason:'voice', field:'caption' }. The route
// itself contains NO AGENTS.md banned token in any error message.
//
// LIMITS: caption is bounded to 240 characters to keep the public page
// readable. > 240 → 400.
//
// LESSONS#0096 — drills are a real DB table (src/app/(dashboard)/drills/),
// so drill validity is a `from('drills').select('id')` lookup, not a
// static-content resolution.
const MAX_CAPTION_LENGTH = 240;

export async function POST(request: Request) {
  // Server supabase only for the auth check.
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    drillId?: string;
    caption?: string;
  };
  const { drillId } = body;
  if (!drillId || typeof drillId !== 'string') {
    return NextResponse.json({ error: 'drillId required' }, { status: 400 });
  }

  // Caption: optional, bounded, voice-clean. Validate BEFORE any DB write.
  const rawCaption = typeof body.caption === 'string' ? body.caption.trim() : '';
  if (rawCaption.length > MAX_CAPTION_LENGTH) {
    return NextResponse.json(
      { error: 'Caption is too long', field: 'caption' },
      { status: 400 },
    );
  }
  if (rawCaption.length > 0 && containsBannedWord(rawCaption)) {
    // LESSONS#0023 — the route response speaks like a clipboard, not a
    // landing page. No enumeration of the banned tokens in the response.
    return NextResponse.json(
      { reason: 'voice', field: 'caption' },
      { status: 400 },
    );
  }
  const caption = rawCaption.length > 0 ? rawCaption : null;

  // Service role for the DB operations (bypasses RLS).
  const supabase = await createServiceSupabase();

  try {
    // 1) Validate the drill exists. LESSONS#0096 — drills are in the DB.
    const { data: drill } = await supabase
      .from('drills')
      .select('id')
      .eq('id', drillId)
      .single();
    if (!drill) {
      return NextResponse.json({ error: 'Drill not found' }, { status: 404 });
    }

    // 2) Idempotency: look up any existing share row for (coach, drill).
    // The UNIQUE(coach_id, drill_id) makes this a single-row lookup.
    const { data: existing } = await supabase
      .from('drill_shares')
      .select('id, coach_id, drill_id, share_token, caption, is_active')
      .eq('coach_id', user.id)
      .eq('drill_id', drillId)
      .maybeSingle();

    if (existing) {
      // UPDATE the caption + updated_at on the SAME row, AND flip is_active
      // back on so a re-publish after an unpublish silently resumes the
      // same token (per AC: "a re-publish of the same (coach_id, drill_id)
      // flips is_active=true on the SAME row + SAME token").
      const { data: updated } = await supabase
        .from('drill_shares')
        .update({
          caption,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('id, share_token, caption, is_active')
        .single();

      const row = updated ?? existing;
      return NextResponse.json({
        token: row.share_token,
        url: `/drill/${row.share_token}`,
        caption: row.caption,
        alreadyPublished: true,
      });
    }

    // 3) Fresh publish — mint a token + insert. Same shape as 0049's
    // randomBytes(16).toString('hex'). The token IS the public URL — it is
    // not derived from any minor data, and is opaque to crawlers.
    const shareToken = randomBytes(16).toString('hex');
    const { data: inserted, error } = await supabase
      .from('drill_shares')
      .insert({
        coach_id: user.id,
        drill_id: drillId,
        share_token: shareToken,
        caption,
        is_active: true,
      })
      .select('id, share_token, caption, is_active')
      .single();

    if (error || !inserted) {
      return NextResponse.json(
        { error: error?.message || 'Could not publish drill' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      token: inserted.share_token,
      url: `/drill/${inserted.share_token}`,
      caption: inserted.caption,
      alreadyPublished: false,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Drill share create error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

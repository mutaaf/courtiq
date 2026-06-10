import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
// Ticket 0011: resolve the creating coach's referral code so the parent portal's
// "Share with your other coach" CTA can deep-link to /signup?ref=CODE. Reuses
// the SAME deterministic helper /api/referrals uses — do not re-inline it.
import { makeReferralCode } from '@/lib/referral-code';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 });
  }

  // Use service supabase — this is a public route, no auth required
  const supabase = await createServiceSupabase();

  try {
    // Find the share record
    const { data: share } = await supabase
      .from('parent_shares')
      .select('*')
      .eq('share_token', token)
      .eq('is_active', true)
      .single();

    if (!share) {
      return NextResponse.json({ error: 'Share link not found or inactive' }, { status: 404 });
    }

    // Check expiration
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Share link has expired' }, { status: 410 });
    }

    // Check PIN if required
    const { searchParams } = new URL(request.url);
    const pin = searchParams.get('pin');
    if (share.pin && share.pin !== pin) {
      return NextResponse.json({ error: 'PIN required', pinRequired: true }, { status: 403 });
    }

    // Get player info (include parent_name for personalized greeting;
    // parent_phone used to decide whether to show the contact-collection
    // form; ticket 0072 — parent_email read here is consumed ONLY by the
    // best-effort dormant-coach reactivation detection below and NEVER
    // surfaced in the response payload; the response is BYTE-IDENTICAL
    // to today on the parent-portal render).
    const { data: player } = await supabase
      .from('players')
      .select('id, name, nickname, position, jersey_number, photo_url, parent_name, parent_phone, parent_email')
      .eq('id', share.player_id)
      .single();

    // Get team info
    const { data: team } = await supabase
      .from('teams')
      .select('name, age_group, season')
      .eq('id', share.team_id)
      .single();

    // Get coach name + certification status
    const { data: coach } = await supabase
      .from('coaches')
      .select('full_name, preferences')
      .eq('id', share.coach_id)
      .single();

    // Get org branding
    const { data: teamFull } = await supabase
      .from('teams')
      .select('org_id')
      .eq('id', share.team_id)
      .single();

    let branding = null;
    if (teamFull?.org_id) {
      const { data: b } = await supabase
        .from('org_branding')
        .select('*')
        .eq('org_id', teamFull.org_id)
        .single();
      branding = b;
    }

    // Build the report data based on what's included
    const coachPrefs: any = coach?.preferences ?? {};

    // Ticket 0011: resolve the creating coach's referral code so the parent's
    // "Share with your other coach" CTA forwards /signup?ref=CODE and the
    // sharing coach gets the referral credit. Mirror the lazy-generate-and-persist
    // pattern in /api/referrals exactly (preferences.referral_code). The whole
    // resolution is best-effort: any failure degrades to referralCode: null and
    // MUST never 500 the public portal.
    let referralCode: string | null = null;
    try {
      if (coach) {
        referralCode = (coachPrefs?.referral_code as string) || null;
        if (!referralCode) {
          const code = makeReferralCode(share.coach_id);
          await supabase
            .from('coaches')
            .update({ preferences: { ...coachPrefs, referral_code: code } })
            .eq('id', share.coach_id);
          referralCode = code;
        }
      }
    } catch (refErr) {
      // A read/write failure must not break the share button — fall back to the
      // plain app URL on the client by sending a null code.
      console.error('Referral code resolution failed (degrading to null):', refErr);
      referralCode = null;
    }

    const reportData: Record<string, any> = {
      player,
      team,
      coachName: coach?.full_name,
      isCoachCertified: !!(coachPrefs?.certified_at),
      // Coach-level referral code (or null). Carried by the viral CTA only;
      // never derived from or scoped to the player (COPPA — ticket 0011).
      referralCode,
      branding,
      customMessage: share.custom_message,
      // True when the player already has a parent phone on file; the share
      // portal uses this to hide the contact-collection form for known parents.
      hasParentContact: !!player?.parent_phone,
    };

    if (share.include_report_card) {
      const { data: reportCards } = await supabase
        .from('plans')
        .select('content_structured, created_at')
        .eq('player_id', share.player_id)
        .eq('type', 'report_card')
        .order('created_at', { ascending: false })
        .limit(1);
      reportData.reportCard = reportCards?.[0]?.content_structured || null;
    }

    if (share.include_development_card) {
      const { data: devCards } = await supabase
        .from('plans')
        .select('content_structured, created_at')
        .eq('player_id', share.player_id)
        .eq('type', 'development_card')
        .order('created_at', { ascending: false })
        .limit(1);
      reportData.developmentCard = devCards?.[0]?.content_structured || null;
    }

    if (share.include_highlights || share.include_observations) {
      const { data: observations } = await supabase
        .from('observations')
        .select('category, sentiment, text, created_at')
        .eq('player_id', share.player_id)
        .eq('sentiment', 'positive')
        .order('created_at', { ascending: false })
        .limit(20);
      reportData.highlights = observations || [];
      // Pick the most recent positive observation as the featured highlight
      if (observations && observations.length > 0) {
        reportData.featuredHighlight = observations[0];
      }
    }

    // Always fetch total observation count + recent observation activity for the
    // "Season Stats" and "Skills on the Rise" sections on the share portal.
    // We fetch the last 90 days with category + created_at (no text) to keep
    // the payload light while still enabling monthly/weekly trend computation.
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: allRecentObs, count: totalObsCount } = await supabase
      .from('observations')
      .select('category, created_at, sentiment, session_id', { count: 'exact' })
      .eq('player_id', share.player_id)
      .gte('created_at', ninetyDaysAgo)
      .order('created_at', { ascending: false });
    reportData.totalObservationCount = totalObsCount ?? 0;
    // Include category+date+session data for skill activity and growth streak computation
    reportData.recentObservationActivity = (allRecentObs ?? []).map((o: any) => ({
      category: o.category,
      sentiment: o.sentiment,
      created_at: o.created_at,
      session_id: o.session_id ?? null,
    }));

    if (share.include_goals) {
      const { data: proficiency } = await supabase
        .from('player_skill_proficiency')
        .select('skill_id, proficiency_level, success_rate, trend, curriculum_skills(name, category)')
        .eq('player_id', share.player_id);
      // Flatten skill name from the join
      reportData.skillProgress = (proficiency || []).map((p: any) => ({
        skill_id: p.skill_id,
        proficiency_level: p.proficiency_level,
        success_rate: p.success_rate,
        trend: p.trend,
        skill_name: p.curriculum_skills?.name || p.skill_id,
        category: p.curriculum_skills?.category || null,
      }));
    }

    if (share.include_drills) {
      const { data: devCard } = await supabase
        .from('plans')
        .select('content_structured')
        .eq('player_id', share.player_id)
        .eq('type', 'development_card')
        .order('created_at', { ascending: false })
        .limit(1);
      const drills = (devCard?.[0]?.content_structured as any)?.recommended_drills || [];
      reportData.recommendedDrills = drills;
    }

    // Always fetch coach-starred (★) observations — the moments the coach
    // deliberately curated as the player's best. Shown as "Coach's Best Moments"
    // on the parent portal regardless of share settings.
    const { data: starredObs } = await supabase
      .from('observations')
      .select('category, sentiment, text, created_at')
      .eq('player_id', share.player_id)
      .eq('is_highlighted', true)
      .order('created_at', { ascending: false })
      .limit(5);
    reportData.starredObservations = starredObs ?? [];

    // Always fetch earned achievement badges — shown on the parent portal
    // regardless of share settings to celebrate the player's milestones.
    const { data: achievements } = await supabase
      .from('player_achievements')
      .select('badge_type, awarded_at, note')
      .eq('player_id', share.player_id)
      .order('awarded_at', { ascending: true });
    reportData.achievements = (achievements ?? []).map((a: any) => ({
      badge_type: a.badge_type,
      awarded_at: a.awarded_at,
      note: a.note ?? null,
    }));

    // Most recent AI-generated session message for this player.
    // player_messages plans are team-level; we match by player name.
    let latestSessionMessage = null;
    if (player?.name) {
      const { data: msgPlans } = await supabase
        .from('plans')
        .select('content_structured, created_at')
        .eq('team_id', share.team_id)
        .eq('type', 'player_messages')
        .order('created_at', { ascending: false })
        .limit(5);

      if (msgPlans && msgPlans.length > 0) {
        const playerNameLower = player.name.toLowerCase().trim();
        const playerFirstName = player.name.split(' ')[0].toLowerCase().trim();
        for (const plan of msgPlans) {
          const content = plan.content_structured as any;
          const match = (content?.messages ?? []).find((m: any) => {
            const msgName = (m.player_name || '').toLowerCase().trim();
            return (
              msgName === playerNameLower ||
              msgName === playerFirstName ||
              msgName.startsWith(playerFirstName + ' ')
            );
          });
          if (match) {
            latestSessionMessage = {
              message: match.message,
              highlight: match.highlight,
              next_focus: match.next_focus,
              session_label: content.session_label || '',
            };
            break;
          }
        }
      }
    }
    reportData.latestSessionMessage = latestSessionMessage;

    // Most recent AI-generated skill challenge for this player — shown as
    // "Practice at Home" on the parent portal so parents have actionable
    // home-practice steps without the coach having to do anything extra.
    const { data: skillChallengePlans } = await supabase
      .from('plans')
      .select('content_structured, created_at')
      .eq('player_id', share.player_id)
      .eq('type', 'skill_challenge')
      .order('created_at', { ascending: false })
      .limit(1);
    reportData.skillChallenge = skillChallengePlans?.[0]?.content_structured || null;

    // Player of the Week / Player of the Match spotlight — the most recent
    // celebratory artifact for THIS player (ticket 0009). Scoped to the share's
    // player_id so a sibling player's spotlight never leaks. weekly_star and
    // player_of_match share the same "type IN (...)" lane; most recent wins.
    const { data: spotlightPlans } = await supabase
      .from('plans')
      .select('content_structured, created_at, type')
      .eq('player_id', share.player_id)
      .in('type', ['weekly_star', 'player_of_match'])
      .order('created_at', { ascending: false })
      .limit(1);
    reportData.playerSpotlight = spotlightPlans?.[0]?.content_structured ?? null;

    // Player development goals — active and achieved goals give parents concrete
    // targets to celebrate and encourage at home. Archived/stalled goals are hidden.
    const { data: playerGoals } = await supabase
      .from('player_goals')
      .select('id, skill, goal_text, target_level, target_date, status')
      .eq('player_id', share.player_id)
      .in('status', ['active', 'achieved'])
      .order('status', { ascending: true }) // achieved first
      .order('created_at', { ascending: false });
    reportData.playerGoals = (playerGoals ?? []).map((g: any) => ({
      id: g.id,
      skill: g.skill,
      goal_text: g.goal_text,
      target_level: g.target_level ?? null,
      target_date: g.target_date ?? null,
      status: g.status,
    }));

    // Active team announcements (visible to parents)
    const now = new Date().toISOString();
    const { data: announcements } = await supabase
      .from('team_announcements')
      .select('id, title, body, expires_at, created_at')
      .eq('team_id', share.team_id)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('created_at', { ascending: false });
    reportData.announcements = announcements ?? [];

    // Upcoming sessions — show parents when the next practice/game is so
    // they stop texting the coach "when is practice?". Fetch next 14 days, max 3.
    const todayDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const twoWeeksDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data: upcomingSessions } = await supabase
      .from('sessions')
      .select('id, type, date, start_time, location, opponent')
      .eq('team_id', share.team_id)
      .gte('date', todayDate)
      .lte('date', twoWeeksDate)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(3);
    reportData.upcomingSessions = (upcomingSessions ?? []).map((s: any) => ({
      id: s.id,
      type: s.type,
      date: s.date,
      start_time: s.start_time ?? null,
      location: s.location ?? null,
      opponent: s.opponent ?? null,
    }));

    // ─── Ticket 0072 — dormant-coach reactivation detection ───────────────
    // Best-effort, never blocks the render. When the parent on THIS portal
    // is also the parent on a prior player on a DIFFERENT team whose head
    // coach is dormant (>= 30 days since last_active_at), upsert a row into
    // `coach_reactivation_signals` so the dormant coach's /home surface and
    // the 0042 cron extension can pull them back by name.
    //
    // The response payload is BYTE-IDENTICAL — no new field on reportData,
    // no UI change for the parent (the surface is COMPLETELY INVISIBLE to
    // the parent per the ticket's COPPA contract). The parent email lives
    // only in the helper's local scope; we persist the SHA-256 hash.
    //
    // Per LESSONS#0036 — try/catch swallows any failure; the parent's
    // page render NEVER waits on this detection succeeding.
    try {
      const parentEmail = (player as { parent_email?: string | null } | null)?.parent_email ?? null;
      if (parentEmail) {
        // Find every other-team active player carrying this parent email
        // (case-insensitive). LESSONS#0036 allow-list: only the four
        // columns the helper needs — NEVER reads DOB / medical_notes /
        // parent_phone on the prior-player row.
        const { data: priorPlayers } = await supabase
          .from('players')
          .select('id, name, team_id, parent_email')
          .ilike('parent_email', parentEmail)
          .neq('team_id', share.team_id)
          .eq('is_active', true);

        const priorTeamIds = Array.from(
          new Set((priorPlayers ?? []).map((p) => p.team_id)),
        );
        if (priorTeamIds.length > 0) {
          // Resolve the prior team's head coach via team_coaches (per
          // LESSONS#0057 — teams.coach_id does not exist).
          const { data: headCoachJoins } = await supabase
            .from('team_coaches')
            .select('team_id, coach_id, role')
            .in('team_id', priorTeamIds)
            .eq('role', 'head_coach');

          const headCoachByTeam = new Map<string, string>();
          for (const j of (headCoachJoins ?? []) as Array<{
            team_id: string;
            coach_id: string;
            role: string;
          }>) {
            if (!headCoachByTeam.has(j.team_id)) headCoachByTeam.set(j.team_id, j.coach_id);
          }

          const coachIds = Array.from(new Set(headCoachByTeam.values()));
          if (coachIds.length > 0) {
            // Load coach freshness — `last_active_at` is the 0042 family
            // freshness column (schema wins over the ticket's
            // `updated_at` shorthand per LESSONS#0096).
            const { data: coachRows } = await supabase
              .from('coaches')
              .select('id, last_active_at')
              .in('id', coachIds);

            const { findDormantCoachesForReturningParent } = await import(
              '@/lib/coach-reactivation-utils'
            );
            const candidates = findDormantCoachesForReturningParent({
              parentEmail,
              currentTeamId: share.team_id,
              coachRows: (coachRows ?? []) as Array<{
                id: string;
                last_active_at: string | null;
              }>,
              priorPlayerRows: (priorPlayers ?? []).map((p) => ({
                id: p.id as string,
                team_id: p.team_id as string,
                parent_email: (p.parent_email as string | null) ?? null,
                first_name: ((p.name as string) || '').split(' ')[0],
                team_coach_id: headCoachByTeam.get(p.team_id as string) ?? '',
              })),
              nowMs: Date.now(),
            });

            for (const candidate of candidates) {
              // UPSERT on (dormant_coach_id, prior_player_id) so a parent
              // re-visiting the same other-team portal does NOT spam a
              // new signal; a previously-consumed row stays consumed.
              await supabase
                .from('coach_reactivation_signals')
                .upsert(
                  {
                    dormant_coach_id: candidate.dormantCoachId,
                    prior_team_id: candidate.priorTeamId,
                    prior_player_id: candidate.priorPlayerId,
                    returning_parent_email_hash: candidate.parentEmailHash,
                    fired_at: new Date().toISOString(),
                  },
                  { onConflict: 'dormant_coach_id,prior_player_id', ignoreDuplicates: false },
                );
            }
          }
        }
      }
    } catch (reactErr) {
      // Best-effort: never let a reactivation-detection failure 500 the
      // parent portal. Silent no-op (LESSONS#0036).
      // eslint-disable-next-line no-console
      console.error('[ticket-0072] Reactivation-signal detection failed (best-effort):', reactErr);
    }

    // Increment view count
    await supabase
      .from('parent_shares')
      .update({
        view_count: (share.view_count || 0) + 1,
        last_viewed_at: new Date().toISOString(),
      })
      .eq('id', share.id);

    // ─── Ticket 0079 — teamMates for the on-team parent forward ───────────
    // The new ParentForwardOnTeamButton needs first-name-only entries for
    // OTHER active players on the SAME team whose parent_email exists. The
    // sender's own kid is excluded, and the select allow-list per
    // LESSONS#0036 is the smallest possible set: id, name, parent_email
    // (the latter is used to filter and is NEVER echoed in the response).
    // Per LESSONS#0072 — spread to a new object instead of `delete`-ing
    // fields off the DB-read row.
    try {
      const { data: roster } = await supabase
        .from('players')
        .select('id, name, parent_email')
        .eq('team_id', share.team_id)
        .eq('is_active', true)
        .neq('id', share.player_id);
      reportData.teamMates = (roster ?? [])
        .filter((p: { parent_email: string | null }) => !!p.parent_email)
        .map((p: { id: string; name: string }) => ({
          player_id: p.id,
          first_name: ((p.name ?? '').trim().split(/ /)[0] || ''),
        }))
        .filter((m: { first_name: string }) => m.first_name.length > 0);
    } catch (rosterErr) {
      // Best-effort — a roster read failure must NOT 500 the public
      // portal. The card silently renders nothing when teamMates is
      // empty.
      // eslint-disable-next-line no-console
      console.error('[ticket-0079] teamMates read failed (best-effort):', rosterErr);
      reportData.teamMates = [];
    }

    // Strip the parent_email we read for the reactivation detection from
    // the response payload — the parent surface is BYTE-IDENTICAL to
    // today and never carries the email forward. We clone the player so
    // we don't mutate the upstream row reference (some callers / tests
    // hold the same object identity).
    if (reportData.player && typeof reportData.player === 'object') {
      const { parent_email: _stripped, ...playerSansEmail } = reportData.player as Record<
        string,
        unknown
      >;
      reportData.player = playerSansEmail;
    }

    return NextResponse.json(reportData);
  } catch (error: any) {
    console.error('Share view error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

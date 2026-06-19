import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { verifyDirectorId } from '@/lib/program-referral-utils';
import { verifyDirectorInviteRef } from '@/lib/director-invite-utils';

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const {
    fullName,
    referredByCode,
    org: orgSlug,
    team: teamId,
    programReferralId,
    // Ticket 0065 — coach-to-director invite claim path. The director
    // arrived via /programs?invite=director&ref=<signed> -> /signup. The
    // verified ref binds the inviting coach + team; on a valid ref AND a
    // team that is either unattached or already on the newly-claimed
    // org, the team's org_id is updated to attach it. A team attached to
    // a DIFFERENT org returns 409 reason:'team-already-attached'.
    directorInviteRef,
  } = body;
  const name = fullName || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Coach';

  const adminSupabase = await createServiceSupabase();

  // Check if coach already exists
  const { data: existing } = await adminSupabase
    .from('coaches')
    .select('id')
    .eq('id', user.id)
    .single();

  if (existing) {
    return NextResponse.json({ message: 'Already set up' });
  }

  // Program staff-invite path (ticket 0024): when signup carries a valid `org`
  // slug (the org-landing CTA deep-links to /signup?org=<slug>), attach the new
  // coach to that EXISTING organization instead of minting a fresh solo org — so
  // a director's whole staff lands in one shared program. An unknown/invalid
  // slug falls back to today's default (a new solo org); it is never an error.
  // This is independent of the `ref` referral path below — both may be present.
  let org: { id: string } | null = null;
  let joinedExistingOrg = false;
  if (orgSlug && typeof orgSlug === 'string') {
    const { data: existingOrg } = await adminSupabase
      .from('organizations')
      .select('id')
      .eq('slug', orgSlug)
      .single();
    if (existingOrg?.id) {
      org = { id: existingOrg.id };
      joinedExistingOrg = true;
    }
  }

  // Default path: no (valid) org slug → create the coach's own organization.
  if (!org) {
    const { data: newOrg, error: orgError } = await adminSupabase
      .from('organizations')
      .insert({
        name: `${name}'s Organization`,
        slug: name.toLowerCase().replace(/[^\w-]/g, '-').replace(/-+/g, '-') + '-' + Date.now().toString(36),
      })
      .select()
      .single();

    if (orgError || !newOrg) {
      return NextResponse.json({ error: 'Failed to create organization' }, { status: 500 });
    }
    org = { id: newOrg.id };
  }

  // Create coach (store referral source in preferences if present)
  const initialPrefs: Record<string, string> = {};
  if (referredByCode && typeof referredByCode === 'string') {
    initialPrefs.referred_by_code = referredByCode.toUpperCase().slice(0, 10);
  }

  // A coach minting their own org is its admin; a coach joining an existing
  // program via the staff invite (ticket 0024) joins as a regular coach —
  // promoting to admin / assigning teams stays a separate director action.
  const { error: coachError } = await adminSupabase.from('coaches').insert({
    id: user.id,
    org_id: org.id,
    full_name: name,
    email: user.email!,
    role: joinedExistingOrg ? 'coach' : 'admin',
    avatar_url: user.user_metadata?.avatar_url,
    preferences: initialPrefs,
  });

  if (coachError) {
    return NextResponse.json({ error: 'Failed to create coach record' }, { status: 500 });
  }

  // ── Ticket 0090 — program drill canon inheritance edge ─────────────────
  //
  // When the new coach joined an EXISTING program (the 0024 staff-invite
  // path) AND that program is on the live Org-tier AND it has published
  // a `program_drill_canon`, we silently inherit the canon's drill_ids
  // into the new coach's `coach_drill_signals` (the existing 0039 cross-
  // team thumb persistence). This is the smallest write that makes the
  // next /plans render carry the program's institutional drills for the
  // new coach on day one.
  //
  // Additive — for any non-Org-tier program (or an Org-tier program with
  // no canon yet) the existing onboarding flow is BYTE-IDENTICAL. The
  // canon read uses a narrow allow-list (id, drill_ids only); no
  // player / parent / observation data is touched (COPPA boundary).
  //
  // The inheritance write uses `upsert` with `ignoreDuplicates: true` so
  // a re-run (or a coach who somehow already has a row for one of the
  // canon's drill_ids) never crashes on the (coach_id, drill_id) PK
  // (LESSONS#0072 — never mutate a DB-read row; the upsert respects
  // existing thumb state).
  if (joinedExistingOrg) {
    try {
      const { data: orgGateRow } = await adminSupabase
        .from('organizations')
        .select('id, tier, subscription_status')
        .eq('id', org.id)
        .maybeSingle();
      const orgTier = (orgGateRow as { tier?: string | null } | null)?.tier ?? 'free';
      const orgSubStatus =
        (orgGateRow as { subscription_status?: string | null } | null)?.subscription_status ?? 'none';
      const PAID_GRACE = new Set(['active', 'past_due', 'trialing']);
      if (orgTier === 'organization' && PAID_GRACE.has(orgSubStatus)) {
        const { data: canonRowsRaw } = await adminSupabase
          .from('program_drill_canon')
          .select('id, drill_ids')
          .eq('org_id', org.id)
          .is('superseded_at', null)
          .order('published_at', { ascending: false })
          .limit(1);
        const canonRows = (canonRowsRaw ?? []) as Array<{
          id: string;
          drill_ids: string[];
        }>;
        const activeCanon = canonRows[0];
        if (activeCanon && Array.isArray(activeCanon.drill_ids) && activeCanon.drill_ids.length > 0) {
          const nowIso = new Date().toISOString();
          const rows = activeCanon.drill_ids
            .filter((id): id is string => typeof id === 'string')
            .map((drillId) => ({
              coach_id: user.id,
              drill_id: drillId,
              rating: 'up',
              run_count: 0,
              last_rated_at: nowIso,
            }));
          if (rows.length > 0) {
            await adminSupabase
              .from('coach_drill_signals')
              .upsert(rows, { onConflict: 'coach_id,drill_id', ignoreDuplicates: true });
          }
        }
      }
    } catch (err) {
      // Best-effort — the inheritance is silent and never blocks
      // onboarding. The coach can still thumb drills the normal way
      // and the program's director can re-publish if needed.
      console.error('[auth/setup] program_drill_canon inheritance failed (ignored):', err);
    }
  }

  // Per-team claim path (ticket 0033): the org-landing per-team CTA deep-links to
  // /signup?org=<slug>&team=<teamId>, so a cold-inbound coach lands associated
  // with the EXACT team they coach. We only honor `team` when it BELONGS to the
  // resolved org — the team's org_id is read server-side and compared, so a
  // foreign teamId cannot be claimed by passing it on the URL. An unknown or
  // foreign team is silently IGNORED (org-only attachment, never an error). This
  // is independent of the `ref` and bare `org` paths above — all three may
  // co-occur. The roster the coach then sees is governed by existing team /
  // membership permissions; nothing is widened here (out-of-scope per the ticket).
  if (teamId && typeof teamId === 'string') {
    const { data: team } = await adminSupabase
      .from('teams')
      .select('id, org_id')
      .eq('id', teamId)
      .single();

    if (team?.id && team.org_id === org.id) {
      // Associate as a regular coach; head-coach assignment stays a director action.
      await adminSupabase.from('team_coaches').insert({
        team_id: team.id,
        coach_id: user.id,
        role: 'coach',
      });
    }
  }

  // Program-referral claim attribution (ticket 0050). When the new coach
  // arrived via /share/<token>?pr=<signed_director_id> -> /org/<slug> ->
  // /signup, we verify the HMAC server-side here (NEVER trust the client-
  // supplied value, LESSONS#0039), look up the corresponding row by
  // (share_token, director_email_hash), and stamp claimed_at + claimed_org_id.
  // A bad/forged/missing programReferralId is silently ignored — the rest of
  // the signup already succeeded; never block onboarding on a referral stamp.
  if (programReferralId && typeof programReferralId === 'string') {
    try {
      const secret = process.env.CRON_SECRET || '';
      if (secret) {
        const v = verifyDirectorId(programReferralId, secret);
        if (v.ok) {
          // Stamp only the most recent UNclaimed row for this (share_token,
          // director_email_hash). A re-claim attempt with a stale id against
          // a row that already has claimed_at gets the same UPDATE filtered
          // out (claimed_at is null) and never silently re-attributes a
          // different org — same posture as the 0042 pause-token single-use
          // convention.
          await adminSupabase
            .from('program_referrals')
            .update({
              claimed_at: new Date().toISOString(),
              claimed_org_id: org.id,
            })
            .eq('share_token', v.shareToken)
            .eq('director_email_hash', v.directorEmailHash)
            .is('claimed_at', null);
        }
      }
    } catch (err) {
      console.error('[auth/setup] program_referral stamp failed (ignored):', err);
    }
  }

  // Ticket 0065 — coach-to-director invite claim attribution. When the
  // director arrived through /programs?invite=director&ref=<signed>, we
  // verify the HMAC server-side (NEVER trust a client-supplied id;
  // LESSONS#0039), and if valid, attach the inviting coach's team to the
  // newly-claimed org by updating the team's org_id. A team already on a
  // DIFFERENT org returns 409 — the existing /programs page handles it
  // quietly (LESSONS#0036). A bad / forged / expired / missing ref is
  // silently ignored — the rest of the signup already succeeded; never
  // block onboarding on an attribution stamp. The team's `org_id` is the
  // attachment shape because `team_coaches` + `coaches.org_id` already
  // resolve org context from the team row (LESSONS#0096 — schema wins
  // over prose).
  if (directorInviteRef && typeof directorInviteRef === 'string') {
    try {
      const secret = process.env.CRON_SECRET || '';
      if (secret) {
        const v = verifyDirectorInviteRef(directorInviteRef, secret);
        if (v.ok) {
          const { data: invitingTeam } = await adminSupabase
            .from('teams')
            .select('id, org_id')
            .eq('id', v.payload.teamId)
            .single();
          if (invitingTeam) {
            if (invitingTeam.org_id && invitingTeam.org_id !== org.id) {
              // Already on a different program — quiet 409 per the AC.
              return NextResponse.json(
                { reason: 'team-already-attached' },
                { status: 409 },
              );
            }
            if (!invitingTeam.org_id) {
              await adminSupabase
                .from('teams')
                .update({ org_id: org.id })
                .eq('id', invitingTeam.id);
            }
          }
        }
      }
    } catch (err) {
      console.error('[auth/setup] director-invite-ref attach failed (ignored):', err);
    }
  }

  return NextResponse.json({ success: true, orgId: org.id });
}

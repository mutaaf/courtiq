import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import { weeklyStarSchema, type WeeklyStar } from '@/lib/ai/schemas';
import { handleAIError } from '@/lib/ai/error';
import {
  groupObsByPlayer,
  selectWeeklyStarCandidate,
  filterPositiveObs,
  getWeekLabel,
} from '@/lib/player-spotlight-utils';
import { sendEmail } from '@/lib/email';
import { weeklyStarParentEmail } from '@/lib/email/templates';
import { randomBytes } from 'crypto';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.youthsportsiq.com';

// ─── POST /api/ai/weekly-star ─────────────────────────────────────────────────
// Analyzes the last 7 days of observations for the team, picks the standout
// player by score (positive obs density × category breadth × consistency), then
// calls AI to write a celebratory spotlight.  Saves as plan type `weekly_star`.

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();
  const body = await request.json();
  const { teamId } = body;

  if (!teamId) {
    return NextResponse.json({ error: 'teamId required' }, { status: 400 });
  }

  try {
    const { data: coach } = await admin
      .from('coaches')
      .select('org_id')
      .eq('id', user.id)
      .single();

    // Fetch last 7 days of observations with player name
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: obsRows } = await admin
      .from('observations')
      .select('id, player_id, category, sentiment, text, created_at, players:player_id(name)')
      .eq('team_id', teamId)
      .gte('created_at', since)
      .not('player_id', 'is', null)
      .order('created_at', { ascending: true });

    const allObs = (obsRows ?? []).map((o: any) => ({
      player_id: o.player_id as string,
      player_name: (o.players as any)?.name ?? 'Unknown',
      sentiment: o.sentiment as 'positive' | 'needs-work' | 'neutral',
      category: o.category as string,
      text: o.text as string,
      created_at: o.created_at as string,
    }));

    if (allObs.length < 4) {
      return NextResponse.json(
        { error: 'Not enough observations this week to pick a standout player. Record a few more sessions first!' },
        { status: 422 }
      );
    }

    const grouped = groupObsByPlayer(allObs);
    const candidate = selectWeeklyStarCandidate(grouped);

    if (!candidate) {
      return NextResponse.json(
        { error: 'No player has enough observations this week. Keep recording and try again!' },
        { status: 422 }
      );
    }

    const positiveObs = filterPositiveObs(candidate.obs);
    if (positiveObs.length === 0) {
      return NextResponse.json(
        { error: 'The top candidate has no positive observations this week. Add some encouraging notes first!' },
        { status: 422 }
      );
    }

    const context = await buildAIContext(teamId, admin);
    const weekLabel = getWeekLabel();

    const prompt = PROMPT_REGISTRY.playerWeeklyStar({
      ...context,
      playerName: candidate.player_name,
      weekLabel,
      positiveObservations: positiveObs.map((o) => ({ category: o.category, text: o.text })),
      totalObsCount: candidate.obs.length,
    });

    const result = await callAIWithJSON<WeeklyStar>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'custom',
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        orgId: coach?.org_id || '',
        maxTokens: 600,
        temperature: 0.7,
      },
      admin
    );

    let validated: WeeklyStar;
    try {
      validated = weeklyStarSchema.parse(result.parsed);
    } catch (zodError) {
      console.warn('Weekly star Zod validation relaxed:', zodError);
      validated = result.parsed as WeeklyStar;
    }

    // Ensure week_label matches server-computed value
    validated.week_label = weekLabel;

    const { data: plan } = await admin
      .from('plans')
      .insert({
        team_id: teamId,
        coach_id: user.id,
        ai_interaction_id: result.interactionId,
        type: 'weekly_star',
        title: `Weekly Star — ${candidate.player_name} (${weekLabel})`,
        content: JSON.stringify(validated),
        content_structured: validated,
        curriculum_week: context.seasonWeek,
      })
      .select()
      .single();

    // ── Auto-notify parent if the spotlighted player has an email ────────
    let emailSent = false;
    let parentEmailMasked: string | null = null;

    try {
      const { data: player } = await admin
        .from('players')
        .select('parent_email, parent_name')
        .eq('id', candidate.player_id)
        .single();

      if (player?.parent_email) {
        // Get or create a permanent share token for this player
        let shareToken: string | null = null;
        const { data: existingShares } = await admin
          .from('parent_shares')
          .select('share_token')
          .eq('player_id', candidate.player_id)
          .eq('team_id', teamId)
          .eq('is_active', true)
          .is('expires_at', null)
          .order('created_at', { ascending: false })
          .limit(1);

        if (existingShares?.[0]?.share_token) {
          shareToken = existingShares[0].share_token;
        } else {
          const newToken = randomBytes(16).toString('hex');
          const { error: insertErr } = await admin
            .from('parent_shares')
            .insert({
              player_id: candidate.player_id,
              team_id: teamId,
              coach_id: user.id,
              share_token: newToken,
              pin: null,
              include_observations: false,
              include_development_card: true,
              include_report_card: true,
              include_highlights: true,
              include_goals: true,
              include_drills: true,
              include_coach_note: true,
              include_skill_challenges: true,
              custom_message: null,
              is_active: true,
              expires_at: null,
            });
          if (!insertErr) shareToken = newToken;
        }

        const { data: team } = await admin
          .from('teams')
          .select('name')
          .eq('id', teamId)
          .single();

        const { data: coachRow } = await admin
          .from('coaches')
          .select('full_name')
          .eq('id', user.id)
          .single();

        const shareUrl = shareToken ? `${APP_URL}/share/${shareToken}` : null;
        const { subject, html } = weeklyStarParentEmail({
          playerName: candidate.player_name,
          coachName: coachRow?.full_name ?? 'Your Coach',
          teamName: team?.name ?? 'Your Team',
          weekLabel,
          headline: validated.headline ?? `${candidate.player_name} had a standout week`,
          achievement: validated.achievement ?? '',
          shareUrl,
        });

        const sendResult = await sendEmail({ to: player.parent_email, subject, html });
        if (sendResult.success) {
          emailSent = true;
          // Mask for display: "m***@gmail.com"
          const [localPart, domain] = player.parent_email.split('@');
          parentEmailMasked = localPart.length > 1
            ? `${localPart[0]}***@${domain}`
            : `***@${domain}`;
        }
      }
    } catch (emailErr) {
      // Non-fatal — the plan was already saved successfully
      console.warn('[weekly-star] Parent email send failed:', emailErr);
    }

    return NextResponse.json({
      plan,
      star: validated,
      candidate: {
        player_id: candidate.player_id,
        player_name: candidate.player_name,
        score: candidate.score,
        obs_count: candidate.obs.length,
        positive_count: positiveObs.length,
      },
      interactionId: result.interactionId,
      emailSent,
      parentEmailMasked,
    });
  } catch (error: unknown) {
    return handleAIError(error, 'Weekly star generation');
  }
}

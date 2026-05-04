/**
 * Lifecycle + transactional email templates. Each builder returns
 * { subject, html } so callers can pipe straight into sendEmail().
 *
 * Style notes:
 *  - Subjects are short, specific, and sentence-cased (no ALL CAPS)
 *  - Body copy talks like a coach, not a corporate help-desk
 *  - One primary CTA per email, plus an optional secondary link
 *  - All HTML built with the layout helpers — never raw <h1> in here
 */

import {
  renderEmail,
  heroSection,
  paragraph,
  ctaButton,
  inlineLink,
  steps,
  statRow,
  divider,
  fineprint,
} from './layout';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://youthsportsiq.com';

export interface BuiltEmail {
  subject: string;
  html: string;
}

// ── 1. Welcome (after signup completes — coach has a team and players) ──────

export function welcomeEmail(args: { coachName: string; teamName: string }): BuiltEmail {
  const subject = `${args.coachName.split(' ')[0]}, you're in. Welcome to SportsIQ.`;
  const html = renderEmail({
    preview: 'Three things to try before your next practice.',
    body: [
      heroSection(
        `Welcome, ${args.coachName.split(' ')[0]} 👋`,
        `${args.teamName} is set up and ready. Most coaches see the magic in their first observation — let's get you there.`,
      ),
      paragraph('Here are three things that take under a minute each:'),
      steps([
        'Open the app during your next practice and tap the orange mic. Say something like "Sarah\'s footwork looked sharp on closeouts." We\'ll segment it into a real observation automatically.',
        'Generate your first practice plan from real observations — Plans tab, then "AI-Tailored Plan."',
        'When you\'re ready, share a player\'s progress card with a parent — one tap on any player profile.',
      ]),
      ctaButton('Open the dashboard', `${APP_URL}/home`),
      divider(),
      paragraph(
        `Replies go to a real person. If you hit a snag or want to swap notes, just hit reply.`,
      ),
    ].join(''),
  });
  return { subject, html };
}

// ── 2. First observation (celebratory — fires after the very first capture) ─

export function firstObservationEmail(args: {
  coachName: string;
  observationText: string;
  playerName: string | null;
}): BuiltEmail {
  const subject = `Nice — your first observation is in 🎯`;
  const html = renderEmail({
    preview: 'This is the workflow. Everything else builds on it.',
    body: [
      heroSection(
        'You just made an observation.',
        'That tiny voice note is the foundation of every report card, plan, and parent share you\'ll generate from here on out.',
      ),
      paragraph(
        `<strong>${args.playerName ? args.playerName + ' · ' : ''}</strong>"${escapeQuotes(args.observationText)}"`,
        { html: true },
      ),
      paragraph(
        'Capture 3-5 of these per practice and the AI starts spotting patterns automatically — who\'s improving, who needs attention, what the team should focus on next.',
      ),
      ctaButton('Capture another →', `${APP_URL}/capture`),
      fineprint(
        'You can edit, delete, or recategorize any observation from the player\'s profile.',
      ),
    ].join(''),
  });
  return { subject, html };
}

// ── 3. Subscription confirmed (after Stripe checkout.session.completed) ────

export function subscriptionConfirmedEmail(args: {
  coachName: string;
  tier: string;
  trialEndsAt?: string | null;
  amount: string;
  interval: 'monthly' | 'annual';
}): BuiltEmail {
  const friendlyTier = args.tier.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const subject = args.trialEndsAt
    ? `You're on the ${friendlyTier} trial. Make it count.`
    : `You're on ${friendlyTier}. Welcome aboard.`;
  const html = renderEmail({
    transactional: true,
    preview: args.trialEndsAt
      ? `Your trial runs until ${formatDate(args.trialEndsAt)}.`
      : `Your ${friendlyTier} plan is active.`,
    body: [
      heroSection(
        args.trialEndsAt ? `You're on the ${friendlyTier} trial.` : `You're on ${friendlyTier}.`,
        args.trialEndsAt
          ? `Free until ${formatDate(args.trialEndsAt)}, then ${args.amount}/${args.interval}. Cancel anytime from settings — no questions.`
          : `${args.amount}/${args.interval}, billed automatically. Cancel anytime from settings.`,
      ),
      paragraph('Pro unlocks the full SportsIQ stack:'),
      steps([
        'Unlimited AI capture, plans, parent reports, and assistant chat.',
        'Run on our managed AI keys — nothing for you to configure.',
        'Priority support if anything\'s slow or wonky.',
      ]),
      ctaButton('Open the dashboard', `${APP_URL}/home`),
      divider(),
      fineprint(
        `Manage billing or download invoices any time at ${APP_URL}/settings/upgrade.`,
      ),
    ].join(''),
  });
  return { subject, html };
}

// ── 4. Trial ending (3 days before trial_period_days expires) ──────────────

export function trialEndingEmail(args: {
  coachName: string;
  daysLeft: number;
  tier: string;
  amount: string;
  interval: 'monthly' | 'annual';
}): BuiltEmail {
  const friendlyTier = args.tier.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const subject =
    args.daysLeft <= 1
      ? `Your trial ends tomorrow — ${args.amount}/${args.interval} kicks in`
      : `${args.daysLeft} days left on your ${friendlyTier} trial`;
  const html = renderEmail({
    transactional: true,
    preview: `${args.amount}/${args.interval} starts after the trial. Cancel any time.`,
    body: [
      heroSection(
        args.daysLeft <= 1 ? 'Your trial ends tomorrow.' : `${args.daysLeft} days left on your trial.`,
        `After that, you'll be billed ${args.amount} per ${args.interval} on the ${friendlyTier} plan. Nothing to do if you want to keep going.`,
      ),
      paragraph(
        'A few coaches usually want to cancel at this point — totally fine. The button below takes you straight to billing where you can cancel in two taps.',
      ),
      ctaButton('Manage subscription', `${APP_URL}/settings/upgrade`),
      divider(),
      paragraph(
        'Otherwise, here\'s a quick stat from your data so far: keep going if your team\'s seeing value, walk if not.',
      ),
      fineprint(
        'No surprise charges. We email you a receipt the moment a card runs.',
      ),
    ].join(''),
  });
  return { subject, html };
}

// ── 5. Subscription canceled (after sub.deleted) ──────────────────────────

export function subscriptionCanceledEmail(args: {
  coachName: string;
  archivedTeamCount: number;
}): BuiltEmail {
  const subject = "You're back on the free plan — your data's safe";
  const html = renderEmail({
    transactional: true,
    preview: 'Read-only access to everything you logged. Reactivate any time.',
    body: [
      heroSection(
        "You've moved back to the free plan.",
        args.archivedTeamCount > 0
          ? `Your data is intact. ${args.archivedTeamCount} team${args.archivedTeamCount === 1 ? ' is' : 's are'} archived (read-only) until you upgrade — no observations, plans, or reports were deleted.`
          : 'Your data is intact. Capture is still free for one team and 5 AI runs a month.',
      ),
      paragraph(
        "If you canceled because something wasn't working, hit reply. We read every message, and most product fixes here started with a frustrated email.",
      ),
      ctaButton('Reactivate any time', `${APP_URL}/settings/upgrade`),
      divider(),
      fineprint(
        'Want to delete your account entirely? Reply with "delete me" and we\'ll wipe everything within 24 hours.',
      ),
    ].join(''),
  });
  return { subject, html };
}

// ── 6. Parent share notification (when coach shares a report) ─────────────

export function parentShareEmail(args: {
  parentName: string | null;
  playerName: string;
  coachName: string;
  shareUrl: string;
  customMessage?: string | null;
}): BuiltEmail {
  const subject = `${args.coachName.split(' ')[0]} shared ${args.playerName}'s progress card`;
  const html = renderEmail({
    transactional: true,
    preview: `An update on how ${args.playerName} is doing this season.`,
    body: [
      heroSection(
        `An update on ${args.playerName}`,
        `${args.coachName} put together a quick view of what ${args.playerName} has been working on this season — strengths, growth areas, and the moments worth celebrating.`,
      ),
      args.customMessage
        ? paragraph(`"${args.customMessage}" — ${args.coachName}`)
        : '',
      ctaButton(`See ${args.playerName}'s card`, args.shareUrl),
      divider(),
      paragraph(
        'No login required. The link expires in 30 days. Reply directly to this email to message the coach.',
      ),
    ].join(''),
  });
  return { subject, html };
}

// ── 7. Weekly digest (Sunday morning, paid coaches) ───────────────────────

export function weeklyDigestEmail(args: {
  coachName: string;
  teamName: string;
  weekLabel: string;
  observationCount: number;
  sessionCount: number;
  topCategory: string | null;
  topPlayer: string | null;
}): BuiltEmail {
  const subject = `${args.teamName} · ${args.weekLabel} recap`;
  const html = renderEmail({
    preview: `${args.sessionCount} session${args.sessionCount === 1 ? '' : 's'}, ${args.observationCount} observation${args.observationCount === 1 ? '' : 's'} this week.`,
    body: [
      heroSection(
        `${args.weekLabel} for ${args.teamName}`,
        'Quick read on what you logged this week. Detail in the dashboard.',
      ),
      statRow([
        { label: 'Sessions', value: String(args.sessionCount) },
        { label: 'Observations', value: String(args.observationCount) },
        { label: 'Top focus', value: args.topCategory ?? '—' },
      ]),
      args.topPlayer
        ? paragraph(`<strong>Standout this week:</strong> ${args.topPlayer}`, { html: true })
        : '',
      ctaButton('Open weekly view', `${APP_URL}/sessions`),
      divider(),
      fineprint('Generated automatically every Sunday morning.'),
    ].join(''),
  });
  return { subject, html };
}

// ── 8. Practice reminder (day-of, paid coaches) ────────────────────────────

export function practiceReminderEmail(args: {
  coachName: string;
  teamName: string;
  sessionType: string;
  startTime: string | null;
  location: string | null;
  sessionId: string;
}): BuiltEmail {
  const subject = `${args.sessionType} today${args.startTime ? ` at ${args.startTime}` : ''}`;
  const html = renderEmail({
    transactional: true,
    preview: `${args.teamName} · ${args.location || 'TBD'}`,
    body: [
      heroSection(
        `${args.sessionType} today`,
        `${args.teamName}${args.startTime ? ` · ${args.startTime}` : ''}${args.location ? ` · ${args.location}` : ''}`,
      ),
      paragraph(
        'Two-minute prep checklist:',
      ),
      steps([
        'Review last session\'s focus areas — did the team carry them over?',
        'Pick one player to spotlight today. (Players who haven\'t been observed in 2+ weeks usually have the most opportunity.)',
        'Open Capture before warmups so it\'s one tap during the session.',
      ]),
      ctaButton('Open today\'s session', `${APP_URL}/sessions/${args.sessionId}`),
    ].join(''),
  });
  return { subject, html };
}

// ── 9. Re-engagement (no captures in 14+ days) ─────────────────────────────

export function reEngagementEmail(args: { coachName: string; daysQuiet: number }): BuiltEmail {
  const subject = "Practice still happening?";
  const html = renderEmail({
    preview: 'A 30-second voice note keeps your team\'s data alive.',
    body: [
      heroSection(
        'It\'s been a minute.',
        `${args.daysQuiet} days since your last observation. If the season ended, no worries. If you're still coaching, even one voice note a week keeps the AI useful.`,
      ),
      paragraph(
        'The hardest part of any new tool is the second time you use it. Worth one quick capture before your next practice?',
      ),
      ctaButton('Open Capture', `${APP_URL}/capture`),
      divider(),
      paragraph(
        'If SportsIQ isn\'t fitting your workflow, hit reply and tell me why. Real human reads every email.',
      ),
    ].join(''),
  });
  return { subject, html };
}

// ── helpers ────────────────────────────────────────────────────────────────

function escapeQuotes(s: string): string {
  return s.replace(/"/g, '&quot;');
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

/**
 * Onboarding email drip sequence.
 *
 * Four emails spaced out after account creation:
 *   Day 1  — Welcome + first capture walkthrough
 *   Day 3  — Quick Capture tips
 *   Day 7  — Generate your first practice plan
 *   Day 14 — Share progress with parents
 *
 * Sent emails are tracked in coach.preferences.drip_sent (string[]).
 */

// ─── Sequence definition ─────────────────────────────────────────────────────

export type DripKey = 'day_1' | 'day_3' | 'day_7' | 'day_14';

export interface DripEmail {
  key: DripKey;
  /** Minimum days since account creation before this email is sent */
  afterDays: number;
  subject: string;
  buildHtml: (coachName: string) => string;
}

// Drip emails route through the unified branded layout (src/lib/email/layout.ts)
// so the SportsIQ shell, footer, and List-Unsubscribe behavior stay consistent
// across every email the app sends.
import { renderEmail, heroSection, paragraph, ctaButton, steps as stepsList } from './email/layout';

const APP_URL = 'https://youthsportsiq.com';

interface DripCopy {
  preview: string;
  title: string;
  intro: string;
  steps: string[];
  cta: { label: string; href: string };
}

function build(copy: DripCopy): string {
  return renderEmail({
    preview: copy.preview,
    body: [
      heroSection(copy.title),
      paragraph(copy.intro),
      stepsList(copy.steps),
      ctaButton(copy.cta.label, copy.cta.href),
    ].join(''),
  });
}

// ─── The four drip emails ────────────────────────────────────────────────────

export const DRIP_SEQUENCE: DripEmail[] = [
  {
    key: 'day_1',
    afterDays: 1,
    subject: 'Welcome to SportsIQ — your first capture awaits',
    buildHtml: (name) =>
      build({
        preview: 'Three steps to your first observation in under 2 minutes.',
        title: `Welcome, ${name.split(' ')[0]} 👋`,
        intro:
          "You're now part of a community of coaches using data to develop better athletes. Here's how to log your first observation — under 2 minutes:",
        steps: [
          'Tap Capture in the bottom nav and hit the microphone.',
          'Say something like "Marcus showed great footwork on the defensive rotations."',
          'SportsIQ tags the player, skill, and sentiment automatically — then saves it.',
        ],
        cta: { label: 'Make your first capture', href: `${APP_URL}/capture` },
      }),
  },
  {
    key: 'day_3',
    afterDays: 3,
    subject: 'Pro tip: Quick Capture saves you 20 minutes per session',
    buildHtml: (name) =>
      build({
        preview: 'The ⚡ icon. One tap. No exit from what you were doing.',
        title: `Hi ${name.split(' ')[0]} — here's how coaches log 3× more`,
        intro:
          'The Quick Capture button (the ⚡ icon, bottom-right of every page) lets you log observations without leaving what you\'re doing. Coaches who use it log 3× more observations per session — and the AI gets that much smarter.',
        steps: [
          'Tap ⚡ from any page — a recording sheet pops up instantly.',
          'Speak naturally. Multiple players in one breath — the AI segments them.',
          'Saves automatically. Back to coaching in seconds.',
        ],
        cta: { label: 'Try Quick Capture', href: `${APP_URL}/capture` },
      }),
  },
  {
    key: 'day_7',
    afterDays: 7,
    subject: 'Ready to generate your first AI practice plan?',
    buildHtml: (name) =>
      build({
        preview: 'A drill-by-drill plan from a week of your real observations.',
        title: `${name.split(' ')[0]}, your data is ready to work for you`,
        intro:
          'A week of observations is enough for the AI to write a real practice plan — targeting your team\'s actual growth areas, not generic drills. It identifies declining skills, persistent gaps, and pulls drills with time allocations and coaching cues.',
        steps: [
          'Open the Plans tab.',
          'Tap "AI-Tailored Plan."',
          'In 10–15 seconds you have a full session plan, ready to run.',
        ],
        cta: { label: 'Generate my first plan', href: `${APP_URL}/plans` },
      }),
  },
  {
    key: 'day_14',
    afterDays: 14,
    subject: "Your players' parents will love this",
    buildHtml: (name) =>
      build({
        preview: '30 seconds per player → parent-ready progress card.',
        title: `Keep parents in the loop, ${name.split(' ')[0]}`,
        intro:
          'SportsIQ generates a parent-friendly progress card for each player — no jargon, clear highlights, at-home practice suggestions. Coaches who share these see higher attendance and better at-home reinforcement.',
        steps: [
          "Open a player's profile from the Roster page.",
          'Tap Share Report to generate an AI-written summary.',
          'Copy the link and send it via text, email, or whichever app the parent uses.',
        ],
        cta: { label: 'Open my roster', href: `${APP_URL}/roster` },
      }),
  },
];

// ─── Scheduling logic ────────────────────────────────────────────────────────

/**
 * Returns the subset of drip emails that are due but not yet sent.
 *
 * @param createdAt   ISO date string when the coach account was created
 * @param sentKeys    Array of DripKeys already recorded in preferences
 * @param nowMs       Current timestamp in ms (injectable for testing)
 */
export function getDueEmails(
  createdAt: string,
  sentKeys: DripKey[],
  nowMs: number = Date.now()
): DripEmail[] {
  const createdMs = new Date(createdAt).getTime();
  const daysSince = (nowMs - createdMs) / (1000 * 60 * 60 * 24);

  return DRIP_SEQUENCE.filter(
    (email) => daysSince >= email.afterDays && !sentKeys.includes(email.key)
  );
}

/**
 * Parses drip_sent from coach preferences, tolerating null / bad data.
 */
export function parseSentKeys(preferences: unknown): DripKey[] {
  if (!preferences || typeof preferences !== 'object') return [];
  const prefs = preferences as Record<string, unknown>;
  const raw = prefs.drip_sent;
  if (!Array.isArray(raw)) return [];
  return raw.filter((k): k is DripKey =>
    ['day_1', 'day_3', 'day_7', 'day_14'].includes(k as string)
  );
}

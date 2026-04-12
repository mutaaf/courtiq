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

/** Shared wrapper keeps all emails on-brand without duplicating markup. */
function wrap(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <style>
    body { margin:0; padding:0; background:#09090b; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:#f4f4f5; }
    .wrapper { max-width:600px; margin:0 auto; padding:40px 20px; }
    .logo { font-size:22px; font-weight:700; color:#f97316; margin-bottom:32px; }
    .card { background:#18181b; border-radius:12px; padding:32px; margin-bottom:24px; }
    h1 { font-size:24px; font-weight:700; color:#f4f4f5; margin:0 0 12px; }
    p { font-size:16px; line-height:1.6; color:#a1a1aa; margin:0 0 16px; }
    .cta { display:inline-block; background:#f97316; color:#fff !important; font-weight:600;
           padding:14px 28px; border-radius:8px; text-decoration:none; font-size:16px; margin-top:8px; }
    .step { display:flex; gap:12px; align-items:flex-start; margin-bottom:16px; }
    .step-num { background:#f97316; color:#fff; border-radius:50%; width:28px; height:28px;
                display:flex; align-items:center; justify-content:center; font-weight:700;
                font-size:14px; flex-shrink:0; }
    .step-text { font-size:15px; color:#a1a1aa; line-height:1.5; padding-top:4px; }
    .footer { font-size:13px; color:#52525b; text-align:center; padding-top:24px; }
    a { color:#f97316; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="logo">SportsIQ</div>
    ${body}
    <div class="footer">
      You're receiving this because you signed up for SportsIQ.<br />
      <a href="{{unsubscribe_url}}">Unsubscribe</a>
    </div>
  </div>
</body>
</html>`;
}

// ─── The four drip emails ────────────────────────────────────────────────────

export const DRIP_SEQUENCE: DripEmail[] = [
  {
    key: 'day_1',
    afterDays: 1,
    subject: 'Welcome to SportsIQ — your first capture awaits',
    buildHtml: (name) =>
      wrap(
        'Welcome to SportsIQ',
        `<div class="card">
          <h1>Welcome, ${name}!</h1>
          <p>You're now part of a community of coaches who use data to develop better athletes. Here's how to get started in under 2 minutes:</p>
          <div class="step"><div class="step-num">1</div><div class="step-text">Tap <strong>Capture</strong> in the bottom nav and hit the microphone button.</div></div>
          <div class="step"><div class="step-num">2</div><div class="step-text">Say something like <em>"Marcus showed great footwork on the defensive rotations."</em></div></div>
          <div class="step"><div class="step-num">3</div><div class="step-text">SportsIQ automatically tags the player, skill, and sentiment — then saves it.</div></div>
          <a class="cta" href="https://app.sportsiq.app/capture">Make Your First Capture</a>
        </div>`
      ),
  },
  {
    key: 'day_3',
    afterDays: 3,
    subject: 'Pro tip: capture observations in seconds with Quick Capture',
    buildHtml: (name) =>
      wrap(
        'Quick Capture Tips',
        `<div class="card">
          <h1>Hi ${name}, here's how coaches save 20 min per session</h1>
          <p>The <strong>Quick Capture</strong> button (the ⚡ icon, bottom-right of every page) lets you record observations without leaving what you're doing.</p>
          <p>Coaches who use Quick Capture record <strong>3× more observations</strong> per session — giving the AI more data to generate smarter practice plans.</p>
          <div class="step"><div class="step-num">1</div><div class="step-text">Tap ⚡ from any page — a recording sheet pops up instantly.</div></div>
          <div class="step"><div class="step-num">2</div><div class="step-text">Speak naturally. Name multiple players in one breath — AI segments them automatically.</div></div>
          <div class="step"><div class="step-num">3</div><div class="step-text">Observations are saved without any review step. Back to coaching in seconds.</div></div>
          <a class="cta" href="https://app.sportsiq.app/capture">Try Quick Capture Now</a>
        </div>`
      ),
  },
  {
    key: 'day_7',
    afterDays: 7,
    subject: 'Ready to generate your first AI practice plan?',
    buildHtml: (name) =>
      wrap(
        'Generate Your First Plan',
        `<div class="card">
          <h1>${name}, your data is ready to work for you</h1>
          <p>After a week of observations, SportsIQ has enough data to generate a <strong>personalised practice plan</strong> targeting your team's actual growth areas.</p>
          <p>The AI analyzes every observation you've recorded, identifies declining skills and persistent gaps, and builds a drill-by-drill session plan with time allocations and coaching cues.</p>
          <div class="step"><div class="step-num">1</div><div class="step-text">Go to the <strong>Plans</strong> page.</div></div>
          <div class="step"><div class="step-num">2</div><div class="step-text">Tap <strong>Generate Practice Plan</strong>.</div></div>
          <div class="step"><div class="step-num">3</div><div class="step-text">In 10–15 seconds you have a full session plan, ready to run.</div></div>
          <a class="cta" href="https://app.sportsiq.app/plans">Generate My First Plan</a>
        </div>`
      ),
  },
  {
    key: 'day_14',
    afterDays: 14,
    subject: "Your players' parents will love this",
    buildHtml: (name) =>
      wrap(
        'Share With Parents',
        `<div class="card">
          <h1>Keep parents in the loop, ${name}</h1>
          <p>SportsIQ can generate a <strong>parent-friendly progress report</strong> for each player — no jargon, just clear highlights and at-home practice suggestions.</p>
          <p>Coaches who share reports with parents see higher player attendance and better at-home skill reinforcement. It takes 30 seconds per player.</p>
          <div class="step"><div class="step-num">1</div><div class="step-num">1</div><div class="step-text">Open a player's profile from the <strong>Roster</strong> page.</div></div>
          <div class="step"><div class="step-num">2</div><div class="step-text">Tap <strong>Share Report</strong> to generate an AI-written summary.</div></div>
          <div class="step"><div class="step-num">3</div><div class="step-text">Copy the link and send it via your preferred messaging app.</div></div>
          <a class="cta" href="https://app.sportsiq.app/roster">View My Roster</a>
        </div>`
      ),
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

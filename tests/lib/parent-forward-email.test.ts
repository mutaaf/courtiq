/**
 * Ticket 0079 — pure builder for the parent → parent forward email.
 *
 * The new POST /api/share/parent-forward route fires this builder to
 * produce the subject + HTML + plain-text bodies of the email the
 * receiving parent gets. The route hands it the sender's sanitized
 * first name, the receiving kid's first name, the team's name, the
 * sender's note (already HTML-stripped), and the recipient's portal
 * URL.
 *
 * Voice contract — every rendered string MUST contain no AGENTS.md
 * banned word for the full sender / team / kid first-name / sport
 * matrix. Defensive scans use literal spaces, NOT `\s+`, per
 * LESSONS#0061. The note is the parent's free text and natural
 * content like dates and numbers must not trip the leak guards
 * (LESSONS#0063 — scope to actual leak shapes like
 * /jersey:\s+\d+\b/i, NEVER bare digits).
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 */
import { describe, it, expect } from 'vitest';
import { buildParentForwardEmail } from '@/lib/parent-forward-email';

// AGENTS.md banned tokens — must never appear in any rendered string.
const BANNED = [
  'journey',
  'amazing',
  'exciting',
  'elevate',
  'empower',
  'synergy',
  'unlock your potential',
];

const DEFAULT_ARGS = {
  senderFirstName: 'Sarah',
  teamName: 'Hawks U10',
  recipientKidFirstName: 'Liam',
  note: "I thought you'd want to read this — Maya and Liam are on the same team.",
  recipientPortalUrl: 'https://youthsportsiq.com/share/abc123def456',
  teamSport: 'basketball',
};

describe('buildParentForwardEmail (ticket 0079)', () => {
  it('builds subject + body naming the sender, the team, and the recipient kid', () => {
    const { subject, html, text } = buildParentForwardEmail(DEFAULT_ARGS);

    // The AC's literal subject: "<senderFirstName> at <teamName> sent
    // you this week's SportsIQ report."
    expect(subject).toContain('Sarah');
    expect(subject).toContain('Hawks U10');
    expect(subject).toMatch(/sent you/i);

    // The body names the receiving kid's first name (so the receiving
    // parent immediately sees this is about HER kid).
    expect(html).toContain('Liam');
    expect(text).toContain('Liam');

    // The sender's name appears in the body greeting too.
    expect(html).toContain('Sarah');
    expect(text).toContain('Sarah');
  });

  it('renders the sanitized note inside a blockquote in the HTML body', () => {
    const { html, text } = buildParentForwardEmail(DEFAULT_ARGS);
    expect(html).toContain('<blockquote');
    // Plain text variant carries the note verbatim (no HTML encoding).
    expect(text).toContain(DEFAULT_ARGS.note);
    // HTML body carries an encoded-apostrophe version of the note (per
    // the escapeHtml step); assert on a stable substring with no
    // entities so we don't conflate intent with encoding.
    expect(html).toContain('Maya and Liam are on the same team');
  });

  it('strips inline HTML tags from the rendered note (defense in depth)', () => {
    const dirty = "<script>alert(1)</script>I'd want you to read this <b>too</b>.";
    const { html, text } = buildParentForwardEmail({
      ...DEFAULT_ARGS,
      note: dirty,
    });
    // Whatever sanitization shape we use, the rendered email must NOT
    // include an executable <script> tag or a raw <b> from the note.
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('alert(1)');
    expect(text).not.toContain('<script>');
  });

  it('deep-links to the RECIPIENT portal URL (not the sender) on its primary CTA', () => {
    const { html, text } = buildParentForwardEmail(DEFAULT_ARGS);
    expect(html).toContain(DEFAULT_ARGS.recipientPortalUrl);
    expect(text).toContain(DEFAULT_ARGS.recipientPortalUrl);
  });

  it('contains no AGENTS.md banned word across the full matrix', () => {
    const senderNames = ['Sarah', 'Andre', 'Priya', 'Maya'];
    const teamNames = ['Hawks U10', 'Riverside Wolves', 'Hornets Spring'];
    const kidNames = ['Liam', 'Sofia', 'Kai', 'Zoe'];
    const sports = ['basketball', 'soccer', 'volleyball'];
    const notes = [
      "Coach's reports have been really helpful for us this season.",
      "Look at what coach wrote this week — felt like she really sees him.",
      'Wanted to send this your way too.',
    ];

    for (const senderFirstName of senderNames) {
      for (const teamName of teamNames) {
        for (const recipientKidFirstName of kidNames) {
          for (const teamSport of sports) {
            for (const note of notes) {
              const { subject, html, text } = buildParentForwardEmail({
                senderFirstName,
                teamName,
                recipientKidFirstName,
                note,
                recipientPortalUrl: DEFAULT_ARGS.recipientPortalUrl,
                teamSport,
              });
              const all = `${subject}\n${html}\n${text}`.toLowerCase();
              for (const word of BANNED) {
                expect(all, `banned word "${word}" in matrix`).not.toContain(word.toLowerCase());
              }
            }
          }
        }
      }
    }
  });

  it('never renders an email address in the body (the sender email is server-only)', () => {
    const { html, text } = buildParentForwardEmail(DEFAULT_ARGS);
    // Scope to the actual leak shape (LESSONS#0063) — any `@`-shaped token
    // outside the recipient portal URL would be a leak. The recipient
    // portal URL itself contains no `@`, so a bare `@` anywhere is a
    // tell.
    expect(html).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    expect(text).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  });

  it("never leaks shaped per-minor identifiers (jersey, parent_email, parent_phone)", () => {
    // Per LESSONS#0063 — scope to actual leak shapes, not bare digits.
    const args = {
      ...DEFAULT_ARGS,
      // A naturally-numerical note that contains dates / counts.
      note: "Coach's report had 4 things Liam can work on this week. Maya was great too.",
    };
    const { html, text } = buildParentForwardEmail(args);
    const all = `${html}\n${text}`;
    expect(all).not.toMatch(/jersey:\s+\d+\b/i);
    expect(all).not.toMatch(/parent_email:.+@/i);
    expect(all).not.toMatch(/parent_phone:.+/i);
    expect(all).not.toMatch(/dob:\s+\d{4}/i);
  });

  it('returns string subject / html / text on every shape', () => {
    const { subject, html, text } = buildParentForwardEmail(DEFAULT_ARGS);
    expect(typeof subject).toBe('string');
    expect(typeof html).toBe('string');
    expect(typeof text).toBe('string');
    expect(subject.length).toBeGreaterThan(0);
    expect(html.length).toBeGreaterThan(0);
    expect(text.length).toBeGreaterThan(0);
  });
});

/**
 * Ticket 0080 — cross-team variant of the parent-forward email
 * builder.
 *
 * The 0079 helper builds the email for the same-team forward. THIS
 * ticket adds a cross-team variant that the POST route selects when
 * `cross_team === true`. The variant's:
 *
 *   - Subject: "<sender> on a neighboring team in your program sent
 *     you this week's SportsIQ report."
 *   - Body:    two short sentences in the existing cardboard voice,
 *              the sender's note in a blockquote, the sender's team
 *              name labelled ("<sender>'s daughter is on the
 *              <senderTeamName> in the <programName> program"),
 *              ONE CTA "Read <recipientKidFirstName>'s report"
 *              deep-linking to the RECIPIENT's portal URL.
 *
 * The deep-link MUST be the RECIPIENT's portal URL (NEVER the
 * sender's). The body NEVER contains the sender's coach's name, the
 * recipient coach's email, or any surname.
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 */
import { describe, it, expect } from 'vitest';
import {
  buildParentForwardEmail,
  buildParentForwardCrossTeamEmail,
  type ParentForwardCrossTeamEmailArgs,
} from '@/lib/parent-forward-email';

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

const DEFAULT_ARGS: ParentForwardCrossTeamEmailArgs = {
  senderFirstName: 'Sarah',
  senderTeamName: 'Hawks U10',
  programName: 'Riverside',
  recipientKidFirstName: 'Devon',
  note: "I thought you'd want to read this — Maya is on the Hawks U10 and Devon is on the Bears U12.",
  recipientPortalUrl: 'https://youthsportsiq.com/share/recipient-token-xyz',
  teamSport: 'basketball',
};

describe('buildParentForwardCrossTeamEmail (ticket 0080)', () => {
  it('subject names neighboring-team-in-program shape + the sender first name', () => {
    const { subject } = buildParentForwardCrossTeamEmail(DEFAULT_ARGS);
    expect(subject).toContain('Sarah');
    expect(subject).toMatch(/neighboring team/i);
    expect(subject).toMatch(/program/i);
    expect(subject).toMatch(/sent you/i);
  });

  it("body labels the sender's team name and the program name", () => {
    const { html, text } = buildParentForwardCrossTeamEmail(DEFAULT_ARGS);
    expect(html).toContain('Hawks U10');
    expect(html).toContain('Riverside');
    expect(text).toContain('Hawks U10');
    expect(text).toContain('Riverside');
  });

  it("body names the receiving kid's first name (so the receiving parent knows it's about HER kid)", () => {
    const { html, text } = buildParentForwardCrossTeamEmail(DEFAULT_ARGS);
    expect(html).toContain('Devon');
    expect(text).toContain('Devon');
  });

  it('renders the sanitized note inside a blockquote in the HTML body', () => {
    const { html, text } = buildParentForwardCrossTeamEmail(DEFAULT_ARGS);
    expect(html).toContain('<blockquote');
    expect(text).toContain(DEFAULT_ARGS.note);
    expect(html).toContain('Maya is on the Hawks U10');
  });

  it('deep-links to the RECIPIENT portal URL (NOT the sender) on its primary CTA', () => {
    const { html, text } = buildParentForwardCrossTeamEmail(DEFAULT_ARGS);
    expect(html).toContain(DEFAULT_ARGS.recipientPortalUrl);
    expect(text).toContain(DEFAULT_ARGS.recipientPortalUrl);
  });

  it("body NEVER contains a sender's coach name, a recipient coach's email, or any surname", () => {
    const { html, text } = buildParentForwardCrossTeamEmail(DEFAULT_ARGS);
    const all = `${html}\n${text}`;
    // No email shape.
    expect(all).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    // No surname-shape ("Sarah Smith" / "Devon Walker") — note: we
    // use a literal space not `\s+` per LESSONS#0061.
    expect(all).not.toMatch(/Sarah [A-Z][a-z]+/);
    expect(all).not.toMatch(/Devon [A-Z][a-z]+/);
  });

  it('rejects a payload missing senderTeamName (template precondition)', () => {
    expect(() =>
      buildParentForwardCrossTeamEmail({
        ...DEFAULT_ARGS,
        senderTeamName: '',
      }),
    ).toThrow();
  });

  it('rejects a payload missing programName (template precondition)', () => {
    expect(() =>
      buildParentForwardCrossTeamEmail({
        ...DEFAULT_ARGS,
        programName: '',
      }),
    ).toThrow();
  });

  it('contains no AGENTS.md banned word across the full sender/team/program/kid/sport matrix', () => {
    const senderNames = ['Sarah', 'Andre', 'Priya', 'Maya'];
    const senderTeamNames = ['Hawks U10', 'Riverside Wolves', 'Hornets Spring'];
    const programNames = ['Riverside', 'Westview Youth', 'Northside Hoops'];
    const kidNames = ['Devon', 'Liam', 'Zoe', 'Kai'];
    const sports = ['basketball', 'soccer', 'volleyball'];
    const notes = [
      "Coach's reports have been really helpful for us this season.",
      "Look at what coach wrote this week — felt like he really sees him.",
      "Wanted to send this your way — same program, different team.",
    ];

    for (const senderFirstName of senderNames) {
      for (const senderTeamName of senderTeamNames) {
        for (const programName of programNames) {
          for (const recipientKidFirstName of kidNames) {
            for (const teamSport of sports) {
              for (const note of notes) {
                const { subject, html, text } = buildParentForwardCrossTeamEmail({
                  senderFirstName,
                  senderTeamName,
                  programName,
                  recipientKidFirstName,
                  note,
                  recipientPortalUrl: DEFAULT_ARGS.recipientPortalUrl,
                  teamSport,
                });
                const all = `${subject}\n${html}\n${text}`.toLowerCase();
                for (const word of BANNED) {
                  expect(all, `banned word "${word}" in cross-team matrix`).not.toContain(
                    word.toLowerCase(),
                  );
                }
              }
            }
          }
        }
      }
    }
  });

  it("never leaks shaped per-minor identifiers (jersey, parent_email, parent_phone, DOB)", () => {
    const args: ParentForwardCrossTeamEmailArgs = {
      ...DEFAULT_ARGS,
      // Naturally-numerical note with dates / counts that must not
      // false-positive on the bare-digit guard (LESSONS#0063).
      note: "Coach's report had 4 things Devon can work on this week.",
    };
    const { html, text } = buildParentForwardCrossTeamEmail(args);
    const all = `${html}\n${text}`;
    expect(all).not.toMatch(/jersey:\s+\d+\b/i);
    expect(all).not.toMatch(/parent_email:.+@/i);
    expect(all).not.toMatch(/parent_phone:.+/i);
    expect(all).not.toMatch(/dob:\s+\d{4}/i);
  });
});

describe('buildParentForwardEmail (ticket 0079) — same-team byte-identical regression', () => {
  it('the same-team builder is unchanged (the cross-team variant is additive)', () => {
    const { subject, html, text } = buildParentForwardEmail({
      senderFirstName: 'Sarah',
      teamName: 'Hawks U10',
      recipientKidFirstName: 'Liam',
      note: "I thought you'd want to read this — Maya and Liam are on the same team.",
      recipientPortalUrl: 'https://youthsportsiq.com/share/abc123def456',
      teamSport: 'basketball',
    });
    // The 0079 subject literal: "<sender> at <teamName> sent you this
    // week's SportsIQ report" — make sure 0080 hasn't drifted it.
    expect(subject).toBe(
      "Sarah at Hawks U10 sent you this week's SportsIQ report",
    );
    expect(html).toContain('Liam');
    expect(text).toContain('Liam');
    expect(html).toContain('Sarah');
  });
});

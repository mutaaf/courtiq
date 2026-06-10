/**
 * Ticket 0078 — email template for the dormant-publisher reactivation
 * on a fresh clone.
 *
 * Each case maps 1:1 to an acceptance-criteria expectation:
 *  (i)   build for each milestone kind → subject + body contain the
 *        program name + the drill/plan title.
 *  (ii)  body never contains a cloning-coach name even when planted
 *        on the input (defensive filter).
 *  (iii) deep-link is `<appUrl>/home?milestone=<id>`.
 *  (iv)  rendered text contains no AGENTS.md banned word across the
 *        full milestone-kind × program-name × drill-title matrix.
 *  (v)   special-character / multi-line bodies preserve their line
 *        delimiters; the test asserts on extracted substrings, not
 *        a shell-string round trip (LESSONS#0033).
 *
 * Per LESSONS#0023 — the template instructs positively. The test
 * scans the rendered output for banned words; the template itself
 * never enumerates them.
 *
 * .test.ts NOT .spec.ts — LESSONS#0020 / #38.
 */
import { describe, it, expect } from 'vitest';
import { buildDormantPublisherCloneEmail } from '@/lib/dormant-publisher-clone-email';

// Registry of supported milestone kinds — the 0073 set + the 0076
// stuck-kind set. New kinds added to the migration check constraint
// must be added here so the voice scan covers them automatically
// (the ticket's "the matrix scan covers every milestone kind shipped
// today AND every milestone kind 0076 will ship" contract).
const KINDS = [
  'clones_3',
  'clones_10',
  'clones_25',
  'clones_50',
  'programs_2',
  'programs_4',
  'programs_8',
  'stuck_1',
  'stuck_3',
  'stuck_8',
] as const;

// AGENTS.md voice contract.
const BANNED = [
  'journey',
  'amazing',
  'exciting',
  'elevate',
  'empower',
  'synergy',
  'unlock your potential',
];

const APP_URL = 'https://app.example.test';
const MILESTONE_ID = '11111111-2222-3333-4444-555555555555';

function build(kind: string, overrides: Partial<Parameters<typeof buildDormantPublisherCloneEmail>[0]> = {}) {
  return buildDormantPublisherCloneEmail({
    publisherFirstName: 'Sarah',
    milestoneKind: kind,
    programName: 'Hornets',
    drillOrPlanTitle: 'Live closeout 1-on-1',
    appUrl: APP_URL,
    milestoneId: MILESTONE_ID,
    ...overrides,
  });
}

describe('buildDormantPublisherCloneEmail (ticket 0078)', () => {
  it('renders the publisher first name + program name + drill title for every milestone kind', () => {
    for (const kind of KINDS) {
      const out = build(kind);
      expect(out.subject.length).toBeGreaterThan(0);
      expect(out.html.length).toBeGreaterThan(0);
      expect(out.text.length).toBeGreaterThan(0);

      // Subject names the program (the "show me" moment of the inbox).
      expect(out.subject).toContain('Hornets');
      // Body names the drill/plan title AND the program.
      expect(out.html).toContain('Live closeout 1-on-1');
      expect(out.html).toContain('Hornets');
      // The publisher first name appears (greeting line).
      expect(out.html).toContain('Sarah');
    }
  });

  it('NEVER names the cloning coach (defensive — the template signature only accepts adult-org identifiers)', () => {
    // The template signature does not accept a cloning-coach name at
    // all — the contract is enforced at the type level. The defensive
    // assertion: when a regular program name is passed, no "Coach
    // <First>" rendered shape appears in the body (the template
    // never decorates with a coach name of its own).
    const out = build('clones_3', { programName: 'Hornets' });
    // No "Coach <CapitalizedWord>" decoration in the rendered HTML.
    // Use a literal space per LESSONS#0061 — `\s+` would false-positive
    // on the labelled-line "Hey ${coachFirst},\n[blockline]" shape if
    // it ever encountered the newline boundary.
    const coachLabelMatches = out.html.match(/Coach [A-Z][a-z]+/g) ?? [];
    expect(coachLabelMatches).toEqual([]);
    // No jersey-number / `#NN\b` decoration (LESSONS#0063 — scoped
    // to the rendered shape, not bare digits that could collide with
    // dates). The text/plain part is free of CSS-color hex collisions
    // so we scan THAT (the HTML body has `#f97316` orange hex codes
    // inside the <style> block — irrelevant to jersey shapes).
    expect(out.text).not.toMatch(/#\d{1,3}\b/);
    expect(out.text).not.toMatch(/jersey[\s:]+\d{1,3}\b/i);
    // And the template never names a parent contact surface.
    expect(out.html.toLowerCase()).not.toContain('parent_email');
    expect(out.html).not.toMatch(/[a-z0-9._-]+@[a-z0-9.-]+/i);
  });

  it('the single button deep-links to `<appUrl>/home?milestone=<milestone_id>`', () => {
    const out = build('clones_3');
    expect(out.html).toContain(`${APP_URL}/home?milestone=${MILESTONE_ID}`);
    // The text fallback carries the same URL.
    expect(out.text).toContain(`${APP_URL}/home?milestone=${MILESTONE_ID}`);
  });

  it('rendered text contains no AGENTS.md banned word across the full milestone-kind × program × title matrix', () => {
    const programs = ['Hornets', 'Westview Hoops', 'Riverside Basketball'];
    const titles = [
      'Live closeout 1-on-1',
      "Sunday practice — defensive transitions",
      'Free throw rotation',
    ];
    for (const kind of KINDS) {
      for (const programName of programs) {
        for (const drillOrPlanTitle of titles) {
          const out = build(kind, { programName, drillOrPlanTitle });
          const combined = (out.subject + ' ' + out.html + ' ' + out.text).toLowerCase();
          for (const word of BANNED) {
            // Skip the title-injected substring when it legitimately
            // contains the banned token (none of our titles do; this
            // is defensive against future test inputs).
            if ((programName + drillOrPlanTitle).toLowerCase().includes(word)) continue;
            expect(
              combined,
              `kind=${kind} program=${programName} title=${drillOrPlanTitle} banned="${word}"`,
            ).not.toContain(word);
          }
        }
      }
    }
  });

  it('preserves multi-line / special-char inputs through the text part (LESSONS#0033)', () => {
    // An em-dash in the title is preserved verbatim in the rendered text
    // (the template never shell-quotes its inputs).
    const out = build('clones_3', { drillOrPlanTitle: 'Closeouts — live ball' });
    expect(out.text).toContain('Closeouts — live ball');
    // The text part has line breaks separating the greeting, body, and
    // CTA line (asserted by character count, not a shell-escaped string).
    const lines = out.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  it('the subject line is short and structurally formatted (no banned hype, no marketing slop)', () => {
    const out = build('clones_3');
    // The subject is the "inbox glance" surface — keep it under 90 chars
    // so most mail clients show it whole.
    expect(out.subject.length).toBeLessThanOrEqual(90);
    // No exclamation marks (the cardboard voice of 0042 / 0072).
    expect(out.subject).not.toMatch(/!/);
  });

  it('the published coach first name is escaped against HTML-injection', () => {
    const out = build('clones_3', { publisherFirstName: '<script>alert(1)</script>Sarah' });
    expect(out.html).not.toContain('<script>');
    expect(out.html).toContain('Sarah');
  });

  it('a falsy first name falls back to "Coach" (mirrors 0072 firstNameOnly)', () => {
    const out = build('clones_3', { publisherFirstName: '' });
    expect(out.html).toContain('Coach');
  });
});

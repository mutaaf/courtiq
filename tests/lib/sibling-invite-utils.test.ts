/**
 * Ticket 0060 — pure helpers for the parent-side sibling-invite surface.
 *
 * The card on /share/[token] lets a parent reading kid A's report tap once
 * to send kid B's coach an email naming kid B's first name. Two helpers
 * live here:
 *
 *  - `buildSiblingInviteEmail(args)` → `{ subject, html, text }` — the
 *    parent-voiced email body. Five elements only: header naming the
 *    parent's first name + sibling's team, the parent's optional note,
 *    ONE CTA deep-linking to the referral landing, a fineprint line
 *    saying the parent never shared the recipient's email beyond this
 *    invite, and the standard unsubscribe link. Voice contract: positive,
 *    factual; NONE of the AGENTS.md banned tokens.
 *
 *  - `firstNameOnly(fullName)` — the helper the candidate-lookup route
 *    uses to strip the seeded `players.name` to the first space-delimited
 *    token. COPPA: the candidate response NEVER returns a sibling last
 *    name.
 *
 * Per LESSONS#0023: instruct positively in any code comment that names a
 * banned token. The user-visible template strings here MUST NOT contain
 * the banned list (the test below enumerates the banned tokens for the
 * scan; the template never does).
 */
import { describe, it, expect } from 'vitest';
import {
  buildSiblingInviteEmail,
  firstNameOnly,
  type SiblingInviteEmailArgs,
} from '@/lib/sibling-invite-utils';

const BANNED_WORDS = [
  'journey',
  'amazing',
  'exciting',
  'elevate',
  'empower',
  'synergy',
  'unlock',
];

function fixtureArgs(overrides: Partial<SiblingInviteEmailArgs> = {}): SiblingInviteEmailArgs {
  return {
    parentFirstName: 'Maria',
    siblingFirstName: 'Sofia',
    siblingTeamName: 'Hornets U10',
    programName: 'River Valley Rec',
    referralUrl: 'https://youthsportsiq.com/?ref=AAAAAA&program=org-1',
    note: null,
    ...overrides,
  };
}

describe('firstNameOnly()', () => {
  it('returns the first space-delimited token of the seeded player name', () => {
    expect(firstNameOnly('Sofia Walker')).toBe('Sofia');
  });
  it('handles a single-token name unchanged', () => {
    expect(firstNameOnly('Sofia')).toBe('Sofia');
  });
  it('trims whitespace before splitting', () => {
    expect(firstNameOnly('  Sofia Walker  ')).toBe('Sofia');
  });
  it('returns null for null/empty input', () => {
    expect(firstNameOnly(null)).toBeNull();
    expect(firstNameOnly('')).toBeNull();
    expect(firstNameOnly('   ')).toBeNull();
  });
});

describe('buildSiblingInviteEmail()', () => {
  it('returns subject + html + text', () => {
    const out = buildSiblingInviteEmail(fixtureArgs());
    expect(out.subject).toBeTruthy();
    expect(out.html).toBeTruthy();
    expect(out.text).toBeTruthy();
  });

  it("names the parent's first name + sibling's first name in the subject", () => {
    const out = buildSiblingInviteEmail(fixtureArgs());
    expect(out.subject).toMatch(/Maria/);
    expect(out.subject).toMatch(/Sofia/);
  });

  it("renders the parent's optional note when present, omits it when null", () => {
    const withNote = buildSiblingInviteEmail(
      fixtureArgs({ note: 'I think this would help our team too.' }),
    );
    expect(withNote.html).toContain('I think this would help our team too.');
    expect(withNote.text).toContain('I think this would help our team too.');

    const withoutNote = buildSiblingInviteEmail(fixtureArgs({ note: null }));
    expect(withoutNote.html).not.toContain('I think this would help our team too.');
  });

  it('includes ONE primary CTA deep-linking to the referral URL', () => {
    const referralUrl = 'https://youthsportsiq.com/?ref=AAAAAA&program=org-1';
    const out = buildSiblingInviteEmail(fixtureArgs({ referralUrl }));
    // The URL ends up in the HTML href; the `&` is correctly escaped to
    // `&amp;` by the html-escape pass, which the browser will read back as
    // `&` — the URL still resolves identically.
    expect(out.html).toMatch(/href="https:\/\/youthsportsiq\.com\/\?ref=AAAAAA(&amp;|&)program=org-1"/);
    // Exactly one CTA — no duplicate marketing link.
    const ctaCount = (out.html.match(/See how it works/g) || []).length;
    expect(ctaCount).toBe(1);
    expect(out.text).toContain(referralUrl);
  });

  it("renders a fineprint line confirming the recipient's email was not shared further", () => {
    const out = buildSiblingInviteEmail(fixtureArgs());
    // The exact wording is intentionally loose — the contract is "the parent
    // never shared your email beyond this invite", in some shape.
    expect(out.html.toLowerCase()).toMatch(/did not share your email/);
  });

  it("renders the inviting program's name when provided", () => {
    const out = buildSiblingInviteEmail(fixtureArgs({ programName: 'River Valley Rec' }));
    expect(out.html).toContain('River Valley Rec');
  });

  it('degrades cleanly when programName is null', () => {
    const out = buildSiblingInviteEmail(fixtureArgs({ programName: null }));
    expect(out.subject).toMatch(/Maria/);
    // No "null" leak into the rendered body.
    expect(out.html).not.toContain('null');
    expect(out.text).not.toContain('null');
  });

  it("never leaks the recipient's email into the visible body (only the From address carries it)", () => {
    // Planted recipient email is what would have been the `to:` field —
    // the body must NEVER echo it. The route caller passes it to sendEmail
    // separately; this helper does not even take it as an argument.
    const out = buildSiblingInviteEmail(fixtureArgs());
    expect(out.html).not.toContain('other.coach@example.test');
    expect(out.text).not.toContain('other.coach@example.test');
  });

  it('renders no AGENTS.md banned word in subject or body (positive voice)', () => {
    const out = buildSiblingInviteEmail(
      fixtureArgs({
        note: 'I think this would help our team too.',
      }),
    );
    const corpus = `${out.subject}\n${out.html}\n${out.text}`.toLowerCase();
    for (const banned of BANNED_WORDS) {
      expect(corpus).not.toContain(banned);
    }
  });

  it('html-escapes parent-controlled strings to prevent injection', () => {
    const out = buildSiblingInviteEmail(
      fixtureArgs({
        parentFirstName: 'Mar<script>alert(1)</script>',
        note: 'Look at this <img src=x onerror=alert(1)>',
      }),
    );
    expect(out.html).not.toContain('<script>');
    expect(out.html).not.toContain('<img src=x');
    // The escaped form is fine.
    expect(out.html).toContain('&lt;script&gt;');
  });
});

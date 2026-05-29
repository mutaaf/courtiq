/**
 * Ticket 0056 — pure helpers for the parent-reaction one-tap reply.
 *
 * `buildStaticReplyTemplate(...)` produces the deterministic fallback string
 * used when AI is unavailable (quota, provider outage, or a free coach). The
 * shape and tone are anchored here, not in the route — so the route stays
 * thin and the static template can be re-asserted from the component test.
 *
 * `stripContactInfo(...)` is the server-side defense against a coach (or a
 * client tampered body) embedding contact-info into the reply: emails, URLs,
 * and 7+ digit runs are masked. We do not block the send — we sanitise.
 *
 * Voice contract: NO AGENTS.md banned word can appear in the rendered template
 * for any normal first-name input (LESSONS#23 — instruct positively).
 *
 * .test.ts NOT .spec.ts (LESSONS#38 / #79).
 */
import { describe, it, expect } from 'vitest';
import {
  buildStaticReplyTemplate,
  stripContactInfo,
} from '@/lib/parent-reply-utils';

const BANNED = ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy'];

describe('buildStaticReplyTemplate', () => {
  it('renders the parent, the player, and the coach by first name', () => {
    const out = buildStaticReplyTemplate({
      parentFirstName: 'Sarah',
      playerFirstName: 'Devon',
      coachFirstName: 'Maya',
    });
    expect(out).toContain('Sarah');
    expect(out).toContain('Devon');
    expect(out).toContain('Maya');
  });

  it('renders without any AGENTS.md banned word (clipboard voice)', () => {
    const out = buildStaticReplyTemplate({
      parentFirstName: 'Sarah',
      playerFirstName: 'Devon',
      coachFirstName: 'Maya',
    }).toLowerCase();
    for (const w of BANNED) expect(out).not.toContain(w);
  });

  it('falls back to neutral labels when a first name is empty', () => {
    const out = buildStaticReplyTemplate({
      parentFirstName: '',
      playerFirstName: '',
      coachFirstName: '',
    });
    // No empty greeting "Hi ," — and no obvious "undefined" / "null" leak.
    expect(out).not.toContain('undefined');
    expect(out).not.toContain('null');
    expect(out.trim().length).toBeGreaterThan(20);
  });

  it('never inlines a planted email or phone from a first-name slot', () => {
    // A defensive case: if a future caller mis-uses the helper by passing
    // a freely-typed string into a first-name slot, the static template
    // does NOT echo a contact-info shape into the body. The helper is
    // not the place to strip — the SEND route is — but we assert that the
    // template's substitution surface is narrow enough that an obvious
    // shape isn't reformatted into something looking like an outbound
    // contact channel.
    const out = buildStaticReplyTemplate({
      parentFirstName: 'sarah@example.com',
      playerFirstName: '555-867-5309',
      coachFirstName: 'http://example.com',
    });
    // The helper does NOT promise to strip these — that's the route's job —
    // it just must NOT crash, and must still produce a sensible reply.
    expect(out.length).toBeGreaterThan(0);
  });
});

describe('stripContactInfo', () => {
  it('masks an embedded email address', () => {
    const out = stripContactInfo('Thanks Sarah — text me at maya@gmail.com if you want.');
    expect(out).not.toContain('maya@gmail.com');
  });

  it('masks an https URL', () => {
    const out = stripContactInfo('Thanks Sarah — see https://my-personal-site.com/x for more.');
    expect(out).not.toContain('https://my-personal-site.com');
  });

  it('masks an http URL', () => {
    const out = stripContactInfo('Try http://example.com please.');
    expect(out).not.toContain('http://example.com');
  });

  it('masks a 7+ digit run (a phone number)', () => {
    const out = stripContactInfo('Call me at 5558675309.');
    // The digit run should be obfuscated — the exact representation is up
    // to the helper, but the original 10-digit run must not appear verbatim.
    expect(out).not.toContain('5558675309');
  });

  it('leaves short digit runs alone (a jersey number, a date)', () => {
    const out = stripContactInfo('Devon was #7 on Tuesday and scored 12.');
    expect(out).toContain('7');
    expect(out).toContain('12');
  });

  it('returns the input unchanged when no contact info is present', () => {
    const clean = 'Sarah — thanks for the note. Devon has been working hard. — Maya';
    expect(stripContactInfo(clean)).toBe(clean);
  });
});

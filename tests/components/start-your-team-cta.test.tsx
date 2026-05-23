/**
 * Component test for StartYourTeamCTA — the second, distinct parent-portal CTA
 * that converts a parent-who-is-also-a-coach into a coach signup in context
 * (ticket 0019).
 *
 * Unlike the forward button (ParentViralCTA, ticket 0011) which shares via
 * navigator.share / clipboard and renders NO <a href>, this CTA is a PLAIN
 * server-rendered link so it works without JS on a flaky connection. The href
 * must be `/signup?ref=<code>` when the creating coach's referral code is
 * resolved, and a bare `/signup` when no code is present.
 *
 * COPPA: the outbound href carries ONLY `ref=<code>` — no player name, no parent
 * contact, no token-derived PII. (`.test.tsx`, never `.spec.ts` — vitest excludes
 * the spec glob; LESSONS#38.)
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StartYourTeamCTA } from '@/components/share/start-your-team-cta';

function startLink() {
  return screen.getByRole('link', { name: /start your own team/i });
}

describe('StartYourTeamCTA — direct self-signup link (ticket 0019)', () => {
  beforeEach(() => cleanup());

  // AC: the CTA is a real <a href> (not a JS share handler) whose href contains
  // /signup?ref=<code> when the coach's referral code is resolved.
  it('renders a real link to /signup?ref=<code> when a referralCode is provided', () => {
    render(<StartYourTeamCTA referralCode="ABC234" />);
    const link = startLink();
    // A genuine anchor element, assertable by href (no client JS required).
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/signup?ref=ABC234');
  });

  // AC: when the share has no resolvable referral code, the CTA still renders and
  // links to a bare /signup (a missing code never breaks the CTA).
  it('falls back to a bare /signup when referralCode is absent', () => {
    render(<StartYourTeamCTA />);
    const link = startLink();
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/signup');
  });

  it('falls back to a bare /signup when referralCode is null', () => {
    render(<StartYourTeamCTA referralCode={null} />);
    expect(startLink()).toHaveAttribute('href', '/signup');
  });

  it('falls back to a bare /signup when referralCode is an empty string', () => {
    render(<StartYourTeamCTA referralCode="" />);
    expect(startLink()).toHaveAttribute('href', '/signup');
  });

  // AC (COPPA): the href exposes ONLY the referral code — no player name, no
  // parent contact, no token-derived PII in the outbound /signup link.
  it('exposes only ref=<code> in the href — no player/parent/token PII', () => {
    render(<StartYourTeamCTA referralCode="ABC234" />);
    const href = startLink().getAttribute('href') as string;

    // Exactly one query param, and it is ref=<code>.
    const url = new URL(href, 'https://example.com');
    expect(url.pathname).toBe('/signup');
    expect(Array.from(url.searchParams.keys())).toEqual(['ref']);
    expect(url.searchParams.get('ref')).toBe('ABC234');
  });

  // The self-signup CTA is a DIFFERENT primitive from the forward button: it must
  // be a link, never a <button>. (The forward button is asserted separately.)
  it('is a link element, not a button', () => {
    render(<StartYourTeamCTA referralCode="ABC234" />);
    expect(screen.getByRole('link', { name: /start your own team/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start your own team/i })).toBeNull();
  });
});

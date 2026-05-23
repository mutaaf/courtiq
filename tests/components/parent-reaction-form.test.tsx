/**
 * Component test for ParentReactionForm — the parent-portal reaction widget and,
 * after a successful submit, the two relocated referral-carrying actions on the
 * thank-you/success screen (ticket 0022).
 *
 * The form receives the creating coach's referral code as a prop (resolved
 * server-side by GET /api/share/[token], ticket 0011, and passed down — NO
 * Supabase access from this 'use client' component, per AGENTS.md rule 3). On the
 * success state it surfaces:
 *   1. a PLAIN self-signup `<a href="/signup?ref=<code>">` (mirrors the 0019
 *      StartYourTeamCTA primitive — works without JS), and
 *   2. a "share with the other parents" forward control reusing the same
 *      navigator.share / clipboard path as ParentViralCTA (ticket 0011), which
 *      exposes the constructed URL on the trigger via data-share-url so it's
 *      assertable (the control renders no <a href>; LESSONS#11).
 *
 * COPPA / data minimization: the outbound /signup href and the forward share
 * payload carry ONLY ref=<code> — never the player name, parent name, message
 * text, or share token.
 *
 * (`.test.tsx`, never `.spec.ts` — vitest excludes the spec glob; LESSONS#38.)
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ParentReactionForm } from '@/components/share/parent-reaction-form';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://sportsiq.app';

// Drive the form from idle → success: pick a reaction, (optionally) type a
// message, submit. fetch is mocked to return 200 so the success branch renders.
async function submitReaction(opts: { message?: string; parentName?: string } = {}) {
  // Pick the first reaction (expands the message form + enables submit).
  const reactionButtons = screen.getAllByRole('button', { pressed: false });
  fireEvent.click(reactionButtons[0]);

  if (opts.message) {
    fireEvent.change(screen.getByLabelText(/optional message/i), {
      target: { value: opts.message },
    });
  }
  if (opts.parentName) {
    fireEvent.change(screen.getByLabelText(/your name/i), {
      target: { value: opts.parentName },
    });
  }

  const sendBtn = screen.getByRole('button', { name: /send .* to coach/i });
  fireEvent.click(sendBtn);

  // The success confirmation appears once POST /api/parent-reactions resolves.
  await waitFor(() => expect(screen.getByText(/message sent/i)).toBeInTheDocument());
}

function shareForwardButton() {
  return screen.getByRole('button', { name: /share .* with the other parents/i });
}

function selfSignupLink() {
  return screen.getByRole('link', { name: /start your own team/i });
}

describe('ParentReactionForm — success-screen viral actions (ticket 0022)', () => {
  beforeEach(() => {
    cleanup();
    // POST /api/parent-reactions → 200 so the form reaches the success state.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    }) as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // AC: the success state renders a self-signup link that is a real <a href>
  // whose href contains /signup?ref=<code> (a plain link — works without JS).
  it('renders a real self-signup link to /signup?ref=<code> on the success state', async () => {
    render(
      <ParentReactionForm
        shareToken="tok-abc"
        playerFirstName="Alice"
        coachName="Rivera"
        referralCode="ABC234"
      />
    );
    await submitReaction();
    const link = selfSignupLink();
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/signup?ref=ABC234');
  });

  it('falls back to a bare /signup self-signup link when no referralCode is present', async () => {
    render(
      <ParentReactionForm shareToken="tok-abc" playerFirstName="Alice" coachName="Rivera" />
    );
    await submitReaction();
    expect(selfSignupLink()).toHaveAttribute('href', '/signup');
  });

  // AC: the forward control reuses the navigator.share / clipboard path of
  // ParentViralCTA — it exposes the constructed URL (the same value handleShare()
  // forwards) on the trigger via data-share-url. With a code present it carries
  // /signup?ref=<code>; with no code it falls back to the bare app URL.
  it('renders a forward control whose share URL carries /signup?ref=<code>', async () => {
    render(
      <ParentReactionForm
        shareToken="tok-abc"
        playerFirstName="Alice"
        coachName="Rivera"
        referralCode="ABC234"
      />
    );
    await submitReaction();
    expect(shareForwardButton()).toHaveAttribute(
      'data-share-url',
      `${APP_URL}/signup?ref=ABC234`
    );
  });

  it('forward control falls back to the bare app URL when no referralCode is present', async () => {
    render(
      <ParentReactionForm shareToken="tok-abc" playerFirstName="Alice" coachName="Rivera" />
    );
    await submitReaction();
    expect(shareForwardButton()).toHaveAttribute('data-share-url', APP_URL);
  });

  // AC: the referral code reaches the form ONLY as a prop — the 'use client' form
  // does not resolve it itself. We assert the rendered link is built from the
  // passed prop (a different code yields a different href), proving prop-driven
  // construction (no internal resolution / Supabase access).
  it('builds the link from the referralCode prop (no internal resolution)', async () => {
    render(
      <ParentReactionForm
        shareToken="tok-abc"
        playerFirstName="Alice"
        coachName="Rivera"
        referralCode="ZZZ999"
      />
    );
    await submitReaction();
    expect(selfSignupLink()).toHaveAttribute('href', '/signup?ref=ZZZ999');
  });

  // AC (COPPA): the self-signup href and the forward share URL carry ONLY
  // ref=<code> — no player name, no parent name, no message text, no share token.
  it('outbound URLs expose only ref=<code> — no player/parent/message/token PII', async () => {
    render(
      <ParentReactionForm
        shareToken="secret-share-token-xyz"
        playerFirstName="Alice"
        coachName="Rivera"
        referralCode="ABC234"
      />
    );
    await submitReaction({ message: 'so proud of her', parentName: 'Dana' });

    const href = selfSignupLink().getAttribute('href') as string;
    const signupUrl = new URL(href, 'https://example.com');
    expect(signupUrl.pathname).toBe('/signup');
    expect(Array.from(signupUrl.searchParams.keys())).toEqual(['ref']);
    expect(signupUrl.searchParams.get('ref')).toBe('ABC234');

    const shareUrl = shareForwardButton().getAttribute('data-share-url') as string;
    expect(shareUrl).toContain('ref=ABC234');
    for (const pii of ['Alice', 'Dana', 'so proud of her', 'secret-share-token-xyz']) {
      expect(href).not.toContain(pii);
      expect(shareUrl).not.toContain(pii);
    }
  });

  // AC (regression): the pre-submit form is unchanged — reactions, message field,
  // submit all work, and a successful submit records the reaction via
  // POST /api/parent-reactions with the expected payload.
  it('still records the reaction via POST /api/parent-reactions on submit', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    render(
      <ParentReactionForm
        shareToken="tok-abc"
        playerFirstName="Alice"
        coachName="Rivera"
        referralCode="ABC234"
      />
    );
    await submitReaction({ message: 'great session' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/parent-reactions');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.share_token).toBe('tok-abc');
    expect(body.message).toBe('great session');
    expect(typeof body.reaction).toBe('string');
  });

  // AC: before submit, the success-screen actions do NOT render (they belong to
  // the success state only — the pre-submit form is untouched).
  it('does not render the viral actions before a successful submit', () => {
    render(
      <ParentReactionForm
        shareToken="tok-abc"
        playerFirstName="Alice"
        coachName="Rivera"
        referralCode="ABC234"
      />
    );
    expect(screen.queryByRole('link', { name: /start your own team/i })).toBeNull();
    expect(
      screen.queryByRole('button', { name: /share .* with the other parents/i })
    ).toBeNull();
  });
});

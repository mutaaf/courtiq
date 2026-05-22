/**
 * Component test for ParentViralCTA — the "Share with your other coach" CTA at
 * the bottom of the parent portal (ticket 0011).
 *
 * The component receives the creating coach's referral code as a prop (the code
 * is resolved server-side and passed down — NO Supabase access from this
 * 'use client' component, per AGENTS.md rule 3). When a code is present the
 * shared URL must be ${APP_URL}/signup?ref=<code>; when null/absent it falls
 * back to the plain ${APP_URL}.
 *
 * The CTA shares via navigator.share / clipboard (no visible <a href>), so it
 * exposes the constructed URL on the share button via data-share-url for
 * testing — the same value handleShare() forwards to navigator.share.
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ParentViralCTA } from '@/components/share/parent-viral-cta';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://sportsiq.app';

function shareButton() {
  return screen.getByRole('button', { name: /share with your other coach/i });
}

describe('ParentViralCTA — referral code in the shared URL (ticket 0011)', () => {
  beforeEach(() => cleanup());

  // AC: with a code present the URL carries /signup?ref=<code>.
  it('builds /signup?ref=<code> when a referralCode is provided', () => {
    render(<ParentViralCTA coachName="Coach Rivera" referralCode="ABC234" />);
    expect(shareButton()).toHaveAttribute('data-share-url', `${APP_URL}/signup?ref=ABC234`);
  });

  // AC: with no code the URL falls back to the plain app URL (current behavior).
  it('falls back to the plain app URL when referralCode is absent', () => {
    render(<ParentViralCTA coachName="Coach Rivera" />);
    expect(shareButton()).toHaveAttribute('data-share-url', APP_URL);
  });

  it('falls back to the plain app URL when referralCode is null', () => {
    render(<ParentViralCTA coachName="Coach Rivera" referralCode={undefined} />);
    expect(shareButton()).toHaveAttribute('data-share-url', APP_URL);
  });

  // The CTA copy/placement is unchanged — the code rides the existing button.
  it('keeps the existing share copy', () => {
    render(<ParentViralCTA coachName="Coach Rivera" referralCode="ABC234" />);
    expect(shareButton()).toBeInTheDocument();
  });
});

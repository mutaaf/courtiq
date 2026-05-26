/**
 * Component tests for AIUpgradePrompt — the card shown in place of an AI feature
 * when the server returns 402 { upgrade:true } at the free-tier monthly quota.
 *
 * Ticket 0035 threads an optional `resume` token (and a human label) through the
 * upgrade links so the blocked action survives the Stripe round-trip and the
 * post-checkout landing finishes the exact artifact. These specs assert:
 *  - with a resume, BOTH upgrade links carry ?resume=<encoded token>;
 *  - without a resume, the links are today's bare /settings/upgrade (regression);
 *  - with resume + label, the headline/CTA name the blocked artifact;
 *  - the copy never uses the AGENTS.md banned hype words.
 *
 * next/link renders a real <a href>, so the URL is asserted directly by href.
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AIUpgradePrompt } from '@/components/ui/ai-upgrade-prompt';

const TEAM_ID = '00000000-0000-4000-a000-000000000020';
const PLAYER_ID = '00000000-0000-4000-a000-000000000030';
const RESUME = `parent_report:${TEAM_ID}:${PLAYER_ID}`;

// AGENTS.md rule 7 — banned marketing words on coach surfaces.
const BANNED = ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy', 'unlock your potential'];

function upgradeLinks() {
  return screen.getAllByRole('link').map((a) => a.getAttribute('href'));
}

describe('AIUpgradePrompt — resume threading (ticket 0035)', () => {
  beforeEach(() => cleanup());

  it('appends ?resume=<encoded token> to every upgrade link when a resume is given', () => {
    render(<AIUpgradePrompt resume={RESUME} resumeLabel="Maya's report" />);
    const hrefs = upgradeLinks();
    expect(hrefs.length).toBeGreaterThanOrEqual(2);
    for (const href of hrefs) {
      expect(href).toContain('/settings/upgrade?resume=');
      expect(href).toContain(encodeURIComponent(RESUME));
    }
  });

  it('uses the bare /settings/upgrade links when NO resume is given (unchanged)', () => {
    render(<AIUpgradePrompt />);
    const hrefs = upgradeLinks();
    expect(hrefs.length).toBeGreaterThanOrEqual(2);
    for (const href of hrefs) {
      expect(href).toBe('/settings/upgrade');
    }
  });

  it('names the blocked artifact in the CTA when resume + label are supplied', () => {
    render(<AIUpgradePrompt resume={RESUME} resumeLabel="Maya's report" />);
    // The primary CTA button names the exact artifact to finish.
    expect(screen.getByRole('button', { name: /finish maya's report/i })).toBeInTheDocument();
  });

  it('falls back to the generic "Upgrade to Coach" CTA without a resume label', () => {
    render(<AIUpgradePrompt />);
    expect(screen.getByRole('button', { name: /upgrade to coach/i })).toBeInTheDocument();
  });

  it('never uses AGENTS.md banned hype words in the rendered copy', () => {
    const { container } = render(<AIUpgradePrompt resume={RESUME} resumeLabel="Maya's report" />);
    const text = (container.textContent || '').toLowerCase();
    for (const word of BANNED) {
      expect(text, word).not.toContain(word);
    }
  });
});

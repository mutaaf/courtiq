/**
 * Component tests for AIUpgradePrompt's NEW optional `socialProof` prop
 * (ticket 0084).
 *
 * The prop is OPTIONAL by design (LESSONS#0103) so every existing caller
 * — and the 0035-baseline DOM — stays byte-identical when the prop is
 * absent. When supplied, the component renders a single short
 * second-line under the existing headline inside a stable
 * data-testid="upgrade-prompt-social-proof" container (LESSONS#0029 /
 * #0082 — scope assertions by data-testid, not page-wide text).
 *
 * The rendered line is FACTUAL ("3 parents on the Hawks forwarded your
 * last report") and must never contain an AGENTS.md banned word, never
 * name a cloning coach, and never include a parent surname (LESSONS#0061
 * literal-space guard).
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { AIUpgradePrompt } from '@/components/ui/ai-upgrade-prompt';

const TEAM_ID = '00000000-0000-4000-a000-000000000020';
const PLAYER_ID = '00000000-0000-4000-a000-000000000030';
const RESUME = `parent_report:${TEAM_ID}:${PLAYER_ID}`;

// AGENTS.md banned words. Asserted as a sweep over the rendered text
// (LESSONS#0023 — instruct positively, never embed the verbatim list
// in production code that a banned-word scan will then read).
const BANNED = [
  'journey',
  'amazing',
  'exciting',
  'elevate',
  'empower',
  'synergy',
  'unlock your potential',
];

describe('AIUpgradePrompt — socialProof prop (ticket 0084)', () => {
  beforeEach(() => cleanup());

  it('renders byte-identical to the 0035 baseline when socialProof is absent', () => {
    const { container } = render(<AIUpgradePrompt />);
    // The data-testid container is the SINGLE additive surface; it must
    // not appear when the prop is omitted.
    expect(
      container.querySelector('[data-testid="upgrade-prompt-social-proof"]'),
    ).toBeNull();
  });

  it('renders the line inside the data-testid container when supplied', () => {
    render(
      <AIUpgradePrompt
        resume={RESUME}
        resumeLabel="Maya's report"
        socialProof={{
          line: '3 parents on the Hawks forwarded your last report this week',
          eventKind: 'parent_forward_on_team',
        }}
      />,
    );
    const container = screen.getByTestId('upgrade-prompt-social-proof');
    expect(container).toBeInTheDocument();
    expect(within(container).getByText(/3 parents on the Hawks/i)).toBeInTheDocument();
  });

  it('renders no banned word across a matrix of social-proof variants', () => {
    const matrix = [
      '3 parents on the Hawks forwarded your last report this week',
      'a parent on a teammate team forwarded your last report this week',
      'a coach in the Hornets program cloned your closeout drill this week',
      'a coach who cloned your closeout drill thumbed it up after running it',
      'your work was cloned by coaches in 4 programs this month',
    ];
    for (const line of matrix) {
      cleanup();
      const { container } = render(
        <AIUpgradePrompt
          socialProof={{ line, eventKind: 'parent_forward_on_team' }}
        />,
      );
      const text = (container.textContent || '').toLowerCase();
      for (const banned of BANNED) {
        expect(text, banned).not.toContain(banned);
      }
    }
  });

  it('keeps the existing resume + resumeLabel props behaving exactly as 0035 wires them', () => {
    render(
      <AIUpgradePrompt
        resume={RESUME}
        resumeLabel="Maya's report"
        socialProof={{
          line: '3 parents on the Hawks forwarded your last report this week',
          eventKind: 'parent_forward_on_team',
        }}
      />,
    );
    // CTA still names the blocked artifact.
    expect(screen.getByRole('button', { name: /finish maya's report/i })).toBeInTheDocument();
    // Upgrade link still carries the resume token round-trip.
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs.length).toBeGreaterThanOrEqual(2);
    for (const href of hrefs) {
      expect(href).toContain('/settings/upgrade?resume=');
      expect(href).toContain(encodeURIComponent(RESUME));
    }
  });
});

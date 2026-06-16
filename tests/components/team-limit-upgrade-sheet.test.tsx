/**
 * Ticket 0086 — TeamLimitUpgradeSheet renders on a structured
 * tier_limit_max_teams 4xx, names the attempted team + (when present) the
 * inviting coach, lists the upgrade benefits pulled from the existing
 * UpgradeGate FEATURE_CONFIG copy (DRY), and routes to /settings/upgrade with
 * the 0035 resume primitive's new `join_team` kind.
 *
 * Acceptance criteria → tests:
 *   (i)   free → Coach scenario renders Coach copy + named team + named inviter
 *   (ii)  free → Coach scenario without invitedBy renders the named team only
 *   (iii) Coach → Org scenario renders the Org copy + named team
 *   (iv)  Pro → Org scenario renders the same Org copy
 *   (v)   "Upgrade and join" href contains `resume=join_team:<teamId>`
 *   (vi)  "Maybe later" closes the sheet without side effect
 *   (vii) No AGENTS.md banned word across the fixture matrix
 *
 * .test.tsx NOT .spec.tsx (LESSONS#38). data-testid scoping (LESSONS#0029 / #0082).
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { TeamLimitUpgradeSheet, type TierLimitBody } from '@/components/team/team-limit-upgrade-sheet';

const TEAM_ID = '00000000-0000-4000-a000-000000000200';

const FREE_TO_COACH_NAMED_INVITER: TierLimitBody = {
  error: 'Your free plan allows up to 1 team. Please upgrade to add more teams.',
  upgrade: true,
  code: 'tier_limit_max_teams',
  currentCount: 1,
  maxCount: 1,
  attemptedTeamName: 'Hawks U12',
  attemptedTeamId: TEAM_ID,
  currentTier: 'free',
  invitedBy: { firstName: 'Mike', role: 'assistant_coach' },
  // The hook forwards the original inviteCoachId so the resume handler can
  // re-fire the join with the same invite context post-Stripe.
  inviteCoachId: 'mike-inviter-1',
};

const FREE_TO_COACH_NO_INVITER: TierLimitBody = {
  error: 'Your free plan allows up to 1 team. Please upgrade to add more teams.',
  upgrade: true,
  code: 'tier_limit_max_teams',
  currentCount: 1,
  maxCount: 1,
  attemptedTeamName: 'Falcons U14',
  attemptedTeamId: TEAM_ID,
  currentTier: 'free',
};

const COACH_TO_ORG: TierLimitBody = {
  error: 'Your coach plan allows up to 3 teams. Please upgrade to add more teams.',
  upgrade: true,
  code: 'tier_limit_max_teams',
  currentCount: 3,
  maxCount: 3,
  attemptedTeamName: 'Spartans U16',
  attemptedTeamId: TEAM_ID,
  currentTier: 'coach',
};

const PRO_TO_ORG: TierLimitBody = {
  error: 'Your pro_coach plan allows up to 999 teams. Please upgrade to add more teams.',
  upgrade: true,
  code: 'tier_limit_max_teams',
  currentCount: 999,
  maxCount: 999,
  attemptedTeamName: 'Titans U18',
  attemptedTeamId: TEAM_ID,
  currentTier: 'pro_coach',
};

// AGENTS.md banned words. The voice contract bans these on every new
// user-facing string. We scan the rendered sheet across every variant.
const BANNED = ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy'];

beforeEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('TeamLimitUpgradeSheet (ticket 0086)', () => {
  it('(i) free → Coach: names the attempted team AND the inviting coach', () => {
    render(<TeamLimitUpgradeSheet body={FREE_TO_COACH_NAMED_INVITER} onClose={() => {}} />);
    const sheet = screen.getByTestId('team-limit-upgrade-sheet');
    expect(sheet).toBeInTheDocument();
    expect(sheet.textContent).toContain('Hawks U12');
    expect(sheet.textContent).toContain('Mike');
    // Coach-tier upgrade copy + price.
    expect(sheet.textContent).toContain('Coach');
    expect(sheet.textContent).toContain('9.99');
  });

  it('(ii) free → Coach: WITHOUT inviter renders only the named team', () => {
    render(<TeamLimitUpgradeSheet body={FREE_TO_COACH_NO_INVITER} onClose={() => {}} />);
    const sheet = screen.getByTestId('team-limit-upgrade-sheet');
    expect(sheet.textContent).toContain('Falcons U14');
    // Inviter name never made up.
    expect(sheet.textContent).not.toContain('Mike');
    expect(sheet.textContent).toContain('9.99');
  });

  it('(iii) Coach → Org: names the team and renders the Organization-tier price', () => {
    render(<TeamLimitUpgradeSheet body={COACH_TO_ORG} onClose={() => {}} />);
    const sheet = screen.getByTestId('team-limit-upgrade-sheet');
    expect(sheet.textContent).toContain('Spartans U16');
    expect(sheet.textContent).toContain('Organization');
    expect(sheet.textContent).toContain('$49.99');
    // Coach-tier price $9.99 must not leak into the Org copy — anchor on the
    // dollar prefix so the "9.99" substring of "$49.99" doesn't false-positive
    // (same family as LESSONS#0082 — anchor on a stable shape, not a fragment).
    expect(sheet.textContent).not.toContain('$9.99');
  });

  it('(iv) Pro → Org: same Org-tier copy + price as Coach → Org', () => {
    render(<TeamLimitUpgradeSheet body={PRO_TO_ORG} onClose={() => {}} />);
    const sheet = screen.getByTestId('team-limit-upgrade-sheet');
    expect(sheet.textContent).toContain('Titans U18');
    expect(sheet.textContent).toContain('Organization');
    expect(sheet.textContent).toContain('49.99');
  });

  it('(v) primary CTA href contains resume=join_team:<teamId>', () => {
    render(<TeamLimitUpgradeSheet body={FREE_TO_COACH_NAMED_INVITER} onClose={() => {}} />);
    const cta = screen.getByTestId('team-limit-upgrade-cta');
    const href = cta.getAttribute('href') ?? '';
    expect(href).toContain('/settings/upgrade');
    expect(href).toContain(`resume=join_team%3A${TEAM_ID}`);
  });

  it('(v.b) primary CTA carries the inviter id when present so the resume can re-fire the invited join', () => {
    render(<TeamLimitUpgradeSheet body={FREE_TO_COACH_NAMED_INVITER} onClose={() => {}} />);
    const cta = screen.getByTestId('team-limit-upgrade-cta');
    const href = cta.getAttribute('href') ?? '';
    // The resume kind itself is team-scoped, but we forward the inviter id as
    // a separate query param so the resume handler can re-issue the original
    // request shape post-upgrade.
    expect(href).toContain('inviteCoachId=');
  });

  it('(vi) "Maybe later" closes the sheet without side effect', () => {
    const onClose = vi.fn();
    render(<TeamLimitUpgradeSheet body={FREE_TO_COACH_NAMED_INVITER} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('team-limit-upgrade-dismiss'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('(vii) renders NO AGENTS.md banned word across every variant', () => {
    for (const body of [FREE_TO_COACH_NAMED_INVITER, FREE_TO_COACH_NO_INVITER, COACH_TO_ORG, PRO_TO_ORG]) {
      cleanup();
      render(<TeamLimitUpgradeSheet body={body} onClose={() => {}} />);
      const text = (screen.getByTestId('team-limit-upgrade-sheet').textContent ?? '').toLowerCase();
      for (const word of BANNED) {
        expect(text, `banned word "${word}" in variant`).not.toContain(word);
      }
    }
  });
});

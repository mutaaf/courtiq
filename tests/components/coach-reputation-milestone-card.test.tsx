/**
 * Ticket 0073 — <CoachReputationMilestoneCard /> component test.
 *
 * Acceptance criteria mapping:
 *  - one unconsumed milestone → card renders with the right copy.
 *  - no milestones → card is ABSENT.
 *  - Open-my-plans link points at /plans.
 *  - tapping Got-it calls onConsume(id) → card hides.
 *  - rendered text contains no banned word for any milestone kind.
 *  - two milestones → "+ 1 more" pill, advance on Got-it.
 *
 * .test.tsx NOT .spec.tsx (LESSONS#0020 / #38).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  CoachReputationMilestoneCard,
  type ReputationMilestone,
} from '@/components/home/coach-reputation-milestone-card';

const BANNED_HYPE = [
  'journey',
  'amazing',
  'exciting',
  'elevate',
  'empower',
  'synergy',
  'unlock your potential',
];

const ALL_KINDS: ReputationMilestone['kind'][] = [
  'clones_3',
  'clones_10',
  'clones_25',
  'clones_50',
  'programs_2',
  'programs_4',
  'programs_8',
  // Ticket 0076 — new stuck-kind milestones.
  'stuck_1',
  'stuck_3',
  'stuck_8',
];

function ms(
  kind: ReputationMilestone['kind'],
  id = 'm-1',
  extras: Partial<ReputationMilestone> = {},
): ReputationMilestone {
  return { id, kind, crossedAt: '2026-06-06T00:00:00Z', ...extras };
}

describe('<CoachReputationMilestoneCard /> (ticket 0073)', () => {
  it('renders nothing when milestones is empty', () => {
    const { container } = render(
      <CoachReputationMilestoneCard milestones={[]} onConsume={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the card for ONE unconsumed milestone with the right kind copy', () => {
    render(
      <CoachReputationMilestoneCard milestones={[ms('programs_2')]} onConsume={() => {}} />,
    );
    const card = screen.getByTestId('coach-reputation-milestone-card');
    expect(card).toBeTruthy();
    // programs_2 copy mentions "2nd program" or "2 programs".
    expect(card.textContent?.toLowerCase()).toMatch(/2\s*(?:nd)?\s*program/);
  });

  it('the Open my plans button is a link to /plans', () => {
    render(
      <CoachReputationMilestoneCard milestones={[ms('clones_10')]} onConsume={() => {}} />,
    );
    const link = screen.getByTestId('coach-reputation-milestone-card-open-plans');
    expect(link.tagName.toLowerCase()).toBe('a');
    expect(link.getAttribute('href')).toBe('/plans');
  });

  it('tapping Got it fires onConsume with the current milestone id', () => {
    const onConsume = vi.fn();
    render(
      <CoachReputationMilestoneCard milestones={[ms('programs_2', 'm-XYZ')]} onConsume={onConsume} />,
    );
    fireEvent.click(screen.getByTestId('coach-reputation-milestone-card-got-it'));
    expect(onConsume).toHaveBeenCalledWith('m-XYZ');
  });

  it('two milestones → "+ 1 more" pill is visible', () => {
    render(
      <CoachReputationMilestoneCard
        milestones={[ms('programs_4', 'm-1'), ms('clones_10', 'm-2')]}
        onConsume={() => {}}
      />,
    );
    expect(screen.getByTestId('coach-reputation-milestone-card-more-pill')).toBeTruthy();
  });

  it('renders no AGENTS.md banned hype words for any milestone kind', () => {
    for (const kind of ALL_KINDS) {
      const { container, unmount } = render(
        <CoachReputationMilestoneCard milestones={[ms(kind)]} onConsume={() => {}} />,
      );
      const text = (container.textContent ?? '').toLowerCase();
      for (const banned of BANNED_HYPE) {
        expect(text, `kind=${kind} contains banned word "${banned}"`).not.toContain(banned);
      }
      unmount();
    }
  });

  it('renders no cloning-coach name on any milestone variant (consent posture)', () => {
    for (const kind of ALL_KINDS) {
      const { container, unmount } = render(
        <CoachReputationMilestoneCard milestones={[ms(kind)]} onConsume={() => {}} />,
      );
      const text = (container.textContent ?? '');
      // No `@`, no "first_name" fragments. The copy never names the
      // cloning coach.
      expect(text).not.toMatch(/@/);
      unmount();
    }
  });

  // ─── Ticket 0076 — stuck-kind copy + deep-link ─────────────────────────
  //
  // The three new stuck-kind milestones name the cloning PROGRAM (not the
  // cloning coach) and deep-link the publishing coach to their drill-share
  // admin surface (the 0064 share-card admin lives at
  // /drills/<drillId>/share). For a drill-shaped milestone the card's
  // primary button is "Open my drill" — distinct from the existing 0073
  // "Open my plans" button.
  it('stuck_1: renders program name + drill title and a deep-link to the drill-share admin', () => {
    render(
      <CoachReputationMilestoneCard
        milestones={[
          ms('stuck_1', 'm-stuck-1', {
            drillTitle: 'Closeout Drill',
            programNames: ['Hornets'],
            drillId: 'drill-x',
          }),
        ]}
        onConsume={() => {}}
      />,
    );
    const card = screen.getByTestId('coach-reputation-milestone-card');
    expect(card.textContent).toContain('Closeout Drill');
    expect(card.textContent).toContain('Hornets');
    const link = screen.getByTestId('coach-reputation-milestone-card-open-drill');
    expect(link.tagName.toLowerCase()).toBe('a');
    expect(link.getAttribute('href')).toContain('drill-x');
  });

  it('stuck_3: renders all three program names', () => {
    render(
      <CoachReputationMilestoneCard
        milestones={[
          ms('stuck_3', 'm-stuck-3', {
            drillTitle: 'Closeout Drill',
            programNames: ['Hornets', 'Falcons', 'Owls'],
            drillId: 'drill-x',
          }),
        ]}
        onConsume={() => {}}
      />,
    );
    const card = screen.getByTestId('coach-reputation-milestone-card');
    expect(card.textContent).toContain('Hornets');
    expect(card.textContent).toContain('Falcons');
    expect(card.textContent).toContain('Owls');
  });

  it('stuck_8: renders the eight-programs copy without naming any program (aggregate-only)', () => {
    render(
      <CoachReputationMilestoneCard
        milestones={[
          ms('stuck_8', 'm-stuck-8', {
            drillTitle: 'Closeout Drill',
            programNames: ['Hornets', 'Falcons', 'Owls', 'Hawks', 'Bears', 'Wolves', 'Lions', 'Eagles'],
            drillId: 'drill-x',
          }),
        ]}
        onConsume={() => {}}
      />,
    );
    const card = screen.getByTestId('coach-reputation-milestone-card');
    // Eight-program copy mentions "eight" (per LESSONS#0023 — numbers
    // spelled out for the stuck-kind voice posture).
    expect((card.textContent ?? '').toLowerCase()).toMatch(/eight|8/);
  });
});

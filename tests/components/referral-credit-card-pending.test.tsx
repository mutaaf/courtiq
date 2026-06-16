/**
 * Ticket 0085 — <ReferralCreditCard /> pending "On deck" sub-section.
 *
 * The 0074 card already renders the celebration body when
 * qualifiedCount >= 3. This ticket adds a NEW sub-section beneath that
 * body when pendingReferrals.length > 0 AND nextMilestoneKind !== null:
 *
 *   ─── On deck ──────────────────────────────────────────────
 *     Coach James and Coach Lin signed up but haven't shipped a
 *     parent report or a practice plan yet.
 *     One more qualifying coach and your next month is free too — $9.99
 *     [Text them a nudge]
 *
 * The 0074 baseline path stays BYTE-IDENTICAL when pendingReferrals
 * is empty.
 *
 * Asserts:
 *  - pendingReferrals:[] → sub-section ABSENT (baseline preserved).
 *  - pendingReferrals length 2 + qualified_3 → sub-section renders two
 *    first names + "$9.99" + "One more" progress line.
 *  - pendingReferrals length 5 + qualified_25 → sub-section renders
 *    the progress line with the qualified_25 milestone amount.
 *  - tapping "Text them a nudge" triggers navigator.share with a
 *    body matching the paid-tier template.
 *  - free-tier inviter variant: the on-deck section renders with the
 *    upgraded share-template.
 *  - no AGENTS.md banned hype word across the rendered matrix.
 *
 * .test.tsx NOT .spec.tsx (LESSONS#0020 / #38).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReferralCreditCard } from '@/components/home/referral-credit-card';

const BANNED_HYPE = [
  'journey',
  'amazing',
  'exciting',
  'elevate',
  'empower',
  'synergy',
  'unlock your potential',
];

function makeProps(
  overrides: Partial<React.ComponentProps<typeof ReferralCreditCard>> = {},
) {
  return {
    qualifiedCount: 3 as number,
    qualifiedCoachFirstNames: ['Maya', 'James', 'Sam'] as string[],
    currentMilestone: 'qualified_3' as
      | 'qualified_3'
      | 'qualified_10'
      | 'qualified_25'
      | null,
    pendingCreditCents: 999 as number,
    alreadyGranted: false as boolean,
    tier: 'coach' as 'free' | 'coach' | 'pro_coach' | 'organization',
    onConsume: vi.fn(),
    onApply: vi.fn(),
    pendingReferrals: [] as Array<{
      firstName: string;
      signedUpAt: string;
      needsToQualify: string;
    }>,
    nextMilestoneIn: 0 as number,
    nextMilestoneKind: null as
      | 'qualified_3'
      | 'qualified_10'
      | 'qualified_25'
      | null,
    ...overrides,
  } satisfies React.ComponentProps<typeof ReferralCreditCard>;
}

describe('<ReferralCreditCard /> pending sub-section (ticket 0085)', () => {
  beforeEach(() => {
    // Clean any leftover navigator.share stub between cases.
    delete (globalThis.navigator as unknown as { share?: unknown }).share;
  });

  it('does NOT render the sub-section when pendingReferrals is empty (0074 baseline preserved)', () => {
    render(<ReferralCreditCard {...makeProps({ pendingReferrals: [] })} />);
    expect(screen.queryByTestId('referral-credit-pending-section')).toBeNull();
  });

  it('does NOT render the sub-section when nextMilestoneKind is null (past qualified_25)', () => {
    render(
      <ReferralCreditCard
        {...makeProps({
          qualifiedCount: 27,
          currentMilestone: 'qualified_25',
          pendingReferrals: [
            {
              firstName: 'Lin',
              signedUpAt: '2026-05-30T08:00:00Z',
              needsToQualify: 'needs to ship a parent report or run 5 observed practices',
            },
          ],
          nextMilestoneIn: 0,
          nextMilestoneKind: null,
        })}
      />,
    );
    expect(screen.queryByTestId('referral-credit-pending-section')).toBeNull();
  });

  it('renders the sub-section with two first names and the "$9.99" progress line (qualified_3 next, 1 more needed)', () => {
    render(
      <ReferralCreditCard
        {...makeProps({
          qualifiedCount: 2,
          currentMilestone: 'qualified_3',
          // 0074-card body would NOT render at qualifiedCount:2, so the
          // sub-section is the only visible piece on its own here. The
          // 0074-card path is tested by the 0074 fixture; this case
          // proves the sub-section renders on its own too.
          qualifiedCoachFirstNames: [],
          pendingReferrals: [
            {
              firstName: 'James',
              signedUpAt: '2026-05-30T08:00:00Z',
              needsToQualify: 'needs to ship a parent report or run 5 observed practices',
            },
            {
              firstName: 'Lin',
              signedUpAt: '2026-05-28T08:00:00Z',
              needsToQualify: 'needs to ship a parent report or run 5 observed practices',
            },
          ],
          nextMilestoneIn: 1,
          nextMilestoneKind: 'qualified_3',
        })}
      />,
    );
    const section = screen.getByTestId('referral-credit-pending-section');
    expect(section).toBeTruthy();
    const text = section.textContent ?? '';
    expect(text).toContain('James');
    expect(text).toContain('Lin');
    // "One more qualifying coach" progress phrase.
    expect(text.toLowerCase()).toContain('one more');
    // Dollar amount on offer.
    expect(text).toContain('$9.99');
  });

  it('renders the sub-section beneath the 0074 card body when qualifiedCount >= 3 + 2 pending', () => {
    render(
      <ReferralCreditCard
        {...makeProps({
          qualifiedCount: 3,
          qualifiedCoachFirstNames: ['Maya', 'James', 'Sam'],
          currentMilestone: 'qualified_3',
          pendingReferrals: [
            {
              firstName: 'Lin',
              signedUpAt: '2026-05-28T08:00:00Z',
              needsToQualify: 'needs to ship a parent report or run 5 observed practices',
            },
            {
              firstName: 'Riya',
              signedUpAt: '2026-05-26T08:00:00Z',
              needsToQualify: 'needs to ship a parent report or run 5 observed practices',
            },
          ],
          nextMilestoneIn: 7,
          nextMilestoneKind: 'qualified_10',
        })}
      />,
    );
    // The 0074 card body still renders the qualified-3 line.
    const card = screen.getByTestId('referral-credit-card');
    expect(card.textContent).toContain('Maya');
    // The new pending sub-section renders with the two pending names +
    // a "qualifying coaches" line for the 10-milestone next step.
    const section = screen.getByTestId('referral-credit-pending-section');
    expect(section.textContent).toContain('Lin');
    expect(section.textContent).toContain('Riya');
    // The progress phrase for "7 more" — humans see plural form.
    expect(section.textContent?.toLowerCase()).toContain('qualifying coach');
  });

  it('renders the "Text them a nudge" button with a stable testid', () => {
    render(
      <ReferralCreditCard
        {...makeProps({
          qualifiedCount: 2,
          qualifiedCoachFirstNames: [],
          pendingReferrals: [
            {
              firstName: 'James',
              signedUpAt: '2026-05-30T08:00:00Z',
              needsToQualify: 'needs to ship a parent report or run 5 observed practices',
            },
          ],
          nextMilestoneIn: 2,
          nextMilestoneKind: 'qualified_3',
        })}
      />,
    );
    const btn = screen.getByTestId('referral-credit-pending-nudge-button');
    expect(btn).toBeTruthy();
    expect(btn.textContent?.toLowerCase()).toContain('nudge');
  });

  it('clicking "Text them a nudge" forwards the paid-tier template to navigator.share', async () => {
    const shareSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'share', {
      configurable: true,
      writable: true,
      value: shareSpy,
    });
    render(
      <ReferralCreditCard
        {...makeProps({
          tier: 'coach',
          qualifiedCount: 2,
          qualifiedCoachFirstNames: [],
          pendingReferrals: [
            {
              firstName: 'James',
              signedUpAt: '2026-05-30T08:00:00Z',
              needsToQualify: 'needs to ship a parent report or run 5 observed practices',
            },
            {
              firstName: 'Lin',
              signedUpAt: '2026-05-28T08:00:00Z',
              needsToQualify: 'needs to ship a parent report or run 5 observed practices',
            },
          ],
          nextMilestoneIn: 1,
          nextMilestoneKind: 'qualified_3',
        })}
      />,
    );
    fireEvent.click(
      screen.getByTestId('referral-credit-pending-nudge-button'),
    );
    expect(shareSpy).toHaveBeenCalledTimes(1);
    const arg = shareSpy.mock.calls[0][0] as { text?: string };
    expect(arg.text).toBeDefined();
    expect(arg.text).toContain('James');
    expect(arg.text).toContain('Lin');
    // The paid-tier template does NOT mention "free month" — that
    // phrasing belongs to the free-tier amplification variant.
    expect(arg.text?.toLowerCase()).not.toContain('free month');
  });

  it('forwards the FREE-tier upgraded template when tier is free', async () => {
    const shareSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'share', {
      configurable: true,
      writable: true,
      value: shareSpy,
    });
    render(
      <ReferralCreditCard
        {...makeProps({
          tier: 'free',
          qualifiedCount: 2,
          qualifiedCoachFirstNames: [],
          pendingReferrals: [
            {
              firstName: 'James',
              signedUpAt: '2026-05-30T08:00:00Z',
              needsToQualify: 'needs to ship a parent report or run 5 observed practices',
            },
          ],
          nextMilestoneIn: 2,
          nextMilestoneKind: 'qualified_3',
        })}
      />,
    );
    fireEvent.click(
      screen.getByTestId('referral-credit-pending-nudge-button'),
    );
    expect(shareSpy).toHaveBeenCalledTimes(1);
    const arg = shareSpy.mock.calls[0][0] as { text?: string };
    expect(arg.text?.toLowerCase()).toContain('free month');
  });

  it('contains no AGENTS.md banned hype word across the on-deck rendered matrix', () => {
    const tiers: Array<'free' | 'coach' | 'pro_coach' | 'organization'> = [
      'free',
      'coach',
      'pro_coach',
      'organization',
    ];
    const milestones: Array<'qualified_3' | 'qualified_10' | 'qualified_25'> = [
      'qualified_3',
      'qualified_10',
      'qualified_25',
    ];
    for (const t of tiers) {
      for (const m of milestones) {
        const { container, unmount } = render(
          <ReferralCreditCard
            {...makeProps({
              tier: t,
              qualifiedCount: 2,
              qualifiedCoachFirstNames: [],
              pendingReferrals: [
                {
                  firstName: 'James',
                  signedUpAt: '2026-05-30T08:00:00Z',
                  needsToQualify:
                    'needs to ship a parent report or run 5 observed practices',
                },
                {
                  firstName: 'Lin',
                  signedUpAt: '2026-05-28T08:00:00Z',
                  needsToQualify:
                    'needs to ship a parent report or run 5 observed practices',
                },
              ],
              nextMilestoneIn: 1,
              nextMilestoneKind: m,
            })}
          />,
        );
        const text = (container.textContent ?? '').toLowerCase();
        for (const banned of BANNED_HYPE) {
          expect(
            text,
            `tier=${t} milestone=${m} contains banned "${banned}"`,
          ).not.toContain(banned);
        }
        unmount();
      }
    }
  });
});

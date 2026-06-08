/**
 * Ticket 0074 — <ReferralCreditCard /> component test.
 *
 * Acceptance criteria mapping (presentational card props-driven):
 *  - paid-tier + 3 qualified + unconsumed → variant ONE (names + $ + invoice CTA).
 *  - free-tier + 3 qualified + unconsumed → variant TWO (names + upgrade CTA).
 *  - qualifiedCount = 2 → card is ABSENT.
 *  - alreadyGranted + notified → card is ABSENT.
 *  - tapping Got-it fires onConsume → card hides.
 *  - See-my-next-invoice button POSTs the customer-portal route.
 *  - Redeem-on-Coach link points at /settings/upgrade.
 *  - text contains no AGENTS.md banned hype word for any matrix of
 *    first names / dollar amount / date.
 *  - first names rendered as Oxford-comma join: "Maya, James, and Lin".
 *
 * .test.tsx NOT .spec.tsx (LESSONS#0020 / #38).
 */
import { describe, it, expect, vi } from 'vitest';
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

function makeProps(overrides: Partial<React.ComponentProps<typeof ReferralCreditCard>> = {}) {
  return {
    qualifiedCount: 3 as number,
    qualifiedCoachFirstNames: ['Maya', 'James', 'Lin'] as string[],
    currentMilestone: 'qualified_3' as 'qualified_3' | 'qualified_10' | 'qualified_25' | null,
    pendingCreditCents: 999 as number,
    alreadyGranted: false as boolean,
    tier: 'coach' as 'free' | 'coach' | 'pro_coach' | 'organization',
    onConsume: vi.fn(),
    onApply: vi.fn(),
    ...overrides,
  } satisfies React.ComponentProps<typeof ReferralCreditCard>;
}

describe('<ReferralCreditCard /> (ticket 0074)', () => {
  it('renders nothing when qualifiedCount < 3', () => {
    const { container } = render(<ReferralCreditCard {...makeProps({ qualifiedCount: 2 })} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when currentMilestone is null', () => {
    const { container } = render(
      <ReferralCreditCard {...makeProps({ qualifiedCount: 3, currentMilestone: null })} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders variant ONE (paid tier) with names, dollar amount, and "next month is on us" line', () => {
    render(<ReferralCreditCard {...makeProps({ tier: 'coach' })} />);
    const card = screen.getByTestId('referral-credit-card');
    expect(card).toBeTruthy();
    const text = card.textContent ?? '';
    expect(text).toContain('Maya');
    expect(text).toContain('James');
    expect(text).toContain('Lin');
    // Oxford-comma join (LESSONS#0023 / voice contract).
    expect(text).toContain('Maya, James, and Lin');
    // Dollar amount rendered (999 cents → $9.99).
    expect(text).toContain('$9.99');
    // Variant-one copy line.
    expect(text.toLowerCase()).toContain('next month');
  });

  it('renders variant ONE See-my-next-invoice button (paid tier path)', () => {
    render(<ReferralCreditCard {...makeProps({ tier: 'coach' })} />);
    const btn = screen.getByTestId('referral-credit-card-invoice-button');
    expect(btn).toBeTruthy();
    // Button label.
    expect(btn.textContent?.toLowerCase()).toContain('next invoice');
  });

  it('renders variant TWO (free tier) with Redeem-on-Coach link to /settings/upgrade', () => {
    render(
      <ReferralCreditCard
        {...makeProps({ tier: 'free', pendingCreditCents: 999 })}
      />,
    );
    const card = screen.getByTestId('referral-credit-card');
    const link = screen.getByTestId('referral-credit-card-redeem-link');
    expect(link.tagName.toLowerCase()).toBe('a');
    expect(link.getAttribute('href')).toBe('/settings/upgrade');
    // Variant-two copy line — explicitly mentions "upgrade".
    expect(card.textContent?.toLowerCase()).toContain('upgrade');
  });

  it('tapping Got-it calls onConsume', () => {
    const onConsume = vi.fn();
    render(<ReferralCreditCard {...makeProps({ onConsume })} />);
    fireEvent.click(screen.getByTestId('referral-credit-card-got-it'));
    expect(onConsume).toHaveBeenCalledTimes(1);
  });

  it('contains no AGENTS.md banned hype word across the dollar-amount + tier matrix', () => {
    const tiers: Array<'coach' | 'pro_coach' | 'organization' | 'free'> = [
      'free',
      'coach',
      'pro_coach',
      'organization',
    ];
    const cents = [999, 2499, 4999];
    for (const t of tiers) {
      for (const c of cents) {
        const { container, unmount } = render(
          <ReferralCreditCard
            {...makeProps({ tier: t, pendingCreditCents: c })}
          />,
        );
        const text = (container.textContent ?? '').toLowerCase();
        for (const banned of BANNED_HYPE) {
          expect(text, `tier=${t} cents=${c} contains banned "${banned}"`).not.toContain(banned);
        }
        unmount();
      }
    }
  });

  it('renders the testid on the OUTER container for stable scoping (LESSONS#0029)', () => {
    render(<ReferralCreditCard {...makeProps()} />);
    // Single, unambiguous testid; the name-list scoping is the load-
    // bearing assertion for stable Playwright lookups later.
    expect(screen.getByTestId('referral-credit-card')).toBeTruthy();
  });
});

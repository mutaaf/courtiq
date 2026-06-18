/**
 * Ticket 0089 — <PaidCoachReceiptsCard /> component test.
 *
 * The card mounts on /home UNDER the daily-focus card. It renders ONLY
 * when the GET /api/coach/paid-receipts route returned `eligible: true`
 * AND the coach has not dismissed it.
 *
 * Acceptance criteria mapping:
 *  (i)   `eligible: false` → card ABSENT.
 *  (ii)  eligible at day 60 with full counters → renders the five
 *        counter lines AND the named program.
 *  (iii) eligible with 0 clones → renders without the clones line
 *        (silence on the unearned counter).
 *  (iv)  `nextMonthIndex: 3` → renders the month-3 copy.
 *  (v)   `nextMonthIndex: 4` → renders the month-4 copy.
 *  (vi)  tapping "Got it" POSTs the dismiss route.
 *  (vii) NO banned word across every counter / program / next-month
 *        variant (AGENTS.md voice).
 *  (viii) NO primary CTA / upgrade / renew button rendered.
 *  (ix)  NO orange accent class on the card root (zinc-500 stroke,
 *        per the ticket's anti-orange voice posture).
 *
 * .test.tsx NOT .spec.tsx (LESSONS#0020 / #0038).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PaidCoachReceiptsCard } from '@/components/home/paid-coach-receipts-card';
import type { PaidCoachReceiptsSummary } from '@/lib/paid-coach-receipts';

// AGENTS.md banned hype list + surface-specific scan additions
// (LESSONS#0023 — instruct positively; the test scans the rendered
// strings, never the source).
const BANNED_HYPE = [
  'journey',
  'amazing',
  'exciting',
  'elevate',
  'empower',
  'synergy',
  'unlock your potential',
];
const SURFACE_SPECIFIC_BAN = [
  'thank you',
  'appreciate',
  'we love',
  'incredible',
];

function eligiblePayload(over: Partial<PaidCoachReceiptsSummary> = {}): PaidCoachReceiptsSummary {
  return {
    eligible: true,
    daysSincePaid: 60,
    observationCount: 84,
    parentReportCount: 9,
    parentReadersThisMonth: 11,
    drillsClonedCount: 2,
    cloneProgramNames: ['Hornets'],
    arcWeeksCarried: 4,
    nextMonthIndex: 3,
    nextMonthCopyKey: 'month_3_arc_returning_players',
    ...over,
  };
}

describe('<PaidCoachReceiptsCard /> (ticket 0089)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('(i) eligible: false → card is absent', () => {
    const { container } = render(<PaidCoachReceiptsCard summary={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('(ii) eligible at day 60 with full counters renders the five counter lines AND the named program', () => {
    render(<PaidCoachReceiptsCard summary={eligiblePayload()} />);
    const card = screen.getByTestId('paid-coach-receipts-card');
    const text = card.textContent ?? '';
    // Headline names the integer day count.
    expect(text).toContain('60');
    // Five counter lines.
    expect(text).toContain('84');
    expect(text).toContain('9');
    expect(text).toContain('11');
    expect(text).toContain('2');
    expect(text).toContain('4');
    // Named program.
    expect(text).toContain('Hornets');
  });

  it('(iii) eligible with 0 clones → renders without the clones line', () => {
    render(
      <PaidCoachReceiptsCard
        summary={eligiblePayload({ drillsClonedCount: 0, cloneProgramNames: [] })}
      />,
    );
    const card = screen.getByTestId('paid-coach-receipts-card');
    const text = card.textContent ?? '';
    // The "0 of your drills cloned" line is silenced — the card does
    // not name an unearned counter.
    expect(text).not.toMatch(/0 of your drills cloned/i);
    expect(text).not.toMatch(/cloned by coaches/i);
  });

  it('(iv) nextMonthIndex: 3 → renders the month-3 returning-players copy', () => {
    render(<PaidCoachReceiptsCard summary={eligiblePayload({ nextMonthIndex: 3, nextMonthCopyKey: 'month_3_arc_returning_players' })} />);
    const text = screen.getByTestId('paid-coach-receipts-card').textContent ?? '';
    expect(text).toMatch(/month 3/i);
    expect(text).toMatch(/returning players/i);
  });

  it('(v) nextMonthIndex: 4 → renders the month-4 drill-canon copy', () => {
    render(<PaidCoachReceiptsCard summary={eligiblePayload({ nextMonthIndex: 4, nextMonthCopyKey: 'month_4_drill_canon_emergence' })} />);
    const text = screen.getByTestId('paid-coach-receipts-card').textContent ?? '';
    expect(text).toMatch(/month 4/i);
    expect(text).toMatch(/drill/i);
  });

  it('(vi) tapping "Got it" POSTs the dismiss route', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    render(<PaidCoachReceiptsCard summary={eligiblePayload()} />);
    fireEvent.click(screen.getByTestId('paid-coach-receipts-card-got-it'));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/coach/paid-receipts/dismiss');
    expect((init as RequestInit | undefined)?.method).toBe('POST');
  });

  it('(vii) NO banned word across every counter / program / next-month variant', () => {
    const variants: PaidCoachReceiptsSummary[] = [
      eligiblePayload(),
      eligiblePayload({ nextMonthIndex: 4, nextMonthCopyKey: 'month_4_drill_canon_emergence' }),
      eligiblePayload({ nextMonthIndex: 5, nextMonthCopyKey: 'month_5_program_arc_carrying' }),
      eligiblePayload({ drillsClonedCount: 0, cloneProgramNames: [] }),
      eligiblePayload({ cloneProgramNames: ['Hornets', 'Lions', 'Eagles'] }),
    ];
    for (const v of variants) {
      const { container, unmount } = render(<PaidCoachReceiptsCard summary={v} />);
      const text = (container.textContent ?? '').toLowerCase();
      for (const banned of BANNED_HYPE) {
        expect(text).not.toContain(banned);
      }
      for (const banned of SURFACE_SPECIFIC_BAN) {
        expect(text).not.toContain(banned);
      }
      // Defensive: no emoji, no exclamation marks (the card is a clipboard).
      expect(text).not.toMatch(/!/);
      unmount();
    }
  });

  it('(viii) NO primary CTA / upgrade / renew button rendered', () => {
    render(<PaidCoachReceiptsCard summary={eligiblePayload()} />);
    const card = screen.getByTestId('paid-coach-receipts-card');
    // Defensive: no element flagged as an upgrade CTA.
    expect(card.querySelectorAll('[data-cta="upgrade"]').length).toBe(0);
    // No "Upgrade", "Renew", "Renew now", "Subscribe" copy.
    const text = (card.textContent ?? '').toLowerCase();
    expect(text).not.toContain('upgrade');
    expect(text).not.toContain('renew');
    expect(text).not.toContain('subscribe');
  });

  it('(ix) NO orange accent class on the card root (zinc-500 stroke posture)', () => {
    const { container } = render(<PaidCoachReceiptsCard summary={eligiblePayload()} />);
    const card = screen.getByTestId('paid-coach-receipts-card');
    const cardClass = card.className;
    // The card root's className NEVER carries an orange-* class — orange
    // is reserved for ACTION surfaces; this is a RECEIPT.
    expect(cardClass).not.toMatch(/text-orange/);
    expect(cardClass).not.toMatch(/bg-orange/);
    expect(cardClass).not.toMatch(/border-orange/);
    expect(cardClass).not.toContain('#F97316');
    // The whole rendered tree also carries no orange accent.
    const allOrangey = container.querySelectorAll(
      '[class*="orange-500"], [class*="orange-400"], [class*="text-orange"]',
    );
    expect(allOrangey.length).toBe(0);
  });
});

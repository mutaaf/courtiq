/**
 * Ticket 0092 — /home `<RealCoCoachCard />`.
 *
 * Acceptance criteria mapping:
 *  (i)   eligible: false → card ABSENT.
 *  (ii)  eligible with 1 named helper → headline + line + primary button.
 *  (iii) eligible with 1 unnamed helper → fallback "Someone" copy.
 *  (iv)  ranDrill: true → renders the "and ran a drill" line.
 *  (v)   ranDrill: false → does NOT render the drill line.
 *  (vi)  primary button tap fires the share path with the helper's first name.
 *  (vii) secondary "Not yet" tap POSTs the dismiss route.
 *  (viii) NO banned word across every fixture variant.
 *  (ix)  rendered text passes the surname / minor-field regex sweep.
 *  (free-state) free coach → primary button WITHOUT the
 *               "free until your next renewal" sub-line.
 *  (paid-state) coach-tier active → primary button WITH the sub-line.
 *  (canceled) coach-tier canceled → primary button WITHOUT the sub-line.
 *
 * .test.tsx NOT .spec.tsx (LESSONS#0020 / #0038).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { RealCoCoachCard } from '@/components/home/real-co-coach-card';

const BANNED = [
  'journey',
  'amazing',
  'exciting',
  'elevate',
  'empower',
  'synergy',
  'co-coaching journey',
  'amazing helper',
  'incredible teammate',
  'level up your coaching',
  'your coaching squad',
];

function helper(opts: {
  helperIdentifier?: string;
  displayName?: string | null;
  openCount?: number;
  distinctPracticeCount?: number;
  ranDrill?: boolean;
  teamId?: string;
  teamName?: string;
  lastOpenAt?: string;
} = {}) {
  return {
    helperIdentifier: opts.helperIdentifier ?? 'aisha',
    displayName: opts.displayName === undefined ? 'Aisha' : opts.displayName,
    openCount: opts.openCount ?? 3,
    distinctPracticeCount: opts.distinctPracticeCount ?? 2,
    ranDrill: opts.ranDrill ?? true,
    teamId: opts.teamId ?? 'team-a',
    teamName: opts.teamName ?? 'U12 Hawks',
    lastOpenAt: opts.lastOpenAt ?? new Date().toISOString(),
  };
}

describe('<RealCoCoachCard /> (ticket 0092)', () => {
  beforeEach(() => {
    cleanup();
  });

  it('(i) eligible: false → card ABSENT', () => {
    const { container } = render(
      <RealCoCoachCard
        eligible={false}
        helpers={[]}
        tier="free"
        subscriptionStatus={null}
      />,
    );
    expect(container.querySelector('[data-testid="real-co-coach-card"]')).toBeNull();
  });

  it('(ii) eligible with 1 named helper → headline + line + primary button', () => {
    render(
      <RealCoCoachCard
        eligible={true}
        helpers={[helper()]}
        tier="free"
        subscriptionStatus={null}
      />,
    );
    const card = screen.getByTestId('real-co-coach-card');
    const text = card.textContent ?? '';
    expect(text).toContain('Aisha');
    expect(text).toContain("co-coaching with you");
    expect(text).toContain('3 times');
    expect(text).toContain('U12 Hawks');
    // The primary button names the helper.
    expect(
      screen.getByTestId('real-co-coach-card-primary').textContent ?? '',
    ).toContain('Aisha');
  });

  it('(iii) eligible with 1 unnamed helper → fallback "Someone" copy', () => {
    render(
      <RealCoCoachCard
        eligible={true}
        helpers={[helper({ displayName: null })]}
        tier="free"
        subscriptionStatus={null}
      />,
    );
    const text = screen.getByTestId('real-co-coach-card').textContent ?? '';
    expect(text).toContain('Someone');
    // The primary button falls back to generic copy.
    expect(
      screen.getByTestId('real-co-coach-card-primary').textContent ?? '',
    ).not.toContain('null');
  });

  it('(iv) ranDrill: true → renders the "ran a drill" line', () => {
    render(
      <RealCoCoachCard
        eligible={true}
        helpers={[helper({ ranDrill: true })]}
        tier="free"
        subscriptionStatus={null}
      />,
    );
    const text = screen.getByTestId('real-co-coach-card').textContent ?? '';
    expect(text.toLowerCase()).toContain('ran a drill');
  });

  it('(v) ranDrill: false → does NOT render the drill line', () => {
    render(
      <RealCoCoachCard
        eligible={true}
        helpers={[helper({ ranDrill: false })]}
        tier="free"
        subscriptionStatus={null}
      />,
    );
    const text = screen.getByTestId('real-co-coach-card').textContent ?? '';
    expect(text.toLowerCase()).not.toContain('ran a drill');
  });

  it('(vi) primary button tap fires the share path with the helper first name', async () => {
    // Mock navigator.share — the existing 0015 invite-coach pattern uses
    // navigator.share with a referral-URL message. The component carries
    // the helper's first name into the share text.
    const shareSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(global, 'navigator', {
      configurable: true,
      value: { share: shareSpy, clipboard: { writeText: vi.fn() } },
    });

    render(
      <RealCoCoachCard
        eligible={true}
        helpers={[helper()]}
        tier="free"
        subscriptionStatus={null}
        referralCode="ABC123"
      />,
    );
    fireEvent.click(screen.getByTestId('real-co-coach-card-primary'));
    await waitFor(() => expect(shareSpy).toHaveBeenCalledTimes(1));
    const arg = shareSpy.mock.calls[0][0] as { text: string };
    expect(arg.text).toContain('Aisha');
    expect(arg.text).toContain('U12 Hawks');
  });

  it('(vii) secondary "Not yet" tap POSTs the dismiss route', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    render(
      <RealCoCoachCard
        eligible={true}
        helpers={[helper()]}
        tier="free"
        subscriptionStatus={null}
      />,
    );
    fireEvent.click(screen.getByTestId('real-co-coach-card-dismiss'));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe('/api/coach/recurring-observers/dismiss');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      helperIdentifier: 'aisha',
      teamId: 'team-a',
    });
    fetchSpy.mockRestore();
  });

  it('(viii) NO banned word across every fixture variant', () => {
    const variants = [
      { eligible: true, helpers: [helper()], tier: 'free' as const, sub: null },
      {
        eligible: true,
        helpers: [helper({ displayName: null, ranDrill: false })],
        tier: 'free' as const,
        sub: null,
      },
      {
        eligible: true,
        helpers: [helper(), helper({ helperIdentifier: 'bess', displayName: 'Bess', teamId: 'team-b', teamName: 'U10 Falcons' })],
        tier: 'coach' as const,
        sub: 'active',
      },
      {
        eligible: true,
        helpers: [helper()],
        tier: 'coach' as const,
        sub: 'canceled',
      },
    ];
    for (const v of variants) {
      cleanup();
      render(
        <RealCoCoachCard
          eligible={v.eligible}
          helpers={v.helpers}
          tier={v.tier}
          subscriptionStatus={v.sub}
        />,
      );
      const text = (screen.getByTestId('real-co-coach-card').textContent ?? '').toLowerCase();
      for (const w of BANNED) {
        expect(text).not.toContain(w);
      }
    }
  });

  it('(ix) rendered text passes the surname / minor-field regex sweep', () => {
    // Plant a surname-shaped display name; the component should render
    // only the first name per LESSONS#0061 (literal space).
    render(
      <RealCoCoachCard
        eligible={true}
        helpers={[helper({ displayName: 'Aisha Walker' })]}
        tier="free"
        subscriptionStatus={null}
      />,
    );
    const text = screen.getByTestId('real-co-coach-card').textContent ?? '';
    expect(text).toContain('Aisha');
    // The literal-space surname scan must not surface "Walker" anywhere.
    expect(text).not.toContain('Walker');
    // No raw helper_identifier shape (hex-looking strings, UUIDs).
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
    // No jersey-shape (#23, jersey 23 — the AGENTS.md privacy posture).
    expect(text).not.toMatch(/#\d{1,2}\b/);
  });

  it('(free-state) free coach → primary button WITHOUT the free-until-renewal sub-line', () => {
    render(
      <RealCoCoachCard
        eligible={true}
        helpers={[helper()]}
        tier="free"
        subscriptionStatus={null}
      />,
    );
    const card = screen.getByTestId('real-co-coach-card');
    expect((card.textContent ?? '').toLowerCase()).not.toContain('free until your next renewal');
  });

  it('(paid-state) coach-tier active → primary button WITH the free-until-renewal sub-line', () => {
    render(
      <RealCoCoachCard
        eligible={true}
        helpers={[helper()]}
        tier="coach"
        subscriptionStatus="active"
      />,
    );
    const card = screen.getByTestId('real-co-coach-card');
    expect((card.textContent ?? '').toLowerCase()).toContain('free until your next renewal');
  });

  it('(canceled) coach-tier canceled → primary button WITHOUT the sub-line', () => {
    render(
      <RealCoCoachCard
        eligible={true}
        helpers={[helper()]}
        tier="coach"
        subscriptionStatus="canceled"
      />,
    );
    const card = screen.getByTestId('real-co-coach-card');
    expect((card.textContent ?? '').toLowerCase()).not.toContain('free until your next renewal');
  });

  it('renders up to 3 helpers in one card; a 4th is not surfaced', () => {
    const helpers = [
      helper({ helperIdentifier: 'a', displayName: 'Aisha' }),
      helper({ helperIdentifier: 'b', displayName: 'Bess' }),
      helper({ helperIdentifier: 'c', displayName: 'Cara' }),
      helper({ helperIdentifier: 'd', displayName: 'Dot' }),
    ];
    render(
      <RealCoCoachCard
        eligible={true}
        helpers={helpers}
        tier="free"
        subscriptionStatus={null}
      />,
    );
    const text = screen.getByTestId('real-co-coach-card').textContent ?? '';
    expect(text).toContain('Aisha');
    expect(text).toContain('Bess');
    expect(text).toContain('Cara');
    expect(text).not.toContain('Dot');
  });
});

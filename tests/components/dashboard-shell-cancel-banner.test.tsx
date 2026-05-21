/**
 * Component test for the DashboardShell cancellation banner.
 *
 * Implements: docs/backlog/0003-cancellation-flow-test.md (AC6)
 *
 * The amber "your plan expires on <date>" banner is the entire UX of the cancel
 * flow: a coach who cancels mid-season needs to know exactly when report-card access
 * ends so they can pull parent reports before then. This test mocks `useTier()` to
 * return the cancel-at-period-end state and asserts the banner renders the period-end
 * date and links to the billing/upgrade surface — and that it does NOT render in the
 * non-cancelling state (so a regression that always-shows or never-shows it fails).
 *
 * Reconciliation (also in the ticket's Implementation log): the ticket prose says the
 * date is formatted "MM/DD" and links to "the Billing Portal route". The REAL banner in
 * `dashboard-shell.tsx` formats with `toLocaleDateString(undefined, { month:'short',
 * day:'numeric', year:'numeric' })` (e.g. "Jun 1, 2026") and its CTA links to
 * `/settings/upgrade`. We assert the REAL rendered output, computing the expected date
 * string the same way the component does so the assertion is locale-stable in CI.
 *
 * Filename: vitest excludes `**\/*.spec.ts`; the ticket says `*.spec.tsx`. Named
 * `.test.tsx` so it actually gates. (LESSONS 2026-05-20.)
 *
 * The DashboardShell pulls in many browser-only hooks (sync engine, zustand store,
 * dynamic imports). We stub each dependency so the render is isolated to the banner
 * branch — the unit under test is the banner's conditional + copy + href, driven by
 * the values `useTier()` returns.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// ─── Hoisted tier state ────────────────────────────────────────────────────────
// The single knob each test turns: what useTier() returns. Hoisted so the vi.mock
// factory (hoisted above imports) can read it.
const tierState = vi.hoisted(() => ({
  current: {
    tier: 'coach' as string,
    subscriptionStatus: 'active' as string | null,
    cancelAtPeriodEnd: false as boolean,
    currentPeriodEnd: null as string | null,
  },
}));

vi.mock('@/hooks/use-tier', () => ({
  useTier: () => tierState.current,
}));

// ─── Stub the shell's other dependencies ───────────────────────────────────────

vi.mock('next/navigation', () => ({
  usePathname: () => '/home',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) =>
    React.createElement('img', { src, alt }),
}));

// next/dynamic returns a component that renders nothing — the QuickCapture/CommandPalette
// chunks are irrelevant to the banner.
vi.mock('next/dynamic', () => ({
  default: () => () => null,
}));

vi.mock('@/hooks/use-theme', () => ({
  useTheme: () => ({ theme: 'dark', toggleTheme: vi.fn() }),
}));

vi.mock('@/hooks/use-active-team', () => ({
  useActiveTeam: () => ({
    activeTeam: { id: 'team-1', name: 'Tigers' },
    sportSlug: 'soccer',
    activeTeamId: 'team-1',
    teams: [],
    coach: { id: 'coach-1' },
  }),
}));

vi.mock('@/hooks/use-sync-engine', () => ({ useSyncEngine: () => {} }));

vi.mock('@/hooks/use-prefetch-navigation', () => ({
  usePrefetchAdjacentPages: () => {},
  usePrefetchOnIntent: () => () => () => {},
}));

vi.mock('@/hooks/use-arrow-key-nav', () => ({
  useArrowKeyNav: () => ({ navRef: { current: null }, onKeyDown: vi.fn() }),
}));

vi.mock('@/components/layout/notification-bell', () => ({
  NotificationBell: () => null,
}));

vi.mock('@/components/layout/team-switcher', () => ({
  TeamSwitcher: () => null,
}));

vi.mock('@/components/layout/page-transition', () => ({
  PageTransition: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

vi.mock('@/components/ui/pwa-install-prompt', () => ({
  PwaInstallPrompt: () => null,
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('@/lib/api', () => ({
  query: vi.fn().mockResolvedValue([]),
  mutate: vi.fn().mockResolvedValue({ data: null, error: null }),
}));

// zustand store — return inert/false values; the banner doesn't depend on the store.
vi.mock('@/lib/store', () => ({
  useAppStore: (selector: (s: any) => unknown) =>
    selector({
      isRecording: false,
      practiceActive: false,
      practiceStartedAt: null,
      practiceSessionId: null,
      setPracticeActive: vi.fn(),
      setPracticeSessionId: vi.fn(),
      setPracticeStartedAt: vi.fn(),
    }),
}));

// Imported after the mocks are registered.
import { DashboardShell } from '@/components/layout/dashboard-shell';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const coach = {
  id: 'coach-1',
  full_name: 'Coach Rivera',
  organizations: { id: 'org-1', tier: 'coach' },
} as any;

function renderShell() {
  // Pass `children` in the props object (DashboardShell's Props requires it) so the
  // element type-checks; createElement's positional-children overload doesn't satisfy
  // a required `children` prop under tsc.
  return render(
    React.createElement(DashboardShell, {
      coach,
      children: React.createElement('div', null, 'page content'),
    })
  );
}

// A fixed period-end; format it the same way the component does so the assertion is
// locale/timezone-stable wherever CI runs.
const PERIOD_END_ISO = new Date(1_900_000_000 * 1000).toISOString();
const EXPECTED_DATE = new Date(PERIOD_END_ISO).toLocaleDateString(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

// DashboardShell is a large client module with many hooks + a deep mobile/desktop
// tree; rendering it in jsdom (even fully mocked) is slow — the first render after the
// module imports takes ~8-16s on CI's Node-20 runner. A generous suite timeout keeps
// the test honest (every assertion still runs) without flaking on the render cost.
describe('DashboardShell cancellation banner (ticket 0003, AC6)', () => {
  beforeEach(() => {
    cleanup();
  });

  // AC6: when useTier() reports cancel-at-period-end, the amber banner renders the
  // period-end date and links to the billing/upgrade surface.
  it('renders the period-end date and a billing CTA when cancel-at-period-end', () => {
    tierState.current = {
      tier: 'coach',
      subscriptionStatus: 'active',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: PERIOD_END_ISO,
    };

    renderShell();

    // The banner copy includes the formatted period-end date.
    expect(screen.getByText(new RegExp(`expires on ${EXPECTED_DATE}`))).toBeInTheDocument();

    // The CTA links to the in-app billing/upgrade surface.
    const cta = screen.getByRole('link', { name: /resubscribe to keep access/i });
    expect(cta).toHaveAttribute('href', '/settings/upgrade');
  });

  // Negative: a healthy active subscription (no cancel flag) shows NO cancel banner —
  // so a regression that always-renders the banner fails here.
  it('does NOT render the cancel banner for a healthy active subscription', () => {
    tierState.current = {
      tier: 'coach',
      subscriptionStatus: 'active',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: PERIOD_END_ISO,
    };

    renderShell();

    expect(screen.queryByText(/expires on/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /resubscribe to keep access/i })
    ).not.toBeInTheDocument();
  });

  // Negative: a past_due subscription suppresses the cancel banner (the past-due
  // warning takes precedence) — matches the real `subscriptionStatus !== 'past_due'`
  // guard, so the two billing banners never stack.
  it('suppresses the cancel banner when the subscription is past_due', () => {
    tierState.current = {
      tier: 'coach',
      subscriptionStatus: 'past_due',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: PERIOD_END_ISO,
    };

    renderShell();

    expect(
      screen.queryByRole('link', { name: /resubscribe to keep access/i })
    ).not.toBeInTheDocument();
    // The past-due warning is the one that shows instead.
    expect(
      screen.getByRole('link', { name: /update your payment method/i })
    ).toBeInTheDocument();
  });
}, 30_000);

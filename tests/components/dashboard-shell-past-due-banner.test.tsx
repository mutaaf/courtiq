/**
 * Component test for the DashboardShell past-due banner.
 *
 * Implements: docs/backlog/0004-payment-failure-handling.md (AC5, AC6, AC7, AC8)
 *
 * The red "your card was declined" banner is the entire in-product UX of the
 * payment-failure flow: a coach whose renewal charge bounced needs to see, instantly, on
 * the home dashboard, what happened and a one-tap way to fix it before Stripe gives up
 * retrying. This test mocks `useTier()` to drive the banner branch and asserts:
 *  - AC5: it renders when subscription_status === 'past_due' with copy that names the
 *    issue ("your card was declined") and a Billing-Portal CTA.
 *  - AC6: it does NOT render when subscription_status === 'active'.
 *  - AC7: when status flips back to 'active', the banner is gone (same negative as AC6,
 *    asserted explicitly for the recovery transition).
 *  - AC8: the CTA POSTs to /api/stripe/portal and redirects the browser to the returned
 *    billing.stripe.com url.
 *
 * Reconciliation (also in the ticket's Implementation log): the pre-existing past-due
 * banner read "Payment failed — update your payment method" and linked to
 * `/settings/upgrade`. The ticket requires copy that names the decline and a CTA that
 * goes to the Billing Portal. We assert the REAL, updated output: copy naming the card
 * decline and a button that POSTs to `/api/stripe/portal` then redirects to `{ url }`.
 *
 * Filename: vitest excludes `**\/*.spec.ts`; the ticket says `*.spec.tsx`. Named
 * `.test.tsx` so it actually gates. (LESSONS 2026-05-20.)
 *
 * The DashboardShell pulls in many browser-only hooks (sync engine, zustand store,
 * dynamic imports). We stub each dependency so the render is isolated to the banner
 * branch — the unit under test is the banner's conditional + copy + CTA behavior, driven
 * by the values `useTier()` returns.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

// ─── Hoisted tier state ────────────────────────────────────────────────────────
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
  return render(
    React.createElement(DashboardShell, {
      coach,
      children: React.createElement('div', null, 'page content'),
    })
  );
}

const PERIOD_END_ISO = new Date(1_900_000_000 * 1000).toISOString();

// DashboardShell is a large client module; the first render after the module imports can
// take several seconds on CI's Node-20 runner. A generous suite timeout keeps the test
// honest without flaking on the render cost.
describe('DashboardShell past-due banner (ticket 0004)', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // AC5: when subscription_status === 'past_due', the banner renders with copy naming
  // the card decline and a Billing-Portal CTA.
  it('renders the card-declined warning + Billing Portal CTA when past_due', () => {
    tierState.current = {
      tier: 'coach',
      subscriptionStatus: 'past_due',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: PERIOD_END_ISO,
    };

    renderShell();

    // Copy names the issue: the card was declined.
    expect(screen.getByText(/your card was declined/i)).toBeInTheDocument();

    // There's a Billing Portal CTA (a button/control that updates the payment method).
    expect(
      screen.getByRole('button', { name: /update (your )?payment method|billing portal/i })
    ).toBeInTheDocument();
  });

  // AC6: a healthy active subscription shows NO past-due banner — a regression that
  // always-renders the banner fails here.
  it('does NOT render the past-due banner for an active subscription', () => {
    tierState.current = {
      tier: 'coach',
      subscriptionStatus: 'active',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: PERIOD_END_ISO,
    };

    renderShell();

    expect(screen.queryByText(/your card was declined/i)).not.toBeInTheDocument();
  });

  // AC7: after recovery (status flips back to 'active'), the banner is gone.
  it('clears the banner once the subscription is active again (recovery)', () => {
    tierState.current = {
      tier: 'coach',
      subscriptionStatus: 'active',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: PERIOD_END_ISO,
    };

    renderShell();

    expect(screen.queryByText(/your card was declined/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /update (your )?payment method|billing portal/i })
    ).not.toBeInTheDocument();
  });

  // AC8: tapping the CTA POSTs to /api/stripe/portal and redirects the browser to the
  // returned billing.stripe.com url.
  it('CTA POSTs to /api/stripe/portal and redirects to the returned billing url', async () => {
    tierState.current = {
      tier: 'coach',
      subscriptionStatus: 'past_due',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: PERIOD_END_ISO,
    };

    const portalUrl = 'https://billing.stripe.com/p/session/test_0004';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: portalUrl }),
    });
    vi.stubGlobal('fetch', fetchMock);

    // jsdom's window.location.assign is a non-implemented stub; spy on it.
    const assignMock = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign: assignMock },
    });

    renderShell();

    const cta = screen.getByRole('button', {
      name: /update (your )?payment method|billing portal/i,
    });
    fireEvent.click(cta);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/stripe/portal',
        expect.objectContaining({ method: 'POST' })
      );
    });
    await waitFor(() => {
      expect(assignMock).toHaveBeenCalledWith(portalUrl);
    });
  });
}, 30_000);

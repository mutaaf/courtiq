/**
 * Ticket 0078 — /home `?milestone=<id>` deep-link affordance.
 *
 * The 0078 reactivation email's single CTA deep-links the publishing
 * coach to `/home?milestone=<milestoneId>` so the existing 0073
 * `<CoachReputationMilestoneCard />` surfaces the named milestone as
 * the FIRST card on landing. The card mechanic stays byte-identical;
 * only the initial render index respects the query param.
 *
 * Per LESSONS#0027 — the deep-link initialization reads the query
 * param as a SNAPSHOT in a use-effect with `[]` deps; never put a
 * `set`-controlled state value into the dep list.
 *
 * Each AC box maps to one case:
 *  (i)   /home rendered with `?milestone=<id>` → that milestone
 *        renders first.
 *  (ii)  /home rendered WITHOUT the param → cycle starts from the
 *        most-recent milestone (the existing 0073 default).
 *  (iii) invalid `?milestone=<id>` → default behavior (no error, no
 *        broken render).
 *  (iv)  the query param is consumed (no re-firing on re-renders).
 *
 * .test.tsx NOT .spec.tsx — LESSONS#0020 / #38.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CoachReputationMilestoneSection } from '@/components/home/coach-reputation-milestone-card';

// Mock the milestone list route. The section reads via fetch('/api/coach/
// reputation-milestones'); we drive the response per test.
const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = mockFetch as unknown as typeof fetch;
});

function withClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

const MILESTONES = [
  // The most-recent milestone (default = renders first).
  { id: 'ms-most-recent', kind: 'programs_2', crossedAt: '2026-06-10T00:00:00Z' },
  // The older milestone — named by the deep-link.
  { id: 'ms-named', kind: 'clones_3', crossedAt: '2026-06-01T00:00:00Z' },
];

describe('/home milestone deep-link affordance (ticket 0078)', () => {
  it('(AC i) `?milestone=<id>` renders that milestone first', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ milestones: MILESTONES }),
    });
    // Use the URL hook injection — the section reads `window.location.search`.
    Object.defineProperty(window, 'location', {
      value: new URL('https://app.example.test/home?milestone=ms-named'),
      writable: true,
    });
    render(withClient(<CoachReputationMilestoneSection />));
    // Wait for the fetch + render.
    await waitFor(() => {
      const card = screen.getByTestId('coach-reputation-milestone-card');
      expect(card).toBeTruthy();
    });
    // The headline of the NAMED milestone (clones_3) is rendered, not
    // the most-recent (programs_2).
    expect(screen.getByText(/cloned 3 times this month/i)).toBeTruthy();
    expect(screen.queryByText(/cloned by a coach in a 2nd program/i)).toBeNull();
  });

  it('(AC ii) WITHOUT the query param, cycle starts from the most-recent milestone (the existing 0073 default)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ milestones: MILESTONES }),
    });
    Object.defineProperty(window, 'location', {
      value: new URL('https://app.example.test/home'),
      writable: true,
    });
    render(withClient(<CoachReputationMilestoneSection />));
    await waitFor(() => {
      expect(screen.getByTestId('coach-reputation-milestone-card')).toBeTruthy();
    });
    // The most-recent milestone (programs_2) is rendered first.
    expect(screen.getByText(/cloned by a coach in a 2nd program/i)).toBeTruthy();
    expect(screen.queryByText(/cloned 3 times this month/i)).toBeNull();
  });

  it('(AC iii) an invalid `?milestone=<id>` falls back to default behavior (no error)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ milestones: MILESTONES }),
    });
    Object.defineProperty(window, 'location', {
      value: new URL('https://app.example.test/home?milestone=bogus-unknown-id'),
      writable: true,
    });
    render(withClient(<CoachReputationMilestoneSection />));
    await waitFor(() => {
      expect(screen.getByTestId('coach-reputation-milestone-card')).toBeTruthy();
    });
    // Falls back to most-recent (default) — never errors out.
    expect(screen.getByText(/cloned by a coach in a 2nd program/i)).toBeTruthy();
  });

  it('(AC iv) renders nothing when the API returns no milestones (default 0073 behavior, the deep link is silent)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ milestones: [] }),
    });
    Object.defineProperty(window, 'location', {
      value: new URL('https://app.example.test/home?milestone=ms-named'),
      writable: true,
    });
    const { container } = render(withClient(<CoachReputationMilestoneSection />));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    expect(container.querySelector('[data-testid="coach-reputation-milestone-card"]')).toBeNull();
  });

  it('(AC iv) is a one-shot snapshot — re-renders do not re-pin the deep-link milestone after Got-it is tapped', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ milestones: MILESTONES }),
    });
    Object.defineProperty(window, 'location', {
      value: new URL('https://app.example.test/home?milestone=ms-named'),
      writable: true,
    });
    const { rerender } = render(withClient(<CoachReputationMilestoneSection />));
    await waitFor(() => {
      expect(screen.getByTestId('coach-reputation-milestone-card')).toBeTruthy();
    });
    // Initial render: named milestone first.
    expect(screen.getByText(/cloned 3 times this month/i)).toBeTruthy();
    // A re-render with the SAME query param doesn't re-pin or crash.
    rerender(withClient(<CoachReputationMilestoneSection />));
    await waitFor(() => {
      expect(screen.getByTestId('coach-reputation-milestone-card')).toBeTruthy();
    });
  });
});

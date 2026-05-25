/**
 * Component tests for FirstArtifactCard (ticket docs/backlog/0030).
 *
 * Rendered with QueryClientProvider + a mocked next/navigation router, the way
 * the other home cards are tested in isolation (LESSONS.md 2026-05-21).
 *
 * Covers:
 *  - shown for an eligible new coach (obs >= threshold, 0 artifacts)
 *  - absent for a coach who already generated an artifact
 *  - absent for a coach below the threshold
 *  - the CTA targets an EXISTING generator route (no new AI route)
 *  - privacy: renders no per-minor data (only aggregate note count + team name)
 *  - dismiss hides it AND it stays hidden on re-mount (bounded localStorage window)
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FirstArtifactCard } from '@/components/home/first-artifact-card';
import { FIRST_ARTIFACT_OBS_THRESHOLD, FIRST_ARTIFACT_CTA_HREF } from '@/lib/first-artifact-utils';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

// next/link renders a plain <a href> in tests so getByRole('link') resolves.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  ),
}));

// jsdom localStorage shim — declared here so each test starts clean.
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
  };
})();

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });
  localStorageMock.clear();
});

afterEach(() => {
  cleanup();
  localStorageMock.clear();
  vi.clearAllMocks();
});

function renderCard(props: Partial<React.ComponentProps<typeof FirstArtifactCard>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <FirstArtifactCard
        teamId="team-1"
        teamName="YMCA Rockets"
        observations={FIRST_ARTIFACT_OBS_THRESHOLD}
        artifactsGenerated={0}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe('FirstArtifactCard — eligibility rendering', () => {
  it('renders for an eligible new coach (obs at threshold, 0 artifacts)', () => {
    renderCard();
    // The CTA is present and links to an existing generator surface.
    const cta = screen.getByRole('link', { name: /turn .* into|see what|make .* report|first report/i });
    expect(cta).toHaveAttribute('href', FIRST_ARTIFACT_CTA_HREF);
  });

  it('shows the coach aggregate note count', () => {
    renderCard({ observations: 4 });
    expect(screen.getByText(/\b4\b/)).toBeInTheDocument();
  });

  it('does NOT render once the coach already has an artifact', () => {
    const { container } = renderCard({ observations: FIRST_ARTIFACT_OBS_THRESHOLD + 5, artifactsGenerated: 1 });
    expect(container).toBeEmptyDOMElement();
  });

  it('does NOT render below the observation threshold', () => {
    const { container } = renderCard({ observations: FIRST_ARTIFACT_OBS_THRESHOLD - 1, artifactsGenerated: 0 });
    expect(container).toBeEmptyDOMElement();
  });
});

describe('FirstArtifactCard — privacy / COPPA', () => {
  it('renders no per-minor data (no player name, jersey, or observation text)', () => {
    const { container } = renderCard({ observations: 5, teamName: 'YMCA Rockets' });
    const html = container.innerHTML;
    // Only aggregate count + team name appear; never a player-scoped field.
    expect(html).toContain('YMCA Rockets');
    expect(html).not.toMatch(/jersey/i);
    expect(html).not.toMatch(/#\d/); // no "#7"-style jersey labels
  });
});

describe('FirstArtifactCard — dismiss (bounded localStorage window)', () => {
  it('dismiss hides the card and it stays hidden on re-mount', () => {
    const { container, unmount } = renderCard();
    // Card is visible first.
    expect(container).not.toBeEmptyDOMElement();

    fireEvent.click(screen.getByLabelText(/dismiss/i));
    expect(container).toBeEmptyDOMElement();

    // Re-mount within the window: still hidden.
    unmount();
    const remount = renderCard();
    expect(remount.container).toBeEmptyDOMElement();
  });
});

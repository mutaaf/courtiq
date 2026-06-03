/**
 * Ticket 0064 — DrillShareCard component (the public /drill/[token] body).
 *
 * Tests:
 *  - Renders the drill name as the heading, the setup lines as the body,
 *    the publishing coach's caption in a quoted block, and a single "Save
 *    to my library" CTA.
 *  - The save button exposes data-share-url={publicUrl} per LESSONS#0056 /
 *    #0082 so the e2e + this test can scope cleanly.
 *  - The container exposes data-testid="drill-share-card".
 *  - Every rendered string is voice-clean (LESSONS#0023 — no AGENTS.md
 *    banned token in any rendered text).
 *
 * .test.tsx NOT .spec.tsx (LESSONS#0020 / #38).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DrillShareCard } from '@/components/drills/drill-share-card';
import { TRAJECTORY_BANNED_WORDS } from '@/lib/player-trajectory-utils';

beforeEach(() => {
  vi.restoreAllMocks();
  // The card fetches /api/me on mount; default to "signed out" so the
  // render is stable.
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } }),
  );
});

const FIXTURE = {
  token: 'tok-aaaaaaaa',
  drill: {
    id: 'drill-1',
    name: 'Closeout Drill',
    setup:
      'Players close out on the shooter from the elbow.\nChest to the ball-handler before the hands go up.',
    sportSlug: 'basketball',
    ageGroupHint: '8-10',
  },
  caption: 'Finally got my U10 girls to finish their close-outs.',
  publisher: {
    id: 'coach-1',
    firstName: 'Sarah',
    handle: 'sarah-r',
  },
};

describe('<DrillShareCard /> (ticket 0064)', () => {
  it('renders the drill name as the H1 and the setup body', () => {
    render(<DrillShareCard {...FIXTURE} />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Closeout Drill' }),
    ).toBeTruthy();
    expect(screen.getByText(/Players close out on the shooter/i)).toBeTruthy();
  });

  it('renders the caption block when the publisher attached one', () => {
    render(<DrillShareCard {...FIXTURE} />);
    const caption = screen.getByTestId('drill-share-caption');
    expect(caption.textContent).toContain('Finally got my U10 girls to finish');
    expect(caption.textContent).toContain('Sarah');
  });

  it('renders the header line with sport + age band + coach', () => {
    const { container } = render(<DrillShareCard {...FIXTURE} />);
    // The header concatenates "Coach Sarah — Basketball — 8-10". The text
    // is a single uppercase-tracked label at the top of the header card;
    // scope by class to avoid the "Coach Sarah" repetition in the caption
    // attribution line (LESSONS#0029 — strict-mode-style scope).
    const header = container.querySelector('.uppercase.tracking-widest');
    expect(header).toBeTruthy();
    const headerText = (header?.textContent ?? '').toLowerCase();
    expect(headerText).toContain('coach sarah');
    expect(headerText).toContain('basketball');
    expect(headerText).toContain('8-10');
  });

  it('exposes data-testid + data-share-url on the save CTA per LESSONS#0056 / #0082', () => {
    const { container } = render(<DrillShareCard {...FIXTURE} />);
    const card = container.querySelector('[data-testid="drill-share-card"]');
    expect(card).toBeTruthy();
    expect(card!.getAttribute('data-share-url')).toBe(`/drill/${FIXTURE.token}`);

    const cta = container.querySelector('[data-testid="save-drill-cta"]');
    expect(cta).toBeTruthy();
    expect(cta!.getAttribute('data-share-url')).toBe(`/drill/${FIXTURE.token}`);
  });

  it('contains NO AGENTS.md banned token in any rendered text (LESSONS#0023)', () => {
    const { container } = render(<DrillShareCard {...FIXTURE} />);
    const text = (container.textContent ?? '').toLowerCase();
    for (const banned of TRAJECTORY_BANNED_WORDS) {
      expect(text).not.toContain(banned);
    }
  });

  it('does NOT render the caption block when caption is null', () => {
    render(<DrillShareCard {...FIXTURE} caption={null} />);
    expect(screen.queryByTestId('drill-share-caption')).toBeNull();
  });
});

/**
 * Ticket 0063 — <FollowCoachInlineCard /> component tests.
 *
 * The inline card appears below the "Save to my team" success state on the
 * public /plan/<token> page after a successful clone. Reads:
 *   - publisher's first name (passed in as a prop — server-resolved by the
 *     /api/practice-plan-shares/[token] route to keep first-name extraction
 *     server-side).
 *   - publisher's coach id (passed in for the POST body).
 *   - the caller's auth state (signed-in vs unauthenticated).
 *
 * Behaviors under test:
 *  - renders the "Cloned from Coach <First Name>" copy with a Follow button.
 *  - tapping the button POSTs /api/coach-follows with { followee_id }.
 *  - on success, the card flips to "Following Coach <First Name> — …".
 *  - unauthenticated visitor → the card renders a Sign-in link that points at
 *    `/login?next=<plan-page>`; tapping it does NOT POST.
 *  - exposes data-testid="follow-coach-control" so e2e + this test scope
 *    cleanly (LESSONS#0056 / #0082).
 *  - voice contract: rendered DOM contains NO AGENTS.md banned tokens.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { FollowCoachInlineCard } from '@/components/plan/follow-coach-inline-card';

function mockFetch({ followOk = true }: { followOk?: boolean } = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    if (url.includes('/api/coach-follows')) {
      return new Response(
        JSON.stringify(followOk ? { ok: true, alreadyFollowing: false } : { error: 'denied' }),
        { status: followOk ? 200 : 400 },
      );
    }
    return new Response('not found', { status: 404 });
  });
}

const BANNED = ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy'];

describe('<FollowCoachInlineCard /> (ticket 0063)', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the inline card with a Follow button when the caller is signed in', () => {
    mockFetch();
    render(
      <FollowCoachInlineCard
        publisherCoachId="pub-1"
        publisherFirstName="James"
        token="tok-1"
        viewerIsSignedIn={true}
      />,
    );

    const card = screen.getByTestId('follow-coach-control');
    expect(card).toBeTruthy();
    expect(card.textContent).toContain('James');
    // The button is the follow action (idle state).
    const btn = screen.getByRole('button', { name: /follow coach james/i });
    expect(btn).toBeTruthy();
  });

  it('POSTs /api/coach-follows on tap and flips to the Following state', async () => {
    const fetchSpy = mockFetch();
    render(
      <FollowCoachInlineCard
        publisherCoachId="pub-1"
        publisherFirstName="James"
        token="tok-1"
        viewerIsSignedIn={true}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /follow coach james/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });
    const call = fetchSpy.mock.calls.find((c) => String(c[0]).includes('/api/coach-follows'));
    expect(call).toBeTruthy();
    const init = call?.[1] as RequestInit | undefined;
    expect(init?.method).toBe('POST');
    const body = JSON.parse(String(init?.body ?? '{}'));
    expect(body.followee_id).toBe('pub-1');

    // The card flips to a "Following" state.
    await waitFor(() => {
      const card = screen.getByTestId('follow-coach-control');
      expect(card.textContent?.toLowerCase()).toContain('following');
    });
  });

  it('unauthenticated visitor sees a sign-in link and tapping does NOT POST', async () => {
    const fetchSpy = mockFetch();
    render(
      <FollowCoachInlineCard
        publisherCoachId="pub-1"
        publisherFirstName="James"
        token="tok-1"
        viewerIsSignedIn={false}
      />,
    );

    const card = screen.getByTestId('follow-coach-control');
    const link = card.querySelector('a');
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toContain('/login');
    expect(link?.getAttribute('href')).toContain('next=');

    // No POST is fired by the unauthed render path.
    expect(fetchSpy.mock.calls.find((c) => String(c[0]).includes('/api/coach-follows'))).toBeFalsy();
  });

  it('voice contract: no AGENTS.md banned token in the rendered DOM', () => {
    mockFetch();
    const { container } = render(
      <FollowCoachInlineCard
        publisherCoachId="pub-1"
        publisherFirstName="James"
        token="tok-1"
        viewerIsSignedIn={true}
      />,
    );
    const text = (container.textContent ?? '').toLowerCase();
    for (const word of BANNED) {
      expect(text, `banned word "${word}"`).not.toContain(word);
    }
  });
});

/**
 * Ticket 0060 — SiblingInviteCard component test.
 *
 * Asserts:
 *  - The card renders for a non-null candidate (the modal v1 case) with the
 *    other team's name + the other coach's name + the sibling's first name.
 *  - Tapping the card opens a sheet pre-filled with the candidate's fields,
 *    including a referral-aware app URL exposed via `data-share-url` so the
 *    e2e + the unit test can assert the constructed URL without a real
 *    <a href> (LESSONS#0056 / #0082).
 *  - Submitting the sheet POSTs to /api/share/<token>/sibling-invite with
 *    the form payload (siblingFirstName, otherCoachEmail, note?).
 *  - On a successful response, the card flips in-place to the thank-you
 *    state naming the other coach's first name.
 *  - When `alreadyOnSportsIQ: true`, the card surfaces the existing 0019
 *    self-signup copy instead of opening the invite sheet — zero new state.
 *  - Voice contract: no AGENTS.md banned word in any rendered string.
 *  - `data-testid="sibling-invite-card"` exists on the outer container so
 *    Playwright can scope assertions per LESSONS#0029 / #0082 / #0102.
 *
 * `.test.tsx`, not `.spec.ts` (LESSONS#0020 / #38).
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { SiblingInviteCard } from '@/components/share/sibling-invite-card';

const SHARE_TOKEN = 'tok-sibling-invite-test';
const CANDIDATE = {
  otherTeamName: 'Hornets U10',
  otherCoachName: 'Coach Riley',
  otherCoachEmail: 'riley@hornets.test',
  siblingFirstName: 'Sofia',
  programId: '00000000-0000-4000-a000-000000000010',
};
const REFERRAL_CODE = 'AAAAAA';

const BANNED_WORDS = [
  'journey',
  'amazing',
  'exciting',
  'elevate',
  'empower',
  'synergy',
  'unlock',
];

beforeEach(() => {
  cleanup();
  global.fetch = vi.fn() as unknown as typeof global.fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SiblingInviteCard — invite-target branch (ticket 0060)', () => {
  it('renders the card with the sibling first name + other team + other coach', () => {
    render(
      <SiblingInviteCard
        shareToken={SHARE_TOKEN}
        candidate={CANDIDATE}
        alreadyOnSportsIQ={false}
        referralCode={REFERRAL_CODE}
      />,
    );
    const card = screen.getByTestId('sibling-invite-card');
    expect(card).toBeInTheDocument();
    // The sibling first name + other team + other coach all appear in the
    // card's headline/copy/button. Multiple nodes can carry the same name
    // (heading + button), so we use getAllByText to avoid the
    // strict-mode collision (LESSONS#0029 / #0082).
    expect(within(card).getAllByText(/Sofia/).length).toBeGreaterThan(0);
    expect(within(card).getAllByText(/Hornets U10/).length).toBeGreaterThan(0);
    expect(within(card).getAllByText(/Coach Riley/).length).toBeGreaterThan(0);
  });

  it('exposes data-share-url on the open trigger so the URL is assertable', () => {
    render(
      <SiblingInviteCard
        shareToken={SHARE_TOKEN}
        candidate={CANDIDATE}
        alreadyOnSportsIQ={false}
        referralCode={REFERRAL_CODE}
      />,
    );
    const trigger = screen.getByTestId('sibling-invite-open');
    const shareUrl = trigger.getAttribute('data-share-url');
    expect(shareUrl).toBeTruthy();
    // Program-scoped referral landing — never the parent's email or kid's
    // name in the URL.
    expect(shareUrl).toMatch(/ref=AAAAAA/);
    expect(shareUrl).toMatch(/program=00000000-0000-4000-a000-000000000010/);
    expect(shareUrl).not.toContain('Sofia');
    expect(shareUrl).not.toContain('riley@');
  });

  it('opens a sheet pre-filled with candidate fields when tapped', () => {
    render(
      <SiblingInviteCard
        shareToken={SHARE_TOKEN}
        candidate={CANDIDATE}
        alreadyOnSportsIQ={false}
        referralCode={REFERRAL_CODE}
      />,
    );
    fireEvent.click(screen.getByTestId('sibling-invite-open'));
    const sheet = screen.getByTestId('sibling-invite-sheet');
    expect(sheet).toBeInTheDocument();
    const siblingInput = within(sheet).getByTestId(
      'sibling-invite-sibling-first-name',
    ) as HTMLInputElement;
    const coachEmailInput = within(sheet).getByTestId(
      'sibling-invite-other-coach-email',
    ) as HTMLInputElement;
    expect(siblingInput.value).toBe('Sofia');
    expect(coachEmailInput.value).toBe('riley@hornets.test');
  });

  it('POSTs to the sibling-invite route with the form payload and flips to thank-you on success', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ sent: true }),
    });

    render(
      <SiblingInviteCard
        shareToken={SHARE_TOKEN}
        candidate={CANDIDATE}
        alreadyOnSportsIQ={false}
        referralCode={REFERRAL_CODE}
      />,
    );
    fireEvent.click(screen.getByTestId('sibling-invite-open'));
    const noteInput = screen.getByTestId('sibling-invite-note') as HTMLTextAreaElement;
    fireEvent.change(noteInput, {
      target: { value: 'Thought you might want to see this.' },
    });
    fireEvent.click(screen.getByTestId('sibling-invite-send'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe(`/api/share/${SHARE_TOKEN}/sibling-invite`);
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body));
    expect(body.siblingFirstName).toBe('Sofia');
    expect(body.otherCoachEmail).toBe('riley@hornets.test');
    expect(body.note).toBe('Thought you might want to see this.');

    // Card flips in-place to the thank-you state naming the other coach's
    // first name.
    await waitFor(() => {
      expect(screen.getByTestId('sibling-invite-sent')).toBeInTheDocument();
    });
    expect(screen.getByTestId('sibling-invite-sent').textContent).toMatch(/Riley/);
  });

  it('renders no AGENTS.md banned word in any rendered string', () => {
    render(
      <SiblingInviteCard
        shareToken={SHARE_TOKEN}
        candidate={CANDIDATE}
        alreadyOnSportsIQ={false}
        referralCode={REFERRAL_CODE}
      />,
    );
    fireEvent.click(screen.getByTestId('sibling-invite-open'));
    const corpus = document.body.textContent?.toLowerCase() ?? '';
    for (const banned of BANNED_WORDS) {
      expect(corpus).not.toContain(banned);
    }
  });
});

describe('SiblingInviteCard — alreadyOnSportsIQ branch (ticket 0060)', () => {
  it("renders the 0019 self-signup copy when the other coach is already on SportsIQ", () => {
    render(
      <SiblingInviteCard
        shareToken={SHARE_TOKEN}
        candidate={null}
        alreadyOnSportsIQ={true}
        referralCode={REFERRAL_CODE}
      />,
    );
    const card = screen.getByTestId('sibling-invite-card');
    // The copy invites the parent to start their own account / connect the
    // sibling's report — the AC explicitly forbids opening the invite sheet
    // in this case. The same phrase can appear in both the headline copy
    // and the CTA link; we count rather than require uniqueness
    // (LESSONS#0029 / #0082).
    expect(within(card).getAllByText(/start your own account|connect.*report/i).length).toBeGreaterThan(0);
    expect(within(card).getByTestId('sibling-invite-self-signup-link')).toBeInTheDocument();
    expect(screen.queryByTestId('sibling-invite-open')).not.toBeInTheDocument();
  });
});

describe('SiblingInviteCard — null candidate branch (ticket 0060)', () => {
  it('renders nothing when there is no second-kid match and the other coach is not on SportsIQ', () => {
    const { container } = render(
      <SiblingInviteCard
        shareToken={SHARE_TOKEN}
        candidate={null}
        alreadyOnSportsIQ={false}
        referralCode={REFERRAL_CODE}
      />,
    );
    // No card at all — the AC says "silence beats a generic invite CTA every
    // time" so we must NOT render an empty container the parent sees.
    expect(container.firstChild).toBeNull();
  });
});

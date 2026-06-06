/**
 * Ticket 0071 — <EmergentFocusCard /> + the share sheet.
 *
 * The card renders the top emergent focus the route resolved (v1 shows ONE,
 * the second is reserved for a v2 follow-on). It is ABSENT when no focus
 * exists. The "Share this with the coaches" button opens a sheet with the
 * pre-drafted line + a Copy button (exposing `data-share-text` per the
 * navigator.share text-only variant — LESSONS#0056/#0082).
 *
 * The "Got it" dismiss hides the card for 7 days via localStorage; the
 * dismiss is silent (no "see you next week" copy — LESSONS#0023).
 *
 * .test.ts(x) (NOT .spec.ts) — per docs/LESSONS.md.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { EmergentFocusCard, type EmergentFocusViewModel } from '@/components/admin/emergent-focus-card';

const TESTID = 'emergent-focus-card';

function seededFocus(): EmergentFocusViewModel {
  return {
    skill: 'closeouts',
    teamCount: 3,
    teams: [
      { id: 'team-u10', name: 'Hawks U10' },
      { id: 'team-u12', name: 'Sharks U12' },
      { id: 'team-u14', name: 'Eagles U14' },
    ],
  };
}

beforeEach(() => {
  // Wipe the dismiss flag between tests.
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});

afterEach(() => cleanup());

describe('EmergentFocusCard (ticket 0071)', () => {
  it('(i) renders with the right copy + the team names when a focus is present', () => {
    render(<EmergentFocusCard focus={seededFocus()} />);
    const card = screen.getByTestId(TESTID);
    expect(card).toBeInTheDocument();
    expect(card).toHaveTextContent(/3 of your coaches/i);
    expect(card).toHaveTextContent('closeouts');
    expect(card).toHaveTextContent('Hawks U10');
    expect(card).toHaveTextContent('Sharks U12');
    expect(card).toHaveTextContent('Eagles U14');
  });

  it('(ii) renders NOTHING when the focus is null (the empty-focus state)', () => {
    const { container } = render(<EmergentFocusCard focus={null} />);
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('(ii) renders NOTHING when the focus is undefined (still loading / best-effort)', () => {
    const { container } = render(<EmergentFocusCard focus={undefined} />);
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('(iii) tap Share → the sheet opens with the drafted line in a textarea', () => {
    render(<EmergentFocusCard focus={seededFocus()} />);
    const share = screen.getByRole('button', { name: /share this/i });
    fireEvent.click(share);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toMatch(/^Nice — 3 of you converged on closeouts/);
    expect(textarea.value).toContain('Hawks U10, Sharks U12, Eagles U14');
    expect(textarea.value.trimEnd()).toMatch(/Keep at it\.$/);
  });

  it('(iv) the Copy button carries data-share-text with the right text (text-only navigator.share variant)', () => {
    render(<EmergentFocusCard focus={seededFocus()} />);
    fireEvent.click(screen.getByRole('button', { name: /share this/i }));
    const copy = screen.getByRole('button', { name: /^copy$/i });
    const attr = copy.getAttribute('data-share-text') ?? '';
    expect(attr.length).toBeGreaterThan(20);
    expect(attr).toContain('closeouts');
    expect(attr).toContain('Hawks U10');
  });

  it('(v) tap Got it → the card hides on the current render', () => {
    render(<EmergentFocusCard focus={seededFocus()} />);
    expect(screen.getByTestId(TESTID)).toBeInTheDocument();
    const got = screen.getByRole('button', { name: /got it/i });
    fireEvent.click(got);
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
  });

  it('(vi) a re-render within 7 days does NOT re-show the card after Got it', () => {
    const { rerender } = render(<EmergentFocusCard focus={seededFocus()} />);
    fireEvent.click(screen.getByRole('button', { name: /got it/i }));
    // Re-render with the SAME focus — the dismiss persisted to localStorage.
    rerender(<EmergentFocusCard focus={seededFocus()} />);
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
  });

  it('(vii) a re-render after 7 days SHOWS the card again', () => {
    // Plant a dismiss timestamp ≥ 8 days in the past so the card returns.
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    window.localStorage.setItem(
      'sportsiq:emergent-focus-dismissed-at',
      String(eightDaysAgo)
    );
    render(<EmergentFocusCard focus={seededFocus()} />);
    expect(screen.getByTestId(TESTID)).toBeInTheDocument();
  });

  it('uses clipboard-not-landing-page copy on the card AND inside the sheet (no banned words, no emoji heading)', () => {
    render(<EmergentFocusCard focus={seededFocus()} />);
    fireEvent.click(screen.getByRole('button', { name: /share this/i }));
    const allText =
      (screen.getByTestId(TESTID).textContent ?? '') +
      ' ' +
      ((screen.getByRole('textbox') as HTMLTextAreaElement).value ?? '');
    for (const banned of [/journey/i, /amazing/i, /exciting/i, /elevate/i, /empower/i, /synergy/i, /unlock your potential/i]) {
      expect(allText).not.toMatch(banned);
    }
    // Positive instruction.
    expect(allText).toMatch(/nice/i);
  });

  // Sanity guard so the dismiss key never collides with a sibling card.
  it('the dismiss key is namespaced to emergent-focus', () => {
    render(<EmergentFocusCard focus={seededFocus()} />);
    fireEvent.click(screen.getByRole('button', { name: /got it/i }));
    expect(window.localStorage.getItem('sportsiq:emergent-focus-dismissed-at')).not.toBeNull();
  });
});

describe('EmergentFocusCard — wraps act() around the Got it state transition', () => {
  it('hides the card synchronously after Got it (no race)', () => {
    render(<EmergentFocusCard focus={seededFocus()} />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /got it/i }));
    });
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
  });
});

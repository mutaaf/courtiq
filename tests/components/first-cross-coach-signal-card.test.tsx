/**
 * Ticket 0088 — <FirstCrossCoachSignalCard /> component test.
 *
 * The card mounts at the TOP of /home. It renders ONLY when a non-
 * null first-of-its-kind cross-coach signal has fired AND has not
 * yet been dismissed for the caller coach.
 *
 * Acceptance criteria mapping:
 *  (i)   null payload → card ABSENT (silence beats nag).
 *  (ii)  clone-kind payload with sender + program → headline + sender +
 *        program + artifact + relative date all render.
 *  (iii) thank-kind payload renders the thank headline variant.
 *  (iv)  parent_forward_cross_team payload renders that variant.
 *  (v)   payload without sender program omits the program line (no
 *        invented value).
 *  (vi)  tapping "Publish another drill" routes to the drill publish
 *        surface (drills page with the publish affordance — 0064).
 *  (vii) tapping "Got it" POSTs to the dismiss route.
 *  (viii) no banned word across every kind / sender / program fixture
 *        variant (AGENTS.md voice).
 *
 * .test.tsx NOT .spec.tsx (LESSONS#0020 / #0038).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FirstCrossCoachSignalCard } from '@/components/home/first-cross-coach-signal-card';
import type { FirstCrossCoachSignal } from '@/lib/first-cross-coach-signal';

const BANNED_HYPE = [
  'journey',
  'amazing',
  'exciting',
  'elevate',
  'empower',
  'synergy',
  'unlock your potential',
];

const NOW_MS = new Date('2026-06-10T13:00:00Z').getTime();

function payload(over: Partial<FirstCrossCoachSignal> = {}): FirstCrossCoachSignal {
  return {
    kind: 'clone',
    firedAt: '2026-06-10T08:00:00Z',
    senderFirstName: 'Maya',
    senderProgramName: 'Hornets',
    artifactLabel: 'closeout drill',
    ...over,
  };
}

describe('<FirstCrossCoachSignalCard /> (ticket 0088)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('(i) null payload → card is absent', () => {
    const { container } = render(
      <FirstCrossCoachSignalCard signal={null} nowMs={NOW_MS} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('(ii) clone-kind payload renders headline, sender, program, artifact and relative date', () => {
    render(<FirstCrossCoachSignalCard signal={payload()} nowMs={NOW_MS} />);
    const card = screen.getByTestId('first-cross-coach-signal-card');
    expect(card).toBeTruthy();
    const text = card.textContent ?? '';
    expect(text).toMatch(/first time a coach outside this team picked up your work/i);
    expect(text).toContain('Maya');
    expect(text).toContain('Hornets');
    expect(text).toContain('closeout drill');
    // Relative date — same-day signal fired earlier today.
    expect(text.toLowerCase()).toMatch(/today|this morning|hours? ago/);
  });

  it('(iii) thank-kind renders the thank headline variant', () => {
    render(
      <FirstCrossCoachSignalCard
        signal={payload({
          kind: 'thank',
          artifactLabel: 'transition drill',
          senderFirstName: 'Jordan',
          senderProgramName: 'Lions',
        })}
        nowMs={NOW_MS}
      />,
    );
    const text = screen.getByTestId('first-cross-coach-signal-card').textContent ?? '';
    expect(text).toMatch(/first in-product thank from another coach/i);
  });

  it('(iv) parent_forward_cross_team renders that headline variant', () => {
    render(
      <FirstCrossCoachSignalCard
        signal={payload({
          kind: 'parent_forward_cross_team',
          senderFirstName: undefined,
          senderProgramName: undefined,
          artifactLabel: 'this week\'s parent report',
        })}
        nowMs={NOW_MS}
      />,
    );
    const text = screen.getByTestId('first-cross-coach-signal-card').textContent ?? '';
    expect(text).toMatch(/first time a parent forwarded your report to another team/i);
  });

  it('(v) payload without sender program omits the program line', () => {
    render(
      <FirstCrossCoachSignalCard
        signal={payload({ senderFirstName: 'Maya', senderProgramName: undefined })}
        nowMs={NOW_MS}
      />,
    );
    const text = screen.getByTestId('first-cross-coach-signal-card').textContent ?? '';
    // The component must never invent "Hornets" or any program name.
    expect(text).not.toMatch(/hornets|lions|riverside/i);
    expect(text).toContain('Maya');
  });

  it('(vi) tapping "Publish another drill" routes to the drill publish surface', () => {
    render(<FirstCrossCoachSignalCard signal={payload()} nowMs={NOW_MS} />);
    const publishBtn = screen.getByTestId('first-cross-coach-signal-card-publish');
    // The component uses an <a> for the publish CTA so the e2e can
    // assert href and the unit test can read it directly.
    expect(publishBtn.tagName.toLowerCase()).toBe('a');
    const href = publishBtn.getAttribute('href') ?? '';
    expect(href).toMatch(/drill/i);
  });

  it('(vii) tapping "Got it" POSTs to the dismiss route with the kind', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      // LESSONS#0065 — type and forward BOTH args so we can read the body.
      async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init });
        return new Response('{"ok":true}', { status: 200 });
      },
    );
    render(<FirstCrossCoachSignalCard signal={payload({ kind: 'clone' })} nowMs={NOW_MS} />);
    fireEvent.click(screen.getByTestId('first-cross-coach-signal-card-got-it'));
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const call = calls[0];
    expect(call.url).toMatch(/\/api\/home\/first-cross-coach-signal\/dismiss/);
    expect(call.init?.method?.toUpperCase()).toBe('POST');
    const body = JSON.parse(String(call.init?.body ?? '{}')) as { kind?: string };
    expect(body.kind).toBe('clone');
  });

  it('(viii) no banned word across every kind variant', () => {
    const kinds: FirstCrossCoachSignal['kind'][] = [
      'clone',
      'thank',
      'parent_forward',
      'parent_forward_cross_team',
      'reaction_cross_team',
    ];
    for (const kind of kinds) {
      const { unmount } = render(
        <FirstCrossCoachSignalCard
          signal={payload({ kind, artifactLabel: 'closeout drill', senderFirstName: 'Maya', senderProgramName: 'Hornets' })}
          nowMs={NOW_MS}
        />,
      );
      const text = (screen.getByTestId('first-cross-coach-signal-card').textContent ?? '').toLowerCase();
      for (const banned of BANNED_HYPE) {
        expect(text).not.toContain(banned);
      }
      unmount();
    }
  });
});

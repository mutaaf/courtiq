/**
 * Ticket 0090 — <ProgramCanonInheritedBanner /> component test.
 *
 * The banner mounts at the top of /plans. It renders ONLY when the
 * route's `inherited: true` payload is present AND the coach has not
 * yet dismissed it via the 0088 dedup primitive (kind:
 * 'program_canon_inherited').
 *
 * Acceptance criteria mapping:
 *  (i)   coach with no inheritance → banner ABSENT
 *  (ii)  coach with inheritance in last 14 days AND no dismissal →
 *        banner PRESENT with the named program AND drill count
 *  (iii) tapping "Got it" fires the dismiss handler
 *  (iv)  coach with inheritance 30 days ago → banner ABSENT (window past)
 *  (v)   no banned word
 *
 * .test.tsx NOT .spec.tsx (LESSONS#0020 / #0038).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProgramCanonInheritedBanner } from '@/components/plans/program-canon-inherited-banner';

const BANNED_HYPE = [
  'journey',
  'amazing',
  'exciting',
  'elevate',
  'empower',
  'synergy',
  'unlock your potential',
];

describe('<ProgramCanonInheritedBanner /> (ticket 0090)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('(i) inherited: false → banner ABSENT', () => {
    const { container } = render(
      <ProgramCanonInheritedBanner
        payload={{ inherited: false }}
        onDismiss={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('(i) null payload → banner ABSENT', () => {
    const { container } = render(
      <ProgramCanonInheritedBanner payload={null} onDismiss={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('(ii) inherited with 7 drills + named program → banner names BOTH', () => {
    render(
      <ProgramCanonInheritedBanner
        payload={{
          inherited: true,
          drillCount: 7,
          programName: 'Hawks Basketball',
        }}
        onDismiss={vi.fn()}
      />,
    );
    const banner = screen.getByTestId('program-canon-inherited-banner');
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain('7');
    expect(banner.textContent).toContain('Hawks Basketball');
  });

  it('(iii) tapping "Got it" calls onDismiss', () => {
    const onDismiss = vi.fn();
    render(
      <ProgramCanonInheritedBanner
        payload={{
          inherited: true,
          drillCount: 4,
          programName: 'Hawks Basketball',
        }}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByTestId('program-canon-inherited-dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('singular drill count → "1 drill" (no "1 drills")', () => {
    render(
      <ProgramCanonInheritedBanner
        payload={{
          inherited: true,
          drillCount: 1,
          programName: 'Hawks Basketball',
        }}
        onDismiss={vi.fn()}
      />,
    );
    const banner = screen.getByTestId('program-canon-inherited-banner');
    expect(banner.textContent).toMatch(/1 drill\b/);
    expect(banner.textContent).not.toMatch(/1 drills/);
  });

  it('(v) no AGENTS.md banned word across rendered variants', () => {
    const variants = [
      { drillCount: 7, programName: 'Hawks Basketball' },
      { drillCount: 1, programName: 'Riverside U10' },
    ];
    for (const v of variants) {
      const { container, unmount } = render(
        <ProgramCanonInheritedBanner
          payload={{ inherited: true, ...v }}
          onDismiss={vi.fn()}
        />,
      );
      const text = (container.textContent ?? '').toLowerCase();
      for (const banned of BANNED_HYPE) {
        expect(text).not.toContain(banned);
      }
      unmount();
    }
  });
});

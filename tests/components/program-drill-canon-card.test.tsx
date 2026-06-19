/**
 * Ticket 0090 — <ProgramDrillCanonCard /> component test.
 *
 * The card mounts on /admin under the existing 0087 <ProgramOrgTierCard />.
 * It renders ONLY when the route's `eligible: true` payload is present.
 *
 * Acceptance criteria mapping:
 *  (i)   eligible: false → card ABSENT (silence beats nag)
 *  (ii)  eligible with 7 drills → renders all 7 with named first names
 *  (iii) tapping "Publish" POSTs to the publish route with all drillIds
 *  (iv)  tapping "Edit before publishing" reveals the editor
 *  (v)   unchecking a drill removes it from the publish POST payload
 *  (vi)  already-published state renders the "Published — N drills" variant
 *  (vii) NO banned word across every fixture variant
 *
 * .test.tsx NOT .spec.tsx (LESSONS#0020 / #0038).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProgramDrillCanonCard } from '@/components/director/program-drill-canon-card';

const BANNED_HYPE = [
  'journey',
  'amazing',
  'exciting',
  'elevate',
  'empower',
  'synergy',
  'unlock your potential',
];

function eligiblePayload(drillCount = 7) {
  const drills = Array.from({ length: drillCount }, (_, i) => ({
    drillId: `d${i + 1}`,
    drillName: `Drill ${String.fromCharCode(65 + i)}`,
    coachCount: 3 + (i === 0 ? 1 : 0),
    coachFirstNames: ['Maya', 'James', 'Lin'].slice(0, 3),
    sport_id: 'basketball',
    age_groups: ['8-10'],
  }));
  return {
    eligible: true as const,
    drills,
    totalCoachesInProgram: 6,
    orgName: 'Hawks Basketball',
  };
}

describe('<ProgramDrillCanonCard /> (ticket 0090)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('(i) eligible: false → card is ABSENT', () => {
    const { container } = render(
      <ProgramDrillCanonCard
        payload={{ eligible: false, eligibilityReason: 'not_org_tier' }}
        onPublish={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('(i) null payload → card is ABSENT (loading)', () => {
    const { container } = render(
      <ProgramDrillCanonCard payload={null} onPublish={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('(ii) eligible with 7 drills → renders all 7 with named first names', () => {
    render(
      <ProgramDrillCanonCard payload={eligiblePayload(7)} onPublish={vi.fn()} />,
    );
    const card = screen.getByTestId('program-drill-canon-card');
    expect(card).toBeTruthy();
    const text = card.textContent ?? '';
    for (let i = 0; i < 7; i += 1) {
      expect(text).toContain(`Drill ${String.fromCharCode(65 + i)}`);
    }
    expect(text).toContain('Maya');
    expect(text).toContain('James');
    expect(text).toContain('Lin');
    expect(text).toContain('Hawks Basketball');
  });

  it('(iii) tapping "Publish" calls onPublish with all drillIds', async () => {
    const onPublish = vi.fn();
    render(
      <ProgramDrillCanonCard payload={eligiblePayload(3)} onPublish={onPublish} />,
    );
    const publishButton = screen.getByTestId('program-drill-canon-publish');
    fireEvent.click(publishButton);
    await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(1));
    const [drillIds] = onPublish.mock.calls[0];
    expect(drillIds).toEqual(['d1', 'd2', 'd3']);
  });

  it('(iv) tapping "Edit before publishing" reveals the editor', () => {
    render(
      <ProgramDrillCanonCard payload={eligiblePayload(3)} onPublish={vi.fn()} />,
    );
    expect(screen.queryByTestId('program-drill-canon-editor')).toBeNull();
    fireEvent.click(screen.getByTestId('program-drill-canon-edit-toggle'));
    expect(screen.getByTestId('program-drill-canon-editor')).toBeTruthy();
  });

  it('(v) unchecking a drill removes it from the publish payload', async () => {
    const onPublish = vi.fn();
    render(
      <ProgramDrillCanonCard payload={eligiblePayload(3)} onPublish={onPublish} />,
    );
    fireEvent.click(screen.getByTestId('program-drill-canon-edit-toggle'));
    const checkbox = screen.getByTestId('program-drill-canon-checkbox-d2') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByTestId('program-drill-canon-publish'));
    await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(1));
    const [drillIds] = onPublish.mock.calls[0];
    expect(drillIds).toEqual(['d1', 'd3']);
  });

  it('(vi) already-published state renders the "Published — N drills" variant', () => {
    render(
      <ProgramDrillCanonCard
        payload={{
          ...eligiblePayload(7),
          currentCanon: {
            canonId: 'canon-1',
            drillIds: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7'],
            publishedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          },
        }}
        onPublish={vi.fn()}
      />,
    );
    const card = screen.getByTestId('program-drill-canon-card');
    expect(card.textContent).toMatch(/published[\s\S]*7 drills/i);
  });

  it('(vii) no AGENTS.md banned word across every rendered fixture variant', () => {
    const variants = [
      { payload: eligiblePayload(7), onPublish: vi.fn() },
      {
        payload: {
          ...eligiblePayload(3),
          currentCanon: {
            canonId: 'c1',
            drillIds: ['d1', 'd2'],
            publishedAt: new Date().toISOString(),
          },
        },
        onPublish: vi.fn(),
      },
    ];
    for (const v of variants) {
      const { container, unmount } = render(
        <ProgramDrillCanonCard payload={v.payload} onPublish={v.onPublish} />,
      );
      const text = (container.textContent ?? '').toLowerCase();
      for (const banned of BANNED_HYPE) {
        expect(text).not.toContain(banned);
      }
      unmount();
    }
  });
});

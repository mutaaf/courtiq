/**
 * Ticket 0064 — PublishDrillSheet component.
 *
 * Tests:
 *  - Renders the sheet with the drill name + caption textarea + Publish button
 *    when no existing share is supplied.
 *  - data-testid="publish-drill-sheet" on the container.
 *  - Tapping Publish POSTs /api/drill-shares/create with the caption.
 *  - The success state shows the public URL + a Copy button.
 *  - The Copy button carries data-share-url={publicUrl} per LESSONS#0056 /
 *    #0082.
 *  - When existingShare.isActive is true, the sheet opens directly into the
 *    success state with the caption pre-filled.
 *  - Every rendered string is voice-clean (LESSONS#0023).
 *
 * .test.tsx NOT .spec.tsx (LESSONS#0020 / #38).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PublishDrillSheet } from '@/components/drills/publish-drill-sheet';
import { TRAJECTORY_BANNED_WORDS } from '@/lib/player-trajectory-utils';

const DRILL_ID = 'drill-1';
const DRILL_NAME = 'Closeout Drill';

beforeEach(() => {
  vi.restoreAllMocks();
});

function mockFetchOnce(body: Record<string, unknown>, status = 200) {
  return vi.spyOn(global, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

describe('<PublishDrillSheet /> (ticket 0064)', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <PublishDrillSheet
        open={false}
        onClose={() => {}}
        drillId={DRILL_ID}
        drillName={DRILL_NAME}
        existingShare={null}
      />,
    );
    expect(container.querySelector('[data-testid="publish-drill-sheet"]')).toBeNull();
  });

  it('renders the sheet with the drill name + caption textarea + Publish button', () => {
    render(
      <PublishDrillSheet
        open={true}
        onClose={() => {}}
        drillId={DRILL_ID}
        drillName={DRILL_NAME}
        existingShare={null}
      />,
    );
    expect(screen.getByTestId('publish-drill-sheet')).toBeTruthy();
    expect(screen.getByText(DRILL_NAME)).toBeTruthy();
    expect(screen.getByTestId('publish-drill-caption')).toBeTruthy();
    expect(screen.getByTestId('publish-drill-publish-button')).toBeTruthy();
  });

  it('placeholder instructs POSITIVELY (no banned-word enumeration, LESSONS#0023)', () => {
    render(
      <PublishDrillSheet
        open={true}
        onClose={() => {}}
        drillId={DRILL_ID}
        drillName={DRILL_NAME}
        existingShare={null}
      />,
    );
    const textarea = screen.getByTestId('publish-drill-caption') as HTMLTextAreaElement;
    const placeholder = textarea.placeholder.toLowerCase();
    for (const banned of TRAJECTORY_BANNED_WORDS) {
      expect(placeholder).not.toContain(banned);
    }
    // And the positive instruction is present.
    expect(placeholder).toMatch(/what made this drill work/i);
  });

  it('every rendered string is voice-clean', () => {
    const { container } = render(
      <PublishDrillSheet
        open={true}
        onClose={() => {}}
        drillId={DRILL_ID}
        drillName={DRILL_NAME}
        existingShare={null}
      />,
    );
    const text = (container.textContent ?? '').toLowerCase();
    for (const banned of TRAJECTORY_BANNED_WORDS) {
      expect(text).not.toContain(banned);
    }
  });

  it('Publish POSTs /api/drill-shares/create and surfaces the public URL + Copy button', async () => {
    const fetchSpy = mockFetchOnce({
      token: 'tok-abc',
      url: '/drill/tok-abc',
      caption: 'Finally clicked.',
      alreadyPublished: false,
    });

    render(
      <PublishDrillSheet
        open={true}
        onClose={() => {}}
        drillId={DRILL_ID}
        drillName={DRILL_NAME}
        existingShare={null}
      />,
    );

    const textarea = screen.getByTestId('publish-drill-caption') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Finally clicked.' } });
    const publishBtn = screen.getByTestId('publish-drill-publish-button');
    fireEvent.click(publishBtn);

    // Wait for the success state to appear.
    const copyBtn = await screen.findByTestId('publish-drill-copy-button');
    expect(copyBtn).toBeTruthy();
    // data-share-url carries the publicly-shareable URL (LESSONS#0056 / #0082).
    expect(copyBtn.getAttribute('data-share-url')).toContain('/drill/tok-abc');
    expect(screen.getByTestId('publish-drill-public-url').textContent).toContain('tok-abc');

    // Verify the POST call payload.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/drill-shares/create');
    const body = JSON.parse(String(init.body));
    expect(body.drillId).toBe(DRILL_ID);
    expect(body.caption).toBe('Finally clicked.');
  });

  it('opens straight into the success state when an active share already exists', () => {
    render(
      <PublishDrillSheet
        open={true}
        onClose={() => {}}
        drillId={DRILL_ID}
        drillName={DRILL_NAME}
        existingShare={{
          token: 'tok-existing',
          caption: 'old caption',
          isActive: true,
        }}
      />,
    );
    expect(screen.getByTestId('publish-drill-copy-button')).toBeTruthy();
    expect(screen.getByTestId('publish-drill-unpublish-button')).toBeTruthy();
    expect(screen.getByTestId('publish-drill-public-url').textContent).toContain('tok-existing');
  });
});

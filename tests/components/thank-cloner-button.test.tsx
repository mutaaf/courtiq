/**
 * Ticket 0081 — <ThankClonerButton /> component test.
 *
 * Acceptance criteria mapping:
 *  - renders on a stuck milestone (consumer-side render gate is the
 *    parent card; the button itself renders unconditionally when
 *    mounted).
 *  - tap opens the sheet with the pre-filled textarea containing the
 *    publisher's name, the drill title, and the cloner's program
 *    name.
 *  - Send fires POST /api/coach/thank-cloner with the right payload.
 *  - on 200 the button switches to Thanked.
 *  - on initialMessageId the button renders in the Thanked state on
 *    first paint (data-message-id present).
 *  - every rendered text contains no AGENTS.md banned word.
 *  - the pre-fill matrix never produces a banned token.
 *
 * .test.tsx NOT .spec.tsx (LESSONS#0020 / #38).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThankClonerButton } from '@/components/coach/thank-cloner-button';

const BANNED_HYPE = [
  'journey',
  'amazing',
  'exciting',
  'elevate',
  'empower',
  'synergy',
  'unlock your potential',
];

const PROPS = {
  milestoneId: 'm-1',
  publisherFirstName: 'Maya',
  drillTitle: 'closeout drill',
  clonerProgramName: 'Hornets',
};

describe('<ThankClonerButton /> (ticket 0081)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, message_id: 'new-msg-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('renders the "Thank this coach" button by default', () => {
    render(<ThankClonerButton {...PROPS} />);
    const btn = screen.getByTestId('thank-cloner-button');
    expect(btn.textContent).toMatch(/thank this coach/i);
  });

  it('tapping the button opens the sheet with the pre-filled textarea containing publisher / drill / program', () => {
    render(<ThankClonerButton {...PROPS} />);
    fireEvent.click(screen.getByTestId('thank-cloner-button'));
    const sheet = screen.getByTestId('thank-cloner-sheet');
    expect(sheet).toBeTruthy();
    const textarea = screen.getByTestId(
      'thank-cloner-textarea',
    ) as HTMLTextAreaElement;
    expect(textarea.value).toContain('Maya');
    expect(textarea.value).toContain('closeout drill');
    expect(textarea.value).toContain('Hornets');
  });

  it('Send fires POST /api/coach/thank-cloner with { milestoneId, body }', async () => {
    render(<ThankClonerButton {...PROPS} />);
    fireEvent.click(screen.getByTestId('thank-cloner-button'));
    fireEvent.click(screen.getByTestId('thank-cloner-send'));
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/coach/thank-cloner');
    expect(init.method).toBe('POST');
    const payload = JSON.parse(init.body as string);
    expect(payload.milestoneId).toBe('m-1');
    expect(typeof payload.body).toBe('string');
    expect(payload.body).toContain('Maya');
  });

  it('on a 200 response the button switches to Thanked with data-message-id', async () => {
    render(<ThankClonerButton {...PROPS} />);
    fireEvent.click(screen.getByTestId('thank-cloner-button'));
    fireEvent.click(screen.getByTestId('thank-cloner-send'));
    await waitFor(() => {
      expect(screen.queryByTestId('thank-cloner-thanked-state')).not.toBeNull();
    });
    const thanked = screen.getByTestId('thank-cloner-thanked-state');
    expect(thanked.textContent).toMatch(/thanked/i);
    expect(thanked.getAttribute('data-message-id')).toBe('new-msg-1');
  });

  it('on a 200 response payload carrying an existing message_id, the button renders in the Thanked state on first paint', () => {
    render(
      <ThankClonerButton {...PROPS} initialMessageId="existing-msg-1" />,
    );
    const thanked = screen.getByTestId('thank-cloner-thanked-state');
    expect(thanked).toBeTruthy();
    expect(thanked.getAttribute('data-message-id')).toBe('existing-msg-1');
    expect(screen.queryByTestId('thank-cloner-button')).toBeNull();
  });

  it('every rendered text contains no AGENTS.md banned word', () => {
    render(<ThankClonerButton {...PROPS} />);
    fireEvent.click(screen.getByTestId('thank-cloner-button'));
    const text = document.body.textContent?.toLowerCase() ?? '';
    for (const word of BANNED_HYPE) {
      expect(text).not.toContain(word);
    }
  });

  it('the pre-fill matrix never embeds a banned token for any publisher / drill / program / sport combination', () => {
    const samples: Array<typeof PROPS> = [
      { milestoneId: 'a', publisherFirstName: 'Maya', drillTitle: 'closeout drill', clonerProgramName: 'Hornets' },
      { milestoneId: 'b', publisherFirstName: 'James', drillTitle: 'transition spacing', clonerProgramName: 'Falcons' },
      { milestoneId: 'c', publisherFirstName: 'Sarah', drillTitle: 'live closeout 1-on-1', clonerProgramName: 'Owls' },
      { milestoneId: 'd', publisherFirstName: 'Devon', drillTitle: 'half-court flow', clonerProgramName: 'Westview Hoops' },
    ];
    for (const props of samples) {
      const { unmount } = render(<ThankClonerButton {...props} />);
      fireEvent.click(screen.getByTestId('thank-cloner-button'));
      const textarea = screen.getByTestId(
        'thank-cloner-textarea',
      ) as HTMLTextAreaElement;
      const text = textarea.value.toLowerCase();
      for (const word of BANNED_HYPE) {
        expect(text).not.toContain(word);
      }
      unmount();
    }
  });
});

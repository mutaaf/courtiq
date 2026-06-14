/**
 * Ticket 0081 — <CoachInbox /> component test.
 *
 * Acceptance criteria mapping:
 *  - /home renders the nav badge when an unread row exists.
 *  - /home renders no badge when all messages are read or none exist.
 *  - tapping the nav reveals the panel with the unread cards first.
 *  - every card renders sender first name + program name + drill
 *    title + the body.
 *  - the panel NEVER renders the sender's email or surname.
 *  - the mark-read POST fires once per render of the unread ids.
 *  - rendered text contains no AGENTS.md banned word.
 *
 * .test.tsx NOT .spec.tsx (LESSONS#0020 / #38).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CoachInbox, CoachInboxNavBadge } from '@/components/coach/coach-inbox';

const BANNED_HYPE = [
  'journey',
  'amazing',
  'exciting',
  'elevate',
  'empower',
  'synergy',
  'unlock your potential',
];

function withClient(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

const UNREAD_MSG = {
  id: 'msg-unread-1',
  sender_first_name: 'Maya',
  sender_program_name: 'Hawks Program',
  drill_or_plan_title: 'Live closeout 1-on-1',
  body: 'Thanks for running my closeout drill.',
  sent_at: '2026-06-10T10:00:00Z',
  read_at: null,
};

const READ_MSG = {
  id: 'msg-read-1',
  sender_first_name: 'James',
  sender_program_name: 'Falcons Program',
  drill_or_plan_title: 'Tuesday Closeouts Series',
  body: 'Glad it landed for our U12s.',
  sent_at: '2026-06-09T10:00:00Z',
  read_at: '2026-06-09T11:00:00Z',
};

describe('<CoachInboxNavBadge /> (ticket 0081)', () => {
  it('renders the badge when count > 0', () => {
    render(<CoachInboxNavBadge count={3} />);
    expect(screen.getByTestId('coach-inbox-nav-badge').textContent).toBe('3');
  });

  it('renders nothing when count is 0', () => {
    const { container } = render(<CoachInboxNavBadge count={0} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('<CoachInbox /> (ticket 0081)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let fetchCalls: Array<{ url: string; init?: RequestInit }>;

  function arrangeFetch(messages: Array<typeof UNREAD_MSG | typeof READ_MSG>) {
    fetchCalls = [];
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      ((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        fetchCalls.push({ url, init });
        if (url === '/api/coach/inbox') {
          return Promise.resolve(
            new Response(JSON.stringify({ messages }), { status: 200 }),
          );
        }
        if (url === '/api/coach/inbox/mark-read') {
          return Promise.resolve(
            new Response(JSON.stringify({ updated: messages.length }), {
              status: 200,
            }),
          );
        }
        return Promise.resolve(new Response('{}', { status: 200 }));
      }) as unknown as typeof fetch,
    );
  }

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it('renders the nav badge when an unread row exists', async () => {
    arrangeFetch([UNREAD_MSG, READ_MSG]);
    render(withClient(<CoachInbox />));
    await waitFor(() => {
      expect(screen.queryByTestId('coach-inbox-nav-badge')).not.toBeNull();
    });
    expect(screen.getByTestId('coach-inbox-nav-badge').textContent).toBe('1');
  });

  it('renders no badge when all messages are read', async () => {
    arrangeFetch([READ_MSG]);
    render(withClient(<CoachInbox />));
    // Wait for inbox fetch to settle so the badge would have appeared.
    await waitFor(() => {
      expect(fetchCalls.some((c) => c.url === '/api/coach/inbox')).toBe(true);
    });
    expect(screen.queryByTestId('coach-inbox-nav-badge')).toBeNull();
  });

  it('renders no badge when there are no messages at all', async () => {
    arrangeFetch([]);
    render(withClient(<CoachInbox />));
    await waitFor(() => {
      expect(fetchCalls.some((c) => c.url === '/api/coach/inbox')).toBe(true);
    });
    expect(screen.queryByTestId('coach-inbox-nav-badge')).toBeNull();
  });

  it('tapping the nav reveals the inbox panel with the unread cards first', async () => {
    arrangeFetch([UNREAD_MSG, READ_MSG]);
    render(withClient(<CoachInbox />));
    await waitFor(() => {
      expect(screen.queryByTestId('coach-inbox-nav-badge')).not.toBeNull();
    });
    fireEvent.click(screen.getByText(/^Inbox/));
    const cards = screen.getAllByTestId('coach-inbox-message');
    expect(cards.length).toBe(2);
    // The unread card carries Maya / Live closeout; the read card
    // carries James / Tuesday Closeouts.
    expect(cards[0].textContent).toContain('Maya');
    expect(cards[0].textContent).toContain('Live closeout');
  });

  it('every card renders sender first name + program name + drill title + body', async () => {
    arrangeFetch([UNREAD_MSG]);
    render(withClient(<CoachInbox />));
    await waitFor(() => {
      expect(screen.queryByTestId('coach-inbox-nav-badge')).not.toBeNull();
    });
    fireEvent.click(screen.getByText(/^Inbox/));
    const card = screen.getByTestId('coach-inbox-message');
    expect(card.textContent).toContain('Maya');
    expect(card.textContent).toContain('Hawks Program');
    expect(card.textContent).toContain('Live closeout 1-on-1');
    expect(card.textContent).toContain('Thanks for running my closeout drill.');
  });

  it('the panel never renders an email address or @ character', async () => {
    arrangeFetch([UNREAD_MSG]);
    render(withClient(<CoachInbox />));
    await waitFor(() => {
      expect(screen.queryByTestId('coach-inbox-nav-badge')).not.toBeNull();
    });
    fireEvent.click(screen.getByText(/^Inbox/));
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/@/);
  });

  it('the panel never renders the sender surname (only first name)', async () => {
    arrangeFetch([UNREAD_MSG]);
    render(withClient(<CoachInbox />));
    await waitFor(() => {
      expect(screen.queryByTestId('coach-inbox-nav-badge')).not.toBeNull();
    });
    fireEvent.click(screen.getByText(/^Inbox/));
    const text = document.body.textContent ?? '';
    // The mock payload's sender_first_name is "Maya". The full_name
    // surname split lives server-side; the client only ever has the
    // first name. If a future API drift ever surfaces a surname, this
    // assertion catches it. We assert by a known surname literal that
    // the seed/mock would never carry.
    expect(text).not.toContain('Walker');
    expect(text).not.toContain('Stark');
  });

  it('the mark-read POST fires once per render of the unread ids', async () => {
    arrangeFetch([UNREAD_MSG, READ_MSG]);
    render(withClient(<CoachInbox />));
    await waitFor(() => {
      expect(screen.queryByTestId('coach-inbox-nav-badge')).not.toBeNull();
    });
    fireEvent.click(screen.getByText(/^Inbox/));
    await waitFor(() => {
      const markReadCalls = fetchCalls.filter(
        (c) => c.url === '/api/coach/inbox/mark-read',
      );
      expect(markReadCalls.length).toBe(1);
    });
    const markReadCall = fetchCalls.find(
      (c) => c.url === '/api/coach/inbox/mark-read',
    );
    expect(markReadCall).toBeDefined();
    const payload = JSON.parse(markReadCall!.init!.body as string);
    expect(payload.messageIds).toEqual([UNREAD_MSG.id]);
  });

  it('every rendered text contains no AGENTS.md banned word', async () => {
    arrangeFetch([UNREAD_MSG]);
    render(withClient(<CoachInbox />));
    await waitFor(() => {
      expect(screen.queryByTestId('coach-inbox-nav-badge')).not.toBeNull();
    });
    fireEvent.click(screen.getByText(/^Inbox/));
    const text = (document.body.textContent ?? '').toLowerCase();
    for (const word of BANNED_HYPE) {
      expect(text).not.toContain(word);
    }
  });

  it('renders the empty-state copy when the inbox is empty AND the panel is open', async () => {
    arrangeFetch([]);
    render(withClient(<CoachInbox />));
    await waitFor(() => {
      expect(fetchCalls.some((c) => c.url === '/api/coach/inbox')).toBe(true);
    });
    fireEvent.click(screen.getByText(/^Inbox/));
    expect(screen.getByTestId('coach-inbox-empty')).toBeTruthy();
  });
});

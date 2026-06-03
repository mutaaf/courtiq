/**
 * Ticket 0065 — component test for `DirectorInviteSection`.
 *
 * The section mounts BELOW the existing Copy-link surface inside the 0057
 * weekly-pulse share sheet. It fetches the contact-prefill GET on open,
 * renders two inputs (director first name + email — pre-filled if the
 * prefill GET returned a contact), a Send button (label updates with the
 * name), and a small dismiss-X.
 *
 * Mocking pattern mirrors tests/components/weekly-pulse-share-card.test.tsx.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { DirectorInviteSection } from '@/components/home/director-invite-section';
import { TRAJECTORY_BANNED_WORDS } from '@/lib/player-trajectory-utils';

function mockFetch(
  implementation: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation((input, init) => implementation(input, init));
}

const TEAM_ID = '00000000-0000-4000-a000-000000000020';
const PULSE_TOKEN = 'wpt-001';
const PUBLIC_URL = `/week/${PULSE_TOKEN}`;

describe('<DirectorInviteSection /> (ticket 0065)', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the section beneath the share sheet with the prompt + 2 inputs + Send', async () => {
    mockFetch(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/program-director-invites/contact-prefill')) {
        return new Response(JSON.stringify({ hasContact: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 404 });
    });

    render(
      <DirectorInviteSection teamId={TEAM_ID} weeklyPulseToken={PULSE_TOKEN} weeklyPulsePublicUrl={PUBLIC_URL} />,
    );

    const section = await waitFor(() => screen.getByTestId('director-invite-section'));
    expect(section).toBeTruthy();
    expect(section.textContent ?? '').toMatch(/send this to your program director/i);

    // The Send button is present; the data-share-url attribute carries the
    // public weekly-pulse URL (LESSONS#0056 / #0082).
    const sendButton = screen.getByTestId('director-invite-send-button') as HTMLButtonElement;
    expect(sendButton.getAttribute('data-share-url')).toBe(PUBLIC_URL);
  });

  it('pre-fills the name + masked email when the prefill GET returns a contact', async () => {
    mockFetch(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/program-director-invites/contact-prefill')) {
        return new Response(
          JSON.stringify({
            hasContact: true,
            directorFirstName: 'Mike',
            directorEmailMasked: 'm***@league.test',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 404 });
    });

    render(
      <DirectorInviteSection teamId={TEAM_ID} weeklyPulseToken={PULSE_TOKEN} weeklyPulsePublicUrl={PUBLIC_URL} />,
    );

    const nameInput = await waitFor(
      () => screen.getByTestId('director-invite-name-input') as HTMLInputElement,
    );
    await waitFor(() => expect(nameInput.value).toBe('Mike'));

    // The masked email is visible as a hint/placeholder (NOT pre-populated
    // into the email input — the coach re-types per the AC).
    const section = screen.getByTestId('director-invite-section');
    expect(section.textContent ?? '').toContain('m***@league.test');

    // The Send button label reads "Send to Mike" (uses the name).
    const sendButton = screen.getByTestId('director-invite-send-button');
    expect(sendButton.textContent ?? '').toMatch(/send to mike/i);
  });

  it('tapping Send POSTs the create endpoint with the team + token + form fields exactly once', async () => {
    const calls: { url: string; body?: unknown }[] = [];
    mockFetch(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? 'GET').toUpperCase();
      let body: unknown = undefined;
      if (init?.body && typeof init.body === 'string') {
        try {
          body = JSON.parse(init.body);
        } catch {
          /* noop */
        }
      }
      calls.push({ url, body });

      if (url.includes('/api/program-director-invites/contact-prefill') && method === 'GET') {
        return new Response(JSON.stringify({ hasContact: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/program-director-invites/create') && method === 'POST') {
        return new Response(
          JSON.stringify({ sent: true, inviteCount: 1 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 404 });
    });

    render(
      <DirectorInviteSection teamId={TEAM_ID} weeklyPulseToken={PULSE_TOKEN} weeklyPulsePublicUrl={PUBLIC_URL} />,
    );

    const nameInput = await waitFor(
      () => screen.getByTestId('director-invite-name-input') as HTMLInputElement,
    );
    const emailInput = screen.getByTestId('director-invite-email-input') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Mike' } });
    fireEvent.change(emailInput, { target: { value: 'mike@league.test' } });

    const sendButton = screen.getByTestId('director-invite-send-button');
    fireEvent.click(sendButton);

    await waitFor(() => {
      const createCalls = calls.filter((c) => c.url.includes('/api/program-director-invites/create'));
      expect(createCalls.length).toBe(1);
      const payload = createCalls[0].body as Record<string, unknown>;
      expect(payload.teamId).toBe(TEAM_ID);
      expect(payload.weeklyPulseToken).toBe(PULSE_TOKEN);
      expect(payload.directorFirstName).toBe('Mike');
      expect(payload.directorEmail).toBe('mike@league.test');
    });

    // Success state names the director.
    await waitFor(() => {
      const section = screen.getByTestId('director-invite-section');
      expect(section.textContent ?? '').toMatch(/sent\. mike will see this card/i);
    });
  });

  it('renders the quieter "Already invited recently" state on sent:false', async () => {
    mockFetch(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.includes('/api/program-director-invites/contact-prefill')) {
        return new Response(JSON.stringify({ hasContact: false }), { status: 200 });
      }
      if (url.includes('/api/program-director-invites/create') && method === 'POST') {
        return new Response(
          JSON.stringify({ sent: false, reason: 'already-invited', dedupVia: 'coach' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 404 });
    });

    render(
      <DirectorInviteSection teamId={TEAM_ID} weeklyPulseToken={PULSE_TOKEN} weeklyPulsePublicUrl={PUBLIC_URL} />,
    );

    const nameInput = await waitFor(
      () => screen.getByTestId('director-invite-name-input') as HTMLInputElement,
    );
    const emailInput = screen.getByTestId('director-invite-email-input') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Mike' } });
    fireEvent.change(emailInput, { target: { value: 'mike@league.test' } });
    fireEvent.click(screen.getByTestId('director-invite-send-button'));

    await waitFor(() => {
      const section = screen.getByTestId('director-invite-section');
      expect(section.textContent ?? '').toMatch(/already invited recently/i);
      expect(section.textContent ?? '').toMatch(/mike/i);
    });
  });

  it('dismiss-X hides the section for the rest of this open-sheet lifetime', async () => {
    mockFetch(async () =>
      new Response(JSON.stringify({ hasContact: false }), { status: 200 }),
    );
    render(
      <DirectorInviteSection teamId={TEAM_ID} weeklyPulseToken={PULSE_TOKEN} weeklyPulsePublicUrl={PUBLIC_URL} />,
    );

    const dismiss = await waitFor(() => screen.getByTestId('director-invite-dismiss'));
    fireEvent.click(dismiss);

    await waitFor(() => {
      expect(screen.queryByTestId('director-invite-section')).toBeNull();
    });
  });

  it('contains NO AGENTS.md banned token in any rendered text (LESSONS#0023)', async () => {
    mockFetch(async () =>
      new Response(JSON.stringify({ hasContact: false }), { status: 200 }),
    );
    const { container } = render(
      <DirectorInviteSection teamId={TEAM_ID} weeklyPulseToken={PULSE_TOKEN} weeklyPulsePublicUrl={PUBLIC_URL} />,
    );
    await waitFor(() => screen.getByTestId('director-invite-section'));
    const text = (container.textContent ?? '').toLowerCase();
    for (const word of TRAJECTORY_BANNED_WORDS) {
      expect(text).not.toContain(word);
    }
  });
});

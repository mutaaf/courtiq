/**
 * Component tests for WeeklyWrapCard.
 *
 * Covers:
 *  - Preview shows short summary text before any editing
 *  - Pencil button opens textarea pre-filled with the full generated message
 *  - Edit propagates to Send: uses edited text, not original
 *  - Edit propagates to Copy: uses edited text, not original
 *  - Send without editing uses the generated message
 *  - Copy without editing uses the generated message
 *  - Deliberately clearing the textarea sends empty string (not a silent fallback to original)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WeeklyWrapCard } from '@/components/home/weekly-wrap-card';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/weekly-wrap-utils', () => ({
  buildWeeklyWrapMessage: vi.fn(() => 'Full generated message for parents'),
  buildWrapPreview: vi.fn(() => 'Short preview text'),
  buildWrapWhatsAppUrl: vi.fn((text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`),
  countNeedsWorkWrapObs: vi.fn(() => 2),
  countObservedPlayers: vi.fn(() => 5),
  countPositiveWrapObs: vi.fn(() => 8),
  countTotalObs: vi.fn(() => 10),
  dismissWrap: vi.fn(),
  getCutoffIso: vi.fn(() => '2026-05-13T00:00:00.000Z'),
  getTopNeedsWorkWrapCategory: vi.fn(() => 'defense'),
  getTopPlayerIdByPositive: vi.fn(() => 'player-1'),
  getTopPositiveWrapCategory: vi.fn(() => 'shooting'),
  hasEnoughDataForWrap: vi.fn(() => true),
  isWrapDismissed: vi.fn(() => false),
}));

vi.mock('@/lib/api', () => ({
  query: vi.fn().mockResolvedValue([]),
}));

// ─── Browser API mocks ────────────────────────────────────────────────────────

// Declared at file scope so assertions can reference them across tests.
let mockWriteText: ReturnType<typeof vi.fn>;
let mockWindowOpen: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockWriteText = vi.fn().mockResolvedValue(undefined);
  mockWindowOpen = vi.fn();

  // vi.stubGlobal is Node-version-safe: Vitest handles configurable descriptors
  // internally, unlike direct Object.defineProperty on window.open which can
  // throw on Node 20 / jsdom combinations where it is non-configurable.
  vi.stubGlobal('open', mockWindowOpen);

  // jsdom doesn't implement the Clipboard API; assign the property directly so
  // the assignment doesn't fight an existing non-configurable descriptor.
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: { writeText: mockWriteText },
    writable: true,
    configurable: true,
  });

  // Ensure navigator.share is absent so the component falls through to the
  // window.open / WhatsApp path.
  Object.defineProperty(globalThis.navigator, 'share', {
    value: undefined,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <WeeklyWrapCard
        teamId="team-1"
        teamName="YMCA Rockets"
        coachName="Sarah Smith"
        totalPlayerCount={12}
      />
    </QueryClientProvider>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WeeklyWrapCard', () => {
  it('shows short preview text before any editing', async () => {
    renderCard();
    expect(await screen.findByText('Short preview text')).toBeInTheDocument();
    expect(screen.queryByLabelText('Edit parent update message')).not.toBeInTheDocument();
  });

  it('pencil opens textarea pre-filled with the full generated message', async () => {
    renderCard();
    const pencil = await screen.findByLabelText('Edit message before sending');
    fireEvent.click(pencil);
    const textarea = screen.getByLabelText('Edit parent update message') as HTMLTextAreaElement;
    expect(textarea).toBeInTheDocument();
    expect(textarea.value).toBe('Full generated message for parents');
  });

  it('edit propagates to Send — uses edited text, not original', async () => {
    renderCard();
    const pencil = await screen.findByLabelText('Edit message before sending');
    fireEvent.click(pencil);
    fireEvent.change(screen.getByLabelText('Edit parent update message'), {
      target: { value: 'Custom personalised message' },
    });
    fireEvent.click(screen.getByLabelText('Share weekly update with parents'));
    await waitFor(() => {
      expect(mockWindowOpen).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent('Custom personalised message')),
        '_blank',
        'noopener'
      );
    });
  });

  it('edit propagates to Copy — uses edited text, not original', async () => {
    renderCard();
    const pencil = await screen.findByLabelText('Edit message before sending');
    fireEvent.click(pencil);
    fireEvent.change(screen.getByLabelText('Edit parent update message'), {
      target: { value: 'My custom text' },
    });
    fireEvent.click(screen.getByLabelText('Copy weekly update to clipboard'));
    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith('My custom text');
    });
  });

  it('Send without editing uses the generated message', async () => {
    renderCard();
    const sendBtn = await screen.findByLabelText('Share weekly update with parents');
    fireEvent.click(sendBtn);
    await waitFor(() => {
      expect(mockWindowOpen).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent('Full generated message for parents')),
        '_blank',
        'noopener'
      );
    });
  });

  it('Copy without editing uses the generated message', async () => {
    renderCard();
    const copyBtn = await screen.findByLabelText('Copy weekly update to clipboard');
    fireEvent.click(copyBtn);
    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith('Full generated message for parents');
    });
  });

  it('clearing the textarea sends empty string — no silent fallback to original', async () => {
    renderCard();
    const pencil = await screen.findByLabelText('Edit message before sending');
    fireEvent.click(pencil);
    fireEvent.change(screen.getByLabelText('Edit parent update message'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByLabelText('Copy weekly update to clipboard'));
    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith('');
    });
  });
});

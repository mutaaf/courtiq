'use client';

/**
 * DeletePracticeSheet — the coach's UI for the per-session delete primitive
 * (ticket 0051).
 *
 * Two screens:
 *  1. Default ("Remove this practice — keep my N notes"). One orange CTA and a
 *     ghost cancel. Two taps from the session detail page.
 *  2. An optional destructive section ("Delete the notes too") that requires
 *     typing the team name to confirm — the SECOND click, never the first.
 *
 * This component is presentational: it does not call the API. The caller
 * (sessions/[sessionId]/page.tsx) handles the fetch and feeds isDeleting /
 * error back in.
 */
import { useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface DeletePracticeSheetProps {
  open: boolean;
  teamName: string;
  observationCount: number;
  isDeleting: boolean;
  error: string | null;
  onConfirm: (args: { mode: 'preserve' | 'cascade'; confirm?: string }) => void;
  onCancel: () => void;
}

export function DeletePracticeSheet(props: DeletePracticeSheetProps) {
  const { open, teamName, observationCount, isDeleting, error, onConfirm, onCancel } = props;
  const [destructiveOpen, setDestructiveOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  if (!open) return null;

  const matches =
    confirmText.trim().length > 0 &&
    confirmText.trim().toLowerCase() === teamName.trim().toLowerCase();

  return (
    <div
      data-testid="delete-practice-sheet"
      role="dialog"
      aria-label="Delete this practice"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
    >
      <div className="w-full max-w-md rounded-t-2xl border border-zinc-800 bg-zinc-950 p-5 sm:rounded-2xl">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/10">
              <AlertTriangle className="h-5 w-5 text-red-400" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-zinc-100">
                Delete this practice?
              </h2>
              {observationCount > 0 ? (
                <p className="text-sm text-zinc-400">
                  Remove this practice — keep my {observationCount}{' '}
                  {observationCount === 1 ? 'note' : 'notes'}. The notes stay in
                  each player's history, just not tied to this session.
                </p>
              ) : (
                <p className="text-sm text-zinc-400">
                  This session has no observations. Removing it won't touch any
                  player notes.
                </p>
              )}
            </div>
          </div>

          {/* Primary (preserve-mode) action row. */}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="ghost"
              onClick={onCancel}
              disabled={isDeleting}
              className="min-h-[44px] sm:min-h-[40px]"
            >
              Cancel
            </Button>
            <Button
              onClick={() => onConfirm({ mode: 'preserve' })}
              disabled={isDeleting}
              className="min-h-[44px] sm:min-h-[40px]"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Removing…
                </>
              ) : (
                'Remove this practice'
              )}
            </Button>
          </div>

          {/* Optional destructive section: only when there ARE observations to
              lose. The expand control is the second click, the typed confirm is
              the third — there's no path to wipe coach-authored notes by
              accident. */}
          {observationCount > 0 && (
            <div className="border-t border-zinc-800 pt-3">
              {!destructiveOpen ? (
                <button
                  type="button"
                  onClick={() => setDestructiveOpen(true)}
                  className="text-xs font-medium text-red-400 hover:text-red-300 transition-colors"
                >
                  Delete the notes too →
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-zinc-400">
                    This will permanently delete every note tied to this
                    session ({observationCount}{' '}
                    {observationCount === 1 ? 'note' : 'notes'}). There is no
                    undo. Type{' '}
                    <span className="font-mono text-zinc-200">{teamName}</span>{' '}
                    to confirm.
                  </p>
                  <label className="block">
                    <span className="sr-only">Type the team name to confirm</span>
                    <input
                      type="text"
                      autoComplete="off"
                      aria-label="Type the team name to confirm"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder={teamName}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-red-500/60 focus:outline-none focus:ring-1 focus:ring-red-500/20"
                    />
                  </label>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setDestructiveOpen(false);
                        setConfirmText('');
                      }}
                      disabled={isDeleting}
                    >
                      Back
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => onConfirm({ mode: 'cascade', confirm: confirmText })}
                      disabled={!matches || isDeleting}
                    >
                      {isDeleting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Deleting…
                        </>
                      ) : (
                        'Delete practice and notes'
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <p
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
              role="alert"
            >
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

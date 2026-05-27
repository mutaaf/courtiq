'use client';

/**
 * DeleteTeamModal — the org-admin UI for the destructive hard-delete primitive
 * (ticket 0053). Lives inside the archived-teams panel on
 * /settings/organization; opens only AFTER the team is already archived (the
 * archive→delete two-step asymmetry is enforced both server-side via 409 and
 * client-side by hiding this control on live teams).
 *
 * One screen — by design slower than archive:
 *   - The team name is in the heading.
 *   - The cascade counts (players / sessions / observations / plans / parent
 *     share links) are shown so the admin sees exactly what disappears.
 *   - A typed-name confirm input gates the submit button. Until the typed
 *     name case-insensitive-trimmed-matches the team's name, "Delete the team
 *     forever" stays disabled.
 *
 * This component is presentational: it does not call the API. The caller
 * (settings/organization/page.tsx) handles the DELETE call and feeds
 * isDeleting / error back in.
 */
import { useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface DeleteTeamModalProps {
  open: boolean;
  teamName: string;
  counts: {
    players: number;
    sessions: number;
    observations: number;
    plans: number;
    parent_shares: number;
  };
  isDeleting: boolean;
  error: string | null;
  onConfirm: (args: { confirm: string }) => void;
  onCancel: () => void;
}

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

export function DeleteTeamModal(props: DeleteTeamModalProps) {
  const { open, teamName, counts, isDeleting, error, onConfirm, onCancel } = props;
  const [confirmText, setConfirmText] = useState('');

  if (!open) return null;

  const matches =
    confirmText.trim().length > 0 &&
    confirmText.trim().toLowerCase() === teamName.trim().toLowerCase();

  return (
    <div
      data-testid="delete-team-modal"
      role="dialog"
      aria-label="Delete this team permanently"
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
                Delete {teamName} forever?
              </h2>
              <p className="text-sm text-zinc-400">
                This permanently removes the team and everything tied to it.
                There is no undo.
              </p>
            </div>
          </div>

          {/* Cascade counts panel — the admin sees what disappears. */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-sm text-zinc-300">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 mb-2">
              Removed permanently
            </p>
            <ul className="space-y-1 text-xs">
              <li>{counts.players} {plural(counts.players, 'player', 'players')}</li>
              <li>{counts.sessions} {plural(counts.sessions, 'practice', 'practices')}</li>
              <li>{counts.observations} coach {plural(counts.observations, 'observation', 'observations')}</li>
              <li>{counts.plans} AI {plural(counts.plans, 'plan', 'plans')} (practice + parent reports)</li>
              <li>{counts.parent_shares} parent share {plural(counts.parent_shares, 'link', 'links')}</li>
            </ul>
          </div>

          {/* Typed-name confirm. */}
          <div className="space-y-2">
            <p className="text-xs text-zinc-400">
              Type{' '}
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
          </div>

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
              variant="destructive"
              onClick={() => onConfirm({ confirm: confirmText })}
              disabled={!matches || isDeleting}
              className="min-h-[44px] sm:min-h-[40px]"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                'Delete the team forever'
              )}
            </Button>
          </div>

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

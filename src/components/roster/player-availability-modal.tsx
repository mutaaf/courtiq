'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AVAILABILITY_CONFIG } from '@/components/roster/availability-badge';
import type { AvailabilityStatus, Player, PlayerAvailability } from '@/types/database';
import { X, Loader2, RotateCcw } from 'lucide-react';

interface PlayerAvailabilityModalProps {
  player: Player;
  teamId: string;
  current: PlayerAvailability | null;
  onClose: () => void;
}

const STATUSES: AvailabilityStatus[] = ['available', 'limited', 'injured', 'sick', 'unavailable'];

export function PlayerAvailabilityModal({ player, teamId, current, onClose }: PlayerAvailabilityModalProps) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AvailabilityStatus>(current?.status ?? 'available');
  const [reason, setReason] = useState(current?.reason ?? '');
  const [expectedReturn, setExpectedReturn] = useState(current?.expected_return ?? '');
  const [notes, setNotes] = useState(current?.notes ?? '');

  const saveAvailability = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/player-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id: player.id,
          team_id: teamId,
          status,
          reason: reason || undefined,
          expected_return: expectedReturn || undefined,
          notes: notes || undefined,
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Failed to save');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['player-availability', teamId] });
      onClose();
    },
  });

  const clearAvailability = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/player-availability?player_id=${player.id}&team_id=${teamId}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error('Failed to clear');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['player-availability', teamId] });
      onClose();
    },
  });

  const isPending = saveAvailability.isPending || clearAvailability.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="availability-modal-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Sheet */}
      <div className="relative z-10 w-full max-w-md rounded-t-2xl bg-zinc-900 p-5 sm:rounded-2xl">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 id="availability-modal-title" className="font-semibold text-zinc-100">
              {player.name}
            </h2>
            <p className="text-xs text-zinc-400">Update availability status</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Status grid */}
        <div className="mb-4 grid grid-cols-5 gap-2">
          {STATUSES.map((s) => {
            const cfg = AVAILABILITY_CONFIG[s];
            const Icon = cfg.icon;
            const isSelected = status === s;
            return (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-xl border p-2.5 text-center transition-all',
                  isSelected
                    ? `${cfg.bg} ${cfg.border} ${cfg.color}`
                    : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200',
                )}
                aria-pressed={isSelected}
                aria-label={cfg.label}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium leading-tight">{cfg.label}</span>
              </button>
            );
          })}
        </div>

        {/* Extra fields — only shown when not "available" */}
        {status !== 'available' && (
          <div className="space-y-3 mb-4">
            <div>
              <label htmlFor="av-reason" className="mb-1 block text-xs font-medium text-zinc-400">
                Reason <span className="text-zinc-500">(optional)</span>
              </label>
              <input
                id="av-reason"
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Sprained ankle, Family trip"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-orange-500 focus:outline-none"
                maxLength={120}
              />
            </div>

            <div>
              <label htmlFor="av-return" className="mb-1 block text-xs font-medium text-zinc-400">
                Expected return <span className="text-zinc-500">(optional)</span>
              </label>
              <input
                id="av-return"
                type="date"
                value={expectedReturn}
                onChange={(e) => setExpectedReturn(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none [color-scheme:dark]"
              />
            </div>

            <div>
              <label htmlFor="av-notes" className="mb-1 block text-xs font-medium text-zinc-400">
                Coach notes <span className="text-zinc-500">(private)</span>
              </label>
              <textarea
                id="av-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional context for your records…"
                rows={2}
                className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-orange-500 focus:outline-none"
                maxLength={300}
              />
            </div>
          </div>
        )}

        {/* Save / error */}
        {saveAvailability.isError && (
          <p className="mb-3 text-xs text-red-400">{String(saveAvailability.error)}</p>
        )}

        <div className="flex gap-2">
          {current && (
            <Button
              variant="outline"
              size="sm"
              className="border-zinc-700 text-zinc-400 hover:text-zinc-200"
              onClick={() => clearAvailability.mutate()}
              disabled={isPending}
              aria-label="Reset to available"
            >
              {clearAvailability.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
            </Button>
          )}
          <Button
            className="flex-1 bg-orange-500 text-white hover:bg-orange-600"
            onClick={() => saveAvailability.mutate()}
            disabled={isPending}
          >
            {saveAvailability.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

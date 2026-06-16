/**
 * Ticket 0086 — `useTeamLimitUpgradeSheet()`.
 *
 * A tiny client hook that wraps the create-team / configure-team POST. When
 * the server returns the structured tier-limit body (`code:
 * 'tier_limit_max_teams'`), this hook surfaces the body so the caller can
 * mount `<TeamLimitUpgradeSheet />` instead of the flat error toast. Any
 * OTHER 4xx (e.g. validation) falls through with a plain message string so
 * the existing toast path stays byte-identical (LESSONS#0103).
 *
 * Smallest-blast-radius wiring per LESSONS#0065 / #0066 / #0162: each caller
 * surface (onboarding/setup, team-switcher) only needs to swap its raw fetch
 * + setError pair for this hook's `submit` + `sheetBody`.
 *
 * Instruct positively in jsdoc; no banned word ever leaves this file
 * (LESSONS#0023 / #0034 / #0088).
 */
'use client';

import { useState, useCallback } from 'react';
import type { TierLimitBody } from '@/components/team/team-limit-upgrade-sheet';

type Endpoint = '/api/auth/create-team' | '/api/auth/configure-team';

interface SubmitArgs {
  endpoint: Endpoint;
  body: Record<string, unknown>;
  /** The team id the upgrade resume should land on. Required when the body
   *  doesn't already carry it (the server populates `attemptedTeamId` only
   *  when it can resolve the team — for a not-yet-created team in
   *  `create-team`, the CALLER knows the target team id from the surrounding
   *  invite context). */
  attemptedTeamId?: string;
}

type SubmitResult =
  | { ok: true; data: any }
  | { ok: false; sheet: TierLimitBody }
  | { ok: false; error: string };

interface UseTeamLimitUpgradeSheet {
  submit: (args: SubmitArgs) => Promise<SubmitResult>;
  /** Populated when the server returned a tier-limit body. Mount the sheet on this. */
  sheetBody: TierLimitBody | null;
  /** Tear down the sheet without changing any other state. */
  closeSheet: () => void;
}

export function useTeamLimitUpgradeSheet(): UseTeamLimitUpgradeSheet {
  const [sheetBody, setSheetBody] = useState<TierLimitBody | null>(null);

  const submit = useCallback(async (args: SubmitArgs): Promise<SubmitResult> => {
    let res: Response;
    try {
      res = await fetch(args.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args.body),
      });
    } catch {
      return { ok: false, error: 'Network error — please try again.' };
    }

    if (res.ok) {
      const data = await res.json();
      return { ok: true, data };
    }

    // Try to parse the structured body. If parsing fails (HTML error page,
    // etc.), fall through to the generic toast path.
    let payload: Record<string, unknown> = {};
    try {
      payload = await res.json();
    } catch {
      return { ok: false, error: `Request failed (${res.status})` };
    }

    if (payload && payload.code === 'tier_limit_max_teams') {
      // The server doesn't know the resolved teamId for a brand-new team in
      // create-team — the caller passes it in via attemptedTeamId.
      const inviteCoachId =
        typeof args.body.inviteCoachId === 'string'
          ? (args.body.inviteCoachId as string)
          : undefined;
      const sheet: TierLimitBody = {
        error: String(payload.error ?? ''),
        upgrade: true,
        code: 'tier_limit_max_teams',
        currentCount: Number(payload.currentCount ?? 0),
        maxCount: Number(payload.maxCount ?? 1),
        attemptedTeamName: (payload.attemptedTeamName as string | null) ?? null,
        attemptedTeamId: args.attemptedTeamId ?? '',
        currentTier: ((payload.currentTier as any) ?? 'free'),
        invitedBy: payload.invitedBy as TierLimitBody['invitedBy'],
        inviteCoachId,
      };
      setSheetBody(sheet);
      return { ok: false, sheet };
    }

    return { ok: false, error: String(payload.error ?? `Request failed (${res.status})`) };
  }, []);

  const closeSheet = useCallback(() => setSheetBody(null), []);

  return { submit, sheetBody, closeSheet };
}

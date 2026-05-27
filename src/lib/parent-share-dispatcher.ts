/**
 * Ticket 0043 — parent-share email dispatcher.
 *
 * The route that fires when a coach taps "Share with all parents" reads
 * `plans.type` and routes the dispatch to the right subject + body template.
 *
 *   - 'parent_report'              → parentShareEmail (the existing per-player
 *                                    progress card; byte-identical, AC11
 *                                    regression-free).
 *   - 'mid_season_team_newsletter' → midSeasonNewsletterEmail (the new
 *                                    ticket-0043 TEAM-wide newsletter).
 *   - any other / unknown type     → falls back to parentShareEmail so we
 *                                    NEVER fail the share dispatch on a future
 *                                    plan type — the existing template stays
 *                                    the safe default.
 *
 * This is a pure routing primitive (no I/O, no network). The actual send
 * happens upstream wherever the share-create surface calls sendEmail(); the
 * dispatcher just resolves WHICH template builds the message. Pulled out so
 * the routing rule itself is unit-testable without standing up a send path.
 */

import {
  parentShareEmail,
  midSeasonNewsletterEmail,
  type BuiltEmail,
} from './email/templates';
import type { PlanType } from '@/types/database';

export type ParentShareContext =
  | {
      planType: 'parent_report';
      parentName: string | null;
      playerName: string;
      coachName: string;
      teamName: string;
      shareUrl: string;
      customMessage?: string | null;
    }
  | {
      planType: 'mid_season_team_newsletter';
      parentName: string | null;
      coachName: string;
      teamName: string;
      shareUrl: string;
    }
  | {
      // Future / unknown plan types fall back to the parent-report template.
      // The dispatcher carries the per-player fields so the fallback still
      // produces a real subject + body rather than 500-ing.
      planType: Exclude<PlanType, 'parent_report' | 'mid_season_team_newsletter'>;
      parentName: string | null;
      playerName: string;
      coachName: string;
      teamName: string;
      shareUrl: string;
      customMessage?: string | null;
    };

/**
 * Resolve which BuiltEmail to send for a parent-share dispatch. Plan type is
 * the discriminator; the existing parent_report path is preserved exactly so
 * AC11's regression guarantee holds (the existing 0016/0034 template is
 * never rewritten by the new newsletter path).
 */
export function buildParentShareEmail(ctx: ParentShareContext): BuiltEmail {
  if (ctx.planType === 'mid_season_team_newsletter') {
    return midSeasonNewsletterEmail({
      parentName: ctx.parentName,
      teamName: ctx.teamName,
      coachName: ctx.coachName,
      shareUrl: ctx.shareUrl,
    });
  }

  // 'parent_report' AND every other / unknown plan type → existing template.
  // The fallback is the SAFE default: never throw on an unknown type, never
  // accidentally invent a new template path for an unmodeled artifact. A
  // narrower fallback (e.g. throw) would silently break a future plan type
  // that legitimately rides the parent-report copy.
  return parentShareEmail({
    parentName: ctx.parentName,
    playerName: ctx.planType === 'parent_report' ? ctx.playerName : ctx.playerName,
    coachName: ctx.coachName,
    shareUrl: ctx.shareUrl,
    customMessage:
      ctx.planType === 'parent_report' ? ctx.customMessage ?? null : null,
  });
}

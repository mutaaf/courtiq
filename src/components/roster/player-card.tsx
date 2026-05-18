'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Check, Clock, Phone, Zap, X } from 'lucide-react';
import type { Player, PlayerAvailability } from '@/types/database';
import { PlayerAvatar } from '@/components/ui/player-avatar';
import { getSportEmoji } from '@/lib/sport-utils';
import { AvailabilityBadge } from '@/components/roster/availability-badge';
import { PlayerAvailabilityModal } from '@/components/roster/player-availability-modal';
import type { PlayerMomentum } from '@/lib/momentum-utils';
import { getMomentumBadgeClasses, getMomentumLabel } from '@/lib/momentum-utils';
import { mutate } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { getTemplatesBySentiment, findTemplateById } from '@/lib/observation-templates';
import { queryKeys } from '@/lib/query/keys';

function formatLastObserved(iso: string | null): { label: string; className: string } | null {
  if (!iso) return { label: 'Never observed', className: 'text-zinc-600' };
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return { label: 'Seen today', className: 'text-emerald-500' };
  if (days === 1) return { label: '1d ago', className: 'text-zinc-500' };
  if (days < 7) return { label: `${days}d ago`, className: 'text-amber-400' };
  if (days < 14) return { label: `${days}d ago`, className: 'text-orange-400' };
  return { label: `${days}d ago`, className: 'text-red-400' };
}

interface PlayerCardProps {
  player: Player;
  observationCount?: number;
  lastObserved?: string | null;
  lastObsPreview?: { text: string; sentiment: string } | null;
  selectMode?: boolean;
  selected?: boolean;
  onSelect?: (playerId: string) => void;
  availability?: PlayerAvailability | null;
  teamId?: string;
  orgId?: string;
  momentum?: PlayerMomentum | null;
  coachName?: string | null;
  teamName?: string | null;
  sportSlug?: string | null;
}

function buildQuickTextMsg(
  player: Player,
  coachName: string | null | undefined,
  teamName: string | null | undefined,
  lastObsPreview: { text: string; sentiment: string } | null | undefined,
  sportSlug?: string | null,
): string {
  const firstName = player.name.split(' ')[0];
  const coachFirst = coachName?.split(' ')[0] ?? 'Your coach';
  const parentFirst = player.parent_name?.split(' ')[0];
  const greeting = parentFirst ? `Hi ${parentFirst}!` : 'Hi!';
  const from = `Coach ${coachFirst}${teamName ? ` from ${teamName}` : ''} here.`;
  const emoji = getSportEmoji(sportSlug);

  if (lastObsPreview?.sentiment === 'positive') {
    const text = lastObsPreview.text.length > 80
      ? lastObsPreview.text.slice(0, 80).trimEnd() + '…'
      : lastObsPreview.text;
    return `${greeting} ${from}\n\n✅ Just wanted to share a great moment from ${firstName}'s recent session: "${text}"\n\nKeep up the encouragement at home! ${emoji}`;
  }
  if (lastObsPreview) {
    return `${greeting} ${from}\n\nJust wanted to connect about ${firstName} — we're working on some skills together and your support at home makes a big difference. See you soon! ${emoji}`;
  }
  return `${greeting} ${from}\n\nJust wanted to reach out about ${firstName} and check in. Looking forward to seeing them at the next session! ${emoji}`;
}

const positionColors: Record<string, string> = {
  PG: 'bg-blue-500/20 text-blue-400',
  SG: 'bg-emerald-500/20 text-emerald-400',
  SF: 'bg-purple-500/20 text-purple-400',
  PF: 'bg-amber-500/20 text-amber-400',
  C: 'bg-red-500/20 text-red-400',
  Flex: 'bg-zinc-700 text-zinc-300',
};

export function PlayerCard({
  player,
  observationCount = 0,
  lastObserved = null,
  lastObsPreview = null,
  selectMode = false,
  selected = false,
  onSelect,
  availability,
  teamId,
  orgId,
  momentum = null,
  coachName,
  teamName,
  sportSlug,
}: PlayerCardProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const practiceActive = useAppStore((s) => s.practiceActive);
  const practiceSessionId = useAppStore((s) => s.practiceSessionId);

  const [showAvailability, setShowAvailability] = useState(false);
  const [textSent, setTextSent] = useState(false);

  // Quick Observe state
  const [showQuickObs, setShowQuickObs] = useState(false);
  const [qoSentiment, setQoSentiment] = useState<'positive' | 'needs-work'>('positive');
  const [qoTemplate, setQoTemplate] = useState<string | null>(null);
  const [qoText, setQoText] = useState('');
  const [qoSaving, setQoSaving] = useState(false);
  const [qoSaved, setQoSaved] = useState(false);

  const qoTemplates = useMemo(
    () => getTemplatesBySentiment(qoSentiment, sportSlug ?? undefined).slice(0, 8),
    [qoSentiment, sportSlug],
  );

  function closeQuickObs() {
    if (qoSaving) return;
    setShowQuickObs(false);
    setQoTemplate(null);
    setQoText('');
    setQoSentiment('positive');
  }

  async function handleQuickObsSave() {
    if (!teamId || !orgId) return;
    const template = findTemplateById(qoTemplate ?? '');
    const text = qoText.trim() || template?.text || '';
    if (!text) return;
    setQoSaving(true);
    const sessionId = practiceActive && practiceSessionId ? practiceSessionId : null;
    try {
      await mutate({
        table: 'observations',
        operation: 'insert',
        data: {
          team_id: teamId,
          org_id: orgId,
          player_name: player.name,
          player_id: player.id,
          text,
          sentiment: qoSentiment,
          category: template?.category || 'general',
          source: 'template',
          ...(sessionId && { session_id: sessionId }),
        },
      });
      qc.invalidateQueries({ queryKey: [...queryKeys.observations.all(teamId), 'counts'] });
      qc.invalidateQueries({ queryKey: queryKeys.observations.player(player.id) });
      if (sessionId) {
        qc.invalidateQueries({ queryKey: ['session-obs-count', sessionId] });
      }
      setQoSaved(true);
      setTimeout(() => {
        setQoSaved(false);
        closeQuickObs();
      }, 1400);
    } catch {
      // silent — save button stays enabled for retry
    } finally {
      setQoSaving(false);
    }
  }

  function handleClick() {
    if (selectMode && onSelect) {
      onSelect(player.id);
    } else {
      router.push(`/roster/${player.id}`);
    }
  }

  function handleAvailabilityClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (teamId) setShowAvailability(true);
  }

  function handleQuickText(e: React.MouseEvent) {
    e.stopPropagation();
    if (!player.parent_phone) return;
    const msg = buildQuickTextMsg(player, coachName, teamName, lastObsPreview, sportSlug);
    const digits = player.parent_phone.replace(/\D/g, '');
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
    setTextSent(true);
    setTimeout(() => setTextSent(false), 2500);
  }

  const status = availability?.status ?? 'available';
  const showBadge = status !== 'available';

  return (
    <>
      <Card
        className={cn(
          'cursor-pointer transition-all hover:border-orange-500/50 hover:bg-zinc-900/80',
          selected && 'border-orange-500 bg-orange-500/5',
        )}
        onClick={handleClick}
      >
        <CardContent className="flex items-center gap-4 p-4">
          {/* Selection checkbox */}
          {selectMode && (
            <div className={cn(
              'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors',
              selected ? 'border-orange-500 bg-orange-500' : 'border-zinc-500 bg-transparent',
            )}>
              {selected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
            </div>
          )}
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <PlayerAvatar photoUrl={player.photo_url} name={player.name} size={48} />
            {player.jersey_number !== null && (
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold text-zinc-300 ring-1 ring-zinc-600">
                {player.jersey_number}
              </span>
            )}
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-zinc-100">{player.name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge
                className={cn(
                  'text-[10px]',
                  positionColors[player.position] || 'bg-zinc-700 text-zinc-300'
                )}
              >
                {player.position}
              </Badge>
              {player.age_group && (
                <span className="text-xs text-zinc-500">{player.age_group}</span>
              )}
              {/* Availability badge — only shown when NOT available */}
              {showBadge && (
                <button
                  onClick={handleAvailabilityClick}
                  className="touch-manipulation"
                  aria-label={`Set availability for ${player.name}`}
                >
                  <AvailabilityBadge status={status} />
                </button>
              )}
              {/* Momentum badge — only shown for non-steady tier to avoid noise, hidden on mobile */}
              {momentum && momentum.tier !== 'steady' && (
                <span
                  className={cn(
                    'hidden sm:inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold',
                    getMomentumBadgeClasses(momentum.tier),
                  )}
                  title={`Momentum: ${momentum.score}/100`}
                >
                  {momentum.tier === 'rising' ? '↑' : '↓'} {getMomentumLabel(momentum.tier)}
                </span>
              )}
            </div>
            {/* Last observed chip — always visible, gives coaches a quick attention-queue scan */}
            {(() => {
              const fmt = formatLastObserved(observationCount === 0 ? null : lastObserved);
              if (!fmt) return null;
              const preview = observationCount > 0 ? lastObsPreview : null;
              const previewColor = preview?.sentiment === 'positive'
                ? 'text-emerald-400'
                : preview?.sentiment === 'negative'
                ? 'text-amber-400'
                : 'text-zinc-500';
              const previewText = preview?.text
                ? preview.text.length > 55
                  ? preview.text.slice(0, 55).trimEnd() + '…'
                  : preview.text
                : null;
              return (
                <div className="mt-1.5 space-y-0.5">
                  <div className={cn('flex items-center gap-1', fmt.className)}>
                    <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="text-[11px] leading-none">{fmt.label}</span>
                  </div>
                  {previewText && (
                    <p className={cn('text-[10px] italic leading-snug', previewColor)}>
                      &ldquo;{previewText}&rdquo;
                    </p>
                  )}
                </div>
              );
            })()}
            {/* Return date hint */}
            {availability?.expected_return && status !== 'available' && (
              <p className="mt-1 text-[10px] text-zinc-500">
                Returns {availability.expected_return}
              </p>
            )}
          </div>

          {/* Right side: obs count (desktop only) + quick actions */}
          <div className="flex flex-col items-end gap-2">
            {observationCount > 0 && (
              <div className="hidden sm:flex flex-col items-center">
                <span className="text-lg font-bold text-orange-500">{observationCount}</span>
                <span className="text-[10px] text-zinc-500">obs</span>
              </div>
            )}
            {/* Quick Observe — one tap to log an observation without leaving the roster list */}
            {!selectMode && teamId && orgId && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowQuickObs(true); }}
                className="touch-manipulation rounded-full p-1.5 transition-colors text-orange-500 hover:bg-orange-500/10 hover:text-orange-400"
                aria-label={`Quick observation for ${player.name}`}
                title="Quick observation"
              >
                <Zap className="h-3.5 w-3.5" />
              </button>
            )}
            {/* Quick-text parent via WhatsApp — only when phone is on file */}
            {player.parent_phone && !selectMode && (
              <button
                onClick={handleQuickText}
                className="touch-manipulation rounded-full p-1.5 transition-colors text-teal-600 hover:bg-teal-500/10 hover:text-teal-400"
                aria-label={`Send WhatsApp update to ${player.name}'s parent`}
                title={`Text ${player.parent_name?.split(' ')[0] ?? 'parent'} on WhatsApp`}
              >
                {textSent
                  ? <Check className="h-3.5 w-3.5 text-teal-400" />
                  : <Phone className="h-3.5 w-3.5" />
                }
              </button>
            )}
            {/* Tap when "available" to set a restriction */}
            {!showBadge && teamId && !selectMode && (
              <button
                onClick={handleAvailabilityClick}
                className="touch-manipulation rounded-full p-1 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-400"
                aria-label={`Set availability for ${player.name}`}
                title="Set availability"
              >
                <AvailabilityBadge status="available" size="dot" />
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {showAvailability && teamId && (
        <PlayerAvailabilityModal
          player={player}
          teamId={teamId}
          current={availability ?? null}
          onClose={() => setShowAvailability(false)}
        />
      )}

      {/* Quick Observe bottom sheet */}
      {showQuickObs && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={closeQuickObs} />
          <div className="relative rounded-t-2xl bg-zinc-900 border-t border-zinc-800 p-5 space-y-4 max-h-[85vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500 font-medium">Quick Observation</p>
                <h2 className="text-base font-bold text-zinc-100">
                  {player.jersey_number !== null ? `#${player.jersey_number} ` : ''}{player.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeQuickObs}
                className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Sentiment Toggle */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setQoSentiment('positive'); setQoTemplate(null); }}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold transition-colors ${
                  qoSentiment === 'positive'
                    ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-600'
                }`}
              >
                👍 Positive
              </button>
              <button
                type="button"
                onClick={() => { setQoSentiment('needs-work'); setQoTemplate(null); }}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold transition-colors ${
                  qoSentiment === 'needs-work'
                    ? 'border-amber-500 bg-amber-500/15 text-amber-400'
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-600'
                }`}
              >
                👎 Needs Work
              </button>
            </div>

            {/* Template Chips */}
            <div>
              <p className="mb-2 text-xs font-medium text-zinc-500">Quick templates</p>
              <div className="flex flex-wrap gap-2">
                {qoTemplates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setQoTemplate(qoTemplate === t.id ? null : t.id)}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      qoTemplate === t.id
                        ? qoSentiment === 'positive'
                          ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                          : 'border-amber-500 bg-amber-500/20 text-amber-300'
                        : 'border-zinc-700 text-zinc-300 hover:border-zinc-500'
                    }`}
                  >
                    <span>{t.emoji}</span>
                    {t.text}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional note */}
            <div>
              <p className="mb-2 text-xs font-medium text-zinc-500">
                {qoTemplate ? 'Add a note (optional)' : 'Or type your own observation'}
              </p>
              <textarea
                value={qoText}
                onChange={(e) => setQoText(e.target.value)}
                placeholder={qoTemplate ? 'Extra details…' : 'Describe what you saw…'}
                rows={2}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none"
              />
            </div>

            {/* Save */}
            <button
              type="button"
              disabled={qoSaving || qoSaved || (!qoTemplate && !qoText.trim())}
              onClick={handleQuickObsSave}
              className={`w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold transition-colors ${
                qoSaved
                  ? 'bg-emerald-600 text-white'
                  : qoSaving || (!qoTemplate && !qoText.trim())
                  ? 'bg-orange-500/40 text-white/60 cursor-not-allowed'
                  : 'bg-orange-500 hover:bg-orange-400 text-white'
              }`}
            >
              {qoSaved ? (
                <><Check className="h-4 w-4" /> Saved!</>
              ) : qoSaving ? (
                'Saving…'
              ) : (
                'Save Observation'
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

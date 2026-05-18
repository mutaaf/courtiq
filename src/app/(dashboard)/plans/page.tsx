'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { query, mutate } from '@/lib/api';
import type { TrainingPlan, Player, TrainingPlanSession } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Copy,
  Edit3,
  Loader2,
  Plus,
  Share2,
  Trash2,
  Users,
  Wand2,
  X,
  CheckCircle2,
  FileText,
  Clock,
  Dumbbell,
  Target,
  ChevronUp,
  Filter,
  ArrowRight,
  ListChecks,
  MessageSquare,
  Send,
  Check,
  Info,
  Zap,
} from 'lucide-react';
import { callAIWithJSON } from '@/lib/ai/client';
import { buildPlanPrompt, buildSessionPrompt } from '@/lib/ai/prompts';
import { UpgradeGate } from '@/components/ui/upgrade-gate';
import { useTier } from '@/hooks/use-tier';
import type { TierKey } from '@/lib/tier';
import { TIER_LIMITS } from '@/lib/tier';
import { SessionCard } from '@/components/plans/session-card';
import { RosterPicker } from '@/components/plans/roster-picker';
import { TeamGroupMessageCard } from '@/components/plans/team-group-message-card';
import { PlayerQuickObsModal } from '@/components/observations/player-quick-obs-modal';
import type { GroupMessageResult } from '@/lib/team-group-message-utils';
import type { GroupMessageSendResult } from '@/components/plans/team-group-message-card';
import { getSportEmoji } from '@/lib/sport-utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlanWithSessions extends TrainingPlan {
  training_plan_sessions: TrainingPlanSession[];
}

interface PlanSection {
  title: string;
  duration_minutes?: number;
  objectives: string[];
  activities: PlanActivity[];
  coaching_notes?: string;
}

interface PlanActivity {
  name: string;
  duration_minutes?: number;
  description: string;
  equipment?: string[];
  variations?: string[];
  coaching_points?: string[];
}

interface GeneratedPlan {
  plan_title: string;
  overview: string;
  total_duration_minutes: number;
  focus_areas: string[];
  sessions: GeneratedSession[];
}

interface GeneratedSession {
  session_number: number;
  session_label?: string;
  objectives: string[];
  sections: PlanSection[];
  session_notes?: string;
}

interface ParsedSession {
  session_number: number;
  session_label: string;
  content: string;
}

interface ShareSheetProps {
  text: string;
  onClose: () => void;
}

// ─── Inline share sheet ───────────────────────────────────────────────────────

function ShareSheet({ text, onClose }: ShareSheetProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-zinc-900 border border-zinc-700 p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="font-semibold text-zinc-100">Share Session Plan</p>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            <X className="h-5 w-5" />
          </button>
        </div>
        <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl bg-zinc-800 p-3 text-xs text-zinc-300 font-mono">
          {text}
        </pre>
        <div className="flex gap-2">
          <Button
            onClick={handleCopy}
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
          >
            {copied ? <><CheckCircle2 className="h-4 w-4 mr-1.5" /> Copied!</> : <><Copy className="h-4 w-4 mr-1.5" /> Copy Text</>}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
              window.open(url, '_blank', 'noopener');
            }}
            className="flex-1 border-zinc-700 text-zinc-300 hover:text-zinc-100"
          >
            <Share2 className="h-4 w-4 mr-1.5" /> WhatsApp
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDrillText(activity: PlanActivity): string {
  const lines: string[] = [`*${activity.name}*`];
  if (activity.duration_minutes) lines.push(`⏱ ${activity.duration_minutes} min`);
  lines.push(activity.description);
  if (activity.coaching_points?.length) {
    lines.push('Key points:');
    activity.coaching_points.forEach((p) => lines.push(`• ${p}`));
  }
  return lines.join('\n');
}

function formatSectionText(section: PlanSection): string {
  const lines: string[] = [`📌 ${section.title.toUpperCase()}`];
  if (section.duration_minutes) lines.push(`⏱ ${section.duration_minutes} min`);
  if (section.objectives?.length) {
    lines.push('Goals: ' + section.objectives.join(', '));
  }
  section.activities.forEach((a) => {
    lines.push('');
    lines.push(formatDrillText(a));
  });
  if (section.coaching_notes) {
    lines.push('');
    lines.push(`💡 ${section.coaching_notes}`);
  }
  return lines.join('\n');
}

function formatSessionShareText(
  session: GeneratedSession,
  teamName: string,
  sportEmoji: string,
): string {
  const header = `${sportEmoji} ${teamName} — ${session.session_label ?? `Session ${session.session_number}`}`;
  const lines: string[] = [header, ''];

  if (session.objectives?.length) {
    lines.push('🎯 Session Goals');
    session.objectives.forEach((o) => lines.push(`• ${o}`));
    lines.push('');
  }

  session.sections.forEach((s) => {
    lines.push(formatSectionText(s));
    lines.push('');
  });

  if (session.session_notes) {
    lines.push(`📝 ${session.session_notes}`);
  }

  return lines.join('\n').trim();
}

// ─── Session detail panel ──────────────────────────────────────────────────────

interface SessionDetailPanelProps {
  session: GeneratedSession;
  teamName: string;
  sportEmoji: string;
  onClose: () => void;
}

function SessionDetailPanel({ session, teamName, sportEmoji, onClose }: SessionDetailPanelProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const shareText = formatSessionShareText(session, teamName, sportEmoji);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-40 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-zinc-900 border-t border-zinc-700 p-5 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-orange-400">
              {sportEmoji} Session {session.session_number}
            </p>
            <p className="text-lg font-bold text-zinc-100 mt-0.5">
              {session.session_label ?? `Session ${session.session_number}`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShareOpen(true)}
              className="border-zinc-700 text-zinc-300 hover:text-zinc-100 gap-1.5"
            >
              <Share2 className="h-3.5 w-3.5" /> Share
            </Button>
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 p-1">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {session.objectives?.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Session Goals</p>
            <ul className="space-y-1">
              {session.objectives.map((obj, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                  <Target className="h-3.5 w-3.5 shrink-0 mt-0.5 text-orange-400" />
                  {obj}
                </li>
              ))}
            </ul>
          </div>
        )}

        {session.sections.map((section, si) => (
          <div key={si} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                {section.title}
              </span>
              {section.duration_minutes && (
                <span className="text-[10px] bg-zinc-800 rounded-full px-2 py-0.5 text-zinc-500">
                  {section.duration_minutes} min
                </span>
              )}
            </div>
            {section.activities.map((act, ai) => (
              <div key={ai} className="rounded-xl bg-zinc-800/60 p-3 space-y-1.5">
                <p className="text-sm font-semibold text-zinc-100">{act.name}</p>
                {act.duration_minutes && (
                  <p className="text-[11px] text-zinc-500">{act.duration_minutes} min</p>
                )}
                <p className="text-xs text-zinc-400">{act.description}</p>
                {act.coaching_points?.length ? (
                  <ul className="space-y-0.5 pt-1">
                    {act.coaching_points.map((cp, ci) => (
                      <li key={ci} className="text-[11px] text-zinc-500 flex items-start gap-1.5">
                        <span className="text-orange-400 shrink-0">•</span> {cp}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {act.variations?.length ? (
                  <p className="text-[11px] text-zinc-600 italic">
                    Variations: {act.variations.join(', ')}
                  </p>
                ) : null}
              </div>
            ))}
            {section.coaching_notes && (
              <p className="text-xs text-zinc-500 italic pl-1">
                💡 {section.coaching_notes}
              </p>
            )}
          </div>
        ))}

        {session.session_notes && (
          <p className="text-sm text-zinc-400 italic">{session.session_notes}</p>
        )}
      </div>
      {shareOpen && (
        <ShareSheet text={shareText} onClose={() => setShareOpen(false)} />
      )}
    </>
  );
}

// ─── TeamGroupMessageRenderer ─────────────────────────────────────────────────

interface TeamGroupMessageRendererProps {
  teamId: string;
  teamName: string;
  coachName: string;
  sportSlug: string | null;
  sessions: GeneratedSession[];
}

function TeamGroupMessageRenderer({
  teamId,
  teamName,
  coachName,
  sportSlug,
  sessions,
}: TeamGroupMessageRendererProps) {
  const [selectedSessionIdx, setSelectedSessionIdx] = useState(0);
  const [sendResult, setSendResult] = useState<GroupMessageSendResult | null>(null);

  const session = sessions[selectedSessionIdx];
  if (!session) return null;

  const sessionLines: string[] = [];
  const sessionTitle = session.session_label ?? `Session ${session.session_number}`;

  if (session.objectives?.length) {
    sessionLines.push('🎯 Goals: ' + session.objectives.slice(0, 2).join(', '));
  }

  const allActivities = session.sections.flatMap((s) => s.activities);
  if (allActivities.length) {
    sessionLines.push('🏋️ Drills: ' + allActivities.slice(0, 3).map((a) => a.name).join(', '));
  }

  const totalDuration = session.sections.reduce(
    (sum, s) => sum + (s.duration_minutes ?? 0),
    0,
  );
  if (totalDuration > 0) {
    sessionLines.push(`⏱ Duration: ${totalDuration} min`);
  }

  if (session.session_notes) {
    sessionLines.push(`📝 ${session.session_notes}`);
  }

  return (
    <div className="space-y-4">
      {sessions.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {sessions.map((s, i) => (
            <button
              key={i}
              onClick={() => setSelectedSessionIdx(i)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                i === selectedSessionIdx
                  ? 'bg-orange-500 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700',
              )}
            >
              {s.session_label ?? `Session ${s.session_number}`}
            </button>
          ))}
        </div>
      )}

      <TeamGroupMessageCard
        key={selectedSessionIdx}
        teamId={teamId}
        teamName={teamName}
        coachName={coachName}
        sportSlug={sportSlug}
        customMessage={sessionLines.join('\n')}
        customTitle={sessionTitle}
        onSendResult={setSendResult}
      />

      {sendResult && (
        <div className={cn(
          'rounded-xl border p-3 text-sm',
          sendResult.failedCount === 0
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
            : 'border-amber-500/30 bg-amber-500/10 text-amber-300',
        )}>
          {sendResult.failedCount === 0
            ? `✅ Sent to ${sendResult.sentCount} player${sendResult.sentCount !== 1 ? 's' : ''}`
            : `⚠️ Sent: ${sendResult.sentCount}, Failed: ${sendResult.failedCount}`}
        </div>
      )}
    </div>
  );
}

// ─── Focus area chips ─────────────────────────────────────────────────────────

interface FocusAreaPickerProps {
  sport: string;
  selected: string[];
  onChange: (areas: string[]) => void;
}

const SPORT_FOCUS_AREAS: Record<string, string[]> = {
  basketball: ['Ball Handling', 'Shooting', 'Defense', 'Passing', 'Rebounding', 'Footwork', 'Conditioning', 'Game IQ'],
  soccer: ['Dribbling', 'Passing', 'Shooting', 'Defense', 'Positioning', 'Set Pieces', 'Fitness', 'Heading'],
  volleyball: ['Serving', 'Passing', 'Setting', 'Attacking', 'Blocking', 'Defense', 'Communication', 'Rotation'],
  flag_football: ['Routes', 'Throwing', 'Catching', 'Defense', 'Blocking', 'Snap Count', 'Playbook', 'Conditioning'],
  baseball: ['Hitting', 'Fielding', 'Pitching', 'Base Running', 'Catching', 'Throwing', 'Bunting', 'Game IQ'],
  softball: ['Hitting', 'Fielding', 'Pitching', 'Base Running', 'Catching', 'Throwing', 'Slap Hitting', 'Game IQ'],
  lacrosse: ['Stick Work', 'Shooting', 'Defense', 'Passing', 'Ground Balls', 'Dodging', 'Faceoffs', 'Conditioning'],
  swimming: ['Freestyle', 'Backstroke', 'Breaststroke', 'Butterfly', 'Turns', 'Starts', 'Endurance', 'Technique'],
  tennis: ['Forehand', 'Backhand', 'Serve', 'Volley', 'Movement', 'Strategy', 'Return', 'Conditioning'],
  gymnastics: ['Vault', 'Bars', 'Beam', 'Floor', 'Strength', 'Flexibility', 'Tumbling', 'Choreography'],
};

function FocusAreaPicker({ sport, selected, onChange }: FocusAreaPickerProps) {
  const areas = SPORT_FOCUS_AREAS[sport] ?? SPORT_FOCUS_AREAS.basketball;

  function toggle(area: string) {
    if (selected.includes(area)) {
      onChange(selected.filter((a) => a !== area));
    } else if (selected.length < 4) {
      onChange([...selected, area]);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {areas.map((area) => (
        <button
          key={area}
          type="button"
          onClick={() => toggle(area)}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium border transition-colors',
            selected.includes(area)
              ? 'border-orange-500 bg-orange-500/20 text-orange-300'
              : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300',
          )}
        >
          {area}
        </button>
      ))}
      {selected.length >= 4 && (
        <span className="text-[11px] text-zinc-600 self-center">Max 4 selected</span>
      )}
    </div>
  );
}

// ─── Duration picker ──────────────────────────────────────────────────────────

interface DurationPickerProps {
  value: number;
  onChange: (v: number) => void;
}

function DurationPicker({ value, onChange }: DurationPickerProps) {
  const options = [30, 45, 60, 75, 90];
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium border transition-colors',
            value === opt
              ? 'border-orange-500 bg-orange-500/20 text-orange-300'
              : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600',
          )}
        >
          {opt} min
        </button>
      ))}
    </div>
  );
}

// ─── Player context pill ──────────────────────────────────────────────────────

interface PlayerContextPillProps {
  player: Player;
  onRemove: () => void;
}

function PlayerContextPill({ player, onRemove }: PlayerContextPillProps) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-zinc-800 border border-zinc-700 pl-2 pr-1 py-0.5">
      <span className="text-xs text-zinc-300">{player.name}</span>
      <button
        type="button"
        onClick={onRemove}
        className="text-zinc-600 hover:text-zinc-400 rounded-full"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// ─── Plan list item ───────────────────────────────────────────────────────────

interface PlanListItemProps {
  plan: PlanWithSessions;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}

function PlanListItem({ plan, isActive, onClick, onDelete }: PlanListItemProps) {
  return (
    <div
      className={cn(
        'group flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-all',
        isActive
          ? 'border-orange-500/50 bg-orange-500/5'
          : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/50',
      )}
      onClick={onClick}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-800">
        <ClipboardList className="h-4 w-4 text-orange-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-zinc-100">{plan.title}</p>
        <p className="text-[11px] text-zinc-500">
          {plan.training_plan_sessions.length} session{plan.training_plan_sessions.length !== 1 ? 's' : ''} · {new Date(plan.created_at).toLocaleDateString()}
        </p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="shrink-0 rounded-md p-1 text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
        aria-label="Delete plan"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Plan wizard ──────────────────────────────────────────────────────────────

interface PlanWizardProps {
  teamId: string;
  sport: string;
  playerCount: number;
  onGenerate: (params: GeneratePlanParams) => Promise<void>;
  isGenerating: boolean;
  players: Player[];
}

interface GeneratePlanParams {
  numSessions: number;
  duration: number;
  focusAreas: string[];
  customContext: string;
  contextPlayerIds: string[];
}

function PlanWizard({
  teamId,
  sport,
  playerCount,
  onGenerate,
  isGenerating,
  players,
}: PlanWizardProps) {
  const [numSessions, setNumSessions] = useState(3);
  const [duration, setDuration] = useState(60);
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [customContext, setCustomContext] = useState('');
  const [showPlayerPicker, setShowPlayerPicker] = useState(false);
  const [contextPlayerIds, setContextPlayerIds] = useState<string[]>([]);

  const contextPlayers = players.filter((p) => contextPlayerIds.includes(p.id));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onGenerate({ numSessions, duration, focusAreas, customContext, contextPlayerIds });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Sessions count */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-zinc-300">Number of Sessions</label>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setNumSessions(n)}
              className={cn(
                'w-10 h-10 rounded-xl text-sm font-bold border transition-colors',
                numSessions === n
                  ? 'border-orange-500 bg-orange-500/20 text-orange-300'
                  : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600',
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Duration */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-zinc-300">Session Duration</label>
        <DurationPicker value={duration} onChange={setDuration} />
      </div>

      {/* Focus areas */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-zinc-300">
          Focus Areas <span className="text-zinc-600 font-normal">(up to 4)</span>
        </label>
        <FocusAreaPicker sport={sport} selected={focusAreas} onChange={setFocusAreas} />
      </div>

      {/* Player context */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-zinc-300">
            Player Context <span className="text-zinc-600 font-normal">(optional)</span>
          </label>
          <button
            type="button"
            onClick={() => setShowPlayerPicker(true)}
            className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1"
          >
            <Plus className="h-3 w-3" /> Add Players
          </button>
        </div>
        {contextPlayers.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {contextPlayers.map((p) => (
              <PlayerContextPill
                key={p.id}
                player={p}
                onRemove={() => setContextPlayerIds((ids) => ids.filter((id) => id !== p.id))}
              />
            ))}
          </div>
        )}
        {contextPlayers.length === 0 && (
          <p className="text-[11px] text-zinc-600">
            Add players to tailor the plan to their skill levels and recent observations.
          </p>
        )}
      </div>

      {/* Custom notes */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-zinc-300">
          Additional Notes <span className="text-zinc-600 font-normal">(optional)</span>
        </label>
        <Textarea
          value={customContext}
          onChange={(e) => setCustomContext(e.target.value)}
          placeholder="E.g. We have 4 cones and 2 baskets. Focus more on weak-hand dribbling this week…"
          className="h-24 resize-none bg-zinc-900 border-zinc-700 text-zinc-200 placeholder:text-zinc-600 text-sm"
        />
      </div>

      {/* Submit */}
      <Button
        type="submit"
        disabled={isGenerating}
        className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold h-12 text-base"
      >
        {isGenerating ? (
          <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Generating Plan…</>
        ) : (
          <><Wand2 className="h-5 w-5 mr-2" /> Generate Plan</>
        )}
      </Button>

      {showPlayerPicker && (
        <RosterPicker
          teamId={teamId}
          selected={contextPlayerIds}
          onConfirm={(ids) => { setContextPlayerIds(ids); setShowPlayerPicker(false); }}
          onClose={() => setShowPlayerPicker(false)}
        />
      )}
    </form>
  );
}

// ─── Plan detail view ─────────────────────────────────────────────────────────

interface PlanDetailProps {
  plan: PlanWithSessions;
  teamId: string;
  teamName: string;
  coachName: string;
  sport: string;
  sportSlug: string | null;
  players: Player[];
  onBack: () => void;
  onDelete: () => void;
}

function PlanDetail({
  plan,
  teamId,
  teamName,
  coachName,
  sport,
  sportSlug,
  players,
  onBack,
  onDelete,
}: PlanDetailProps) {
  const [activeTab, setActiveTab] = useState<'sessions' | 'message' | 'drills'>('sessions');
  const [detailSession, setDetailSession] = useState<GeneratedSession | null>(null);
  const [shareText, setShareText] = useState<string | null>(null);
  const [activeQuickObsPlayer, setActiveQuickObsPlayer] = useState<Player | null>(null);

  const sportEmoji = getSportEmoji(sportSlug);

  const parsedSessions: ParsedSession[] = plan.training_plan_sessions
    .sort((a, b) => a.session_number - b.session_number)
    .map((s) => ({
      session_number: s.session_number,
      session_label: s.session_label ?? `Session ${s.session_number}`,
      content: s.content,
    }));

  const generatedSessions: GeneratedSession[] = parsedSessions.map((ps) => {
    try {
      return { session_number: ps.session_number, session_label: ps.session_label, ...JSON.parse(ps.content) };
    } catch {
      return { session_number: ps.session_number, session_label: ps.session_label, objectives: [], sections: [] };
    }
  });

  function buildTeamShareText(): string {
    const lines: string[] = [
      `${sportEmoji} ${teamName} Training Plan`,
      plan.title,
      '',
    ];
    parsedSessions.forEach((s) => {
      lines.push(`📅 ${s.session_label}`);
    });
    lines.push('');
    lines.push(`— Coach ${coachName}`);
    return lines.join('\n');
  }

  function handleSharePlan() {
    setShareText(buildTeamShareText());
  }

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-start gap-3">
          <button
            onClick={onBack}
            className="shrink-0 rounded-xl p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <ChevronDown className="h-5 w-5 rotate-90" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-orange-400">
              {sportEmoji} Training Plan
            </p>
            <p className="text-lg font-bold text-zinc-100 leading-snug mt-0.5 truncate">
              {plan.title}
            </p>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              {parsedSessions.length} session{parsedSessions.length !== 1 ? 's' : ''} · Created {new Date(plan.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={handleSharePlan}
              className="border-zinc-700 text-zinc-400 hover:text-zinc-200 gap-1 h-8 px-2.5"
            >
              <Share2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline text-xs">Share</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onDelete}
              className="border-zinc-700 text-zinc-500 hover:text-red-400 hover:border-red-500/40 gap-1 h-8 px-2.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl bg-zinc-900 border border-zinc-800 p-1">
          {[
            { id: 'sessions', label: 'Sessions', icon: ListChecks },
            { id: 'message', label: 'Message Team', icon: MessageSquare },
            { id: 'drills', label: 'Drill Bank', icon: Dumbbell },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as typeof activeTab)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors',
                activeTab === id
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-400',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Sessions tab */}
        {activeTab === 'sessions' && (
          <div className="space-y-3">
            {parsedSessions.map((ps, i) => (
              <SessionCard
                key={ps.session_number}
                session={ps}
                sessionIndex={i}
                onViewDetail={() => setDetailSession(generatedSessions[i])}
                players={players}
                onQuickObs={(player) => setActiveQuickObsPlayer(player)}
              />
            ))}
          </div>
        )}

        {/* Message tab */}
        {activeTab === 'message' && (
          <TeamGroupMessageRenderer
            teamId={teamId}
            teamName={teamName}
            coachName={coachName}
            sportSlug={sportSlug}
            sessions={generatedSessions}
          />
        )}

        {/* Drills tab */}
        {activeTab === 'drills' && (
          <DrillBankTab sessions={generatedSessions} />
        )}
      </div>

      {detailSession && (
        <SessionDetailPanel
          session={detailSession}
          teamName={teamName}
          sportEmoji={sportEmoji}
          onClose={() => setDetailSession(null)}
        />
      )}

      {shareText && (
        <ShareSheet text={shareText} onClose={() => setShareText(null)} />
      )}

      {activeQuickObsPlayer && (
        <PlayerQuickObsModal
          player={activeQuickObsPlayer}
          teamId={teamId}
          onClose={() => setActiveQuickObsPlayer(null)}
        />
      )}
    </>
  );
}

// ─── Drill bank tab ───────────────────────────────────────────────────────────

interface DrillBankTabProps {
  sessions: GeneratedSession[];
}

function DrillBankTab({ sessions }: DrillBankTabProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');

  const allActivities = sessions.flatMap((s) =>
    s.sections.flatMap((sec) =>
      sec.activities.map((a) => ({ ...a, section: sec.title, session: s.session_label ?? `Session ${s.session_number}` }))
    )
  );

  const sections = [...new Set(allActivities.map((a) => a.section))];

  const filtered = allActivities.filter((a) => {
    const matchSearch = !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.description.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || a.section === filter;
    return matchSearch && matchFilter;
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search drills…"
            className="pl-8 h-9 bg-zinc-900 border-zinc-700 text-zinc-200 placeholder:text-zinc-600 text-sm"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-9 rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 text-xs px-2"
        >
          <option value="all">All Sections</option>
          {sections.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-zinc-600 text-sm py-8">No drills found.</p>
      )}

      <div className="space-y-2">
        {filtered.map((act, i) => (
          <div key={i} className="rounded-xl bg-zinc-900 border border-zinc-800 p-3 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-zinc-100">{act.name}</p>
              <div className="flex gap-1 shrink-0">
                <span className="text-[10px] bg-zinc-800 rounded-full px-2 py-0.5 text-zinc-500">{act.section}</span>
                {act.duration_minutes && (
                  <span className="text-[10px] bg-zinc-800 rounded-full px-2 py-0.5 text-zinc-500">{act.duration_minutes}m</span>
                )}
              </div>
            </div>
            <p className="text-xs text-zinc-400">{act.description}</p>
            {act.coaching_points?.length ? (
              <ul className="space-y-0.5 pt-1">
                {act.coaching_points.slice(0, 2).map((cp, ci) => (
                  <li key={ci} className="text-[11px] text-zinc-500 flex items-start gap-1.5">
                    <span className="text-orange-400 shrink-0">•</span> {cp}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Quick session generator ──────────────────────────────────────────────────

interface QuickSessionGeneratorProps {
  teamId: string;
  sport: string;
  players: Player[];
  teamName: string;
  coachName: string;
  sportSlug: string | null;
  onGenerated: (session: ParsedSession) => void;
}

function QuickSessionGenerator({
  teamId,
  sport,
  players,
  teamName,
  coachName,
  sportSlug,
  onGenerated,
}: QuickSessionGeneratorProps) {
  const [focus, setFocus] = useState<string[]>([]);
  const [duration, setDuration] = useState(45);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showMessage, setShowMessage] = useState(false);
  const [generatedSession, setGeneratedSession] = useState<GeneratedSession | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  async function handleGenerate() {
    setIsGenerating(true);
    try {
      const prompt = buildSessionPrompt({ sport, duration, focusAreas: focus, playerCount: players.length });
      const result = await callAIWithJSON<GeneratedSession>(prompt);
      if (result) {
        const ps: ParsedSession = {
          session_number: 1,
          session_label: result.session_label ?? 'Quick Session',
          content: JSON.stringify(result),
        };
        setGeneratedSession(result);
        onGenerated(ps);
      }
    } finally {
      setIsGenerating(false);
    }
  }

  if (generatedSession) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-zinc-100">
            {generatedSession.session_label ?? 'Quick Session'}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowDetail(true)}
              className="border-zinc-700 text-zinc-400 gap-1 h-8 px-2.5 text-xs"
            >
              <FileText className="h-3 w-3" /> Details
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowMessage(true)}
              className="border-zinc-700 text-zinc-400 gap-1 h-8 px-2.5 text-xs"
            >
              <MessageSquare className="h-3 w-3" /> Message Team
            </Button>
            <Button
              size="sm"
              onClick={() => { setGeneratedSession(null); setFocus([]); }}
              className="bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 gap-1 h-8 px-2.5 text-xs border-0"
            >
              <Zap className="h-3 w-3" /> New
            </Button>
          </div>
        </div>

        {session.objectives?.length > 0 && (
          <ul className="space-y-1">
            {generatedSession.objectives?.slice(0, 2).map((obj, i) => (
              <li key={i} className="text-xs text-zinc-400 flex items-start gap-1.5">
                <Target className="h-3 w-3 shrink-0 mt-0.5 text-orange-400" />
                {obj}
              </li>
            ))}
          </ul>
        )}

        {showMessage && (
          <TeamGroupMessageRenderer
            teamId={teamId}
            teamName={teamName}
            coachName={coachName}
            sportSlug={sportSlug}
            sessions={[generatedSession]}
          />
        )}

        {showDetail && (
          <SessionDetailPanel
            session={generatedSession}
            teamName={teamName}
            sportEmoji={getSportEmoji(sportSlug)}
            onClose={() => setShowDetail(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Duration</p>
        <DurationPicker value={duration} onChange={setDuration} />
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Focus <span className="text-zinc-600 font-normal">(optional)</span></p>
        <FocusAreaPicker sport={sport} selected={focus} onChange={setFocus} />
      </div>
      <Button
        onClick={handleGenerate}
        disabled={isGenerating}
        className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold"
      >
        {isGenerating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating…</> : <><Zap className="h-4 w-4 mr-2" /> Quick Generate</>}
      </Button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PlansPage() {
  const { activeTeam, coach, sportSlug } = useActiveTeam();
  const { tier } = useTier();
  const queryClient = useQueryClient();

  const teamId = activeTeam?.id ?? '';
  const sport = activeTeam?.sport ?? 'basketball';
  const teamName = activeTeam?.name ?? 'Team';
  const coachName = coach?.name ?? 'Coach';

  const [view, setView] = useState<'list' | 'create' | 'quick'>('list');
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [shareText, setShareText] = useState('');

  // Fetch plans
  const { data: plans = [], isLoading: plansLoading } = useQuery<PlanWithSessions[]>({
    queryKey: ['training-plans', teamId],
    queryFn: () =>
      query<PlanWithSessions[]>({
        table: 'training_plans',
        select: '*, training_plan_sessions(*)',
        filters: { team_id: teamId },
        order: { column: 'created_at', ascending: false },
      }).then((r) => r ?? []),
    enabled: !!teamId,
    staleTime: 5 * 60_000,
  });

  // Fetch players
  const { data: players = [] } = useQuery<Player[]>({
    queryKey: ['roster', teamId],
    queryFn: () =>
      query<Player[]>({
        table: 'players',
        select: '*',
        filters: { team_id: teamId },
        order: { column: 'name', ascending: true },
      }).then((r) => r ?? []),
    enabled: !!teamId,
    staleTime: 10 * 60_000,
  });

  const activePlan = plans.find((p) => p.id === activePlanId) ?? null;

  // Delete plan mutation
  const deletePlan = useMutation({
    mutationFn: (planId: string) =>
      mutate({ table: 'training_plans', action: 'delete', id: planId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-plans', teamId] });
      if (activePlanId) setActivePlanId(null);
    },
  });

  async function handleGeneratePlan(params: GeneratePlanParams) {
    if (!teamId) return;
    setIsGenerating(true);
    setGenerationProgress('Analyzing your team…');

    try {
      // Build context from selected players
      const contextPlayers = players.filter((p) => params.contextPlayerIds.includes(p.id));
      const playerContext = contextPlayers.length
        ? `Players: ${contextPlayers.map((p) => `${p.name} (${p.position})`).join(', ')}`
        : '';

      setGenerationProgress('Building training sessions…');

      const prompt = buildPlanPrompt({
        sport,
        numSessions: params.numSessions,
        duration: params.duration,
        focusAreas: params.focusAreas,
        customContext: [params.customContext, playerContext].filter(Boolean).join('\n'),
        playerCount: players.length,
      });

      const generated = await callAIWithJSON<GeneratedPlan>(prompt);
      if (!generated) throw new Error('No plan generated');

      setGenerationProgress('Saving plan…');

      // Create the plan record
      const planResult = await mutate({
        table: 'training_plans',
        action: 'insert',
        data: {
          team_id: teamId,
          title: generated.plan_title,
          overview: generated.overview,
          focus_areas: generated.focus_areas,
          total_duration_minutes: generated.total_duration_minutes,
          sport,
        },
      });

      if (!planResult?.id) throw new Error('Plan insert failed');

      // Create session records
      for (const session of generated.sessions) {
        await mutate({
          table: 'training_plan_sessions',
          action: 'insert',
          data: {
            plan_id: planResult.id,
            session_number: session.session_number,
            session_label: session.session_label ?? `Session ${session.session_number}`,
            content: JSON.stringify({
              objectives: session.objectives,
              sections: session.sections,
              session_notes: session.session_notes,
            }),
          },
        });
      }

      await queryClient.invalidateQueries({ queryKey: ['training-plans', teamId] });
      setActivePlanId(planResult.id);
      setView('list');
    } catch (err) {
      console.error('Plan generation failed', err);
    } finally {
      setIsGenerating(false);
      setGenerationProgress('');
    }
  }

  function buildTeamPersonalityShareText(): string {
    const lines = [
      `${getSportEmoji(sportSlug)} ${teamName}`,
      `Coach: ${coachName}`,
      '',
      `We're using SportsIQ to track player development and run smarter practices.`,
      '',
      `Powered by SportsIQ ${getSportEmoji(sportSlug)}`,
    ];
    return lines.join('\n');
  }

  function handleShareTeamPersonality() {
    const text = buildTeamPersonalityShareText();
    if (navigator.share) {
      navigator.share({ text }).catch(() => {
        setShareText(text);
        setShareOpen(true);
      });
    } else {
      setShareText(text);
      setShareOpen(true);
    }
  }

  // Upgrade gate check
  const planLimit = (TIER_LIMITS[tier as TierKey] as any)?.training_plans ?? 1;
  const atPlanLimit = plans.length >= planLimit && tier !== 'organization';

  if (!teamId) {
    return (
      <div className="flex items-center justify-center min-h-[50dvh]">
        <p className="text-zinc-500">No team selected.</p>
      </div>
    );
  }

  // ─── Active plan detail ────────────────────────────────────────────────────

  if (activePlan) {
    return (
      <div className="mx-auto max-w-2xl px-4 pb-24 pt-4">
        <PlanDetail
          plan={activePlan}
          teamId={teamId}
          teamName={teamName}
          coachName={coachName}
          sport={sport}
          sportSlug={sportSlug}
          players={players}
          onBack={() => setActivePlanId(null)}
          onDelete={() => deletePlan.mutate(activePlan.id)}
        />
      </div>
    );
  }

  // ─── Create / Quick views ──────────────────────────────────────────────────

  if (view === 'create') {
    return (
      <div className="mx-auto max-w-2xl px-4 pb-24 pt-4 space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setView('list')}
            className="rounded-xl p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <ChevronDown className="h-5 w-5 rotate-90" />
          </button>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-orange-400">New Plan</p>
            <p className="text-xl font-bold text-zinc-100">Training Plan Generator</p>
          </div>
        </div>

        <UpgradeGate
          feature="training_plans"
          currentCount={plans.length}
          teamId={teamId}
        >
          <PlanWizard
            teamId={teamId}
            sport={sport}
            playerCount={players.length}
            onGenerate={handleGeneratePlan}
            isGenerating={isGenerating}
            players={players}
          />
        </UpgradeGate>

        {isGenerating && generationProgress && (
          <div className="flex items-center gap-3 rounded-xl bg-zinc-900 border border-zinc-800 p-4">
            <Loader2 className="h-5 w-5 text-orange-400 animate-spin shrink-0" />
            <p className="text-sm text-zinc-300">{generationProgress}</p>
          </div>
        )}
      </div>
    );
  }

  if (view === 'quick') {
    return (
      <div className="mx-auto max-w-2xl px-4 pb-24 pt-4 space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setView('list')}
            className="rounded-xl p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <ChevronDown className="h-5 w-5 rotate-90" />
          </button>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-orange-400">Quick Session</p>
            <p className="text-xl font-bold text-zinc-100">One-Off Session Plan</p>
          </div>
        </div>

        <QuickSessionGenerator
          teamId={teamId}
          sport={sport}
          players={players}
          teamName={teamName}
          coachName={coachName}
          sportSlug={sportSlug}
          onGenerated={(ps) => {
            // Save as a new single-session plan
            mutate({
              table: 'training_plans',
              action: 'insert',
              data: {
                team_id: teamId,
                title: ps.session_label,
                sport,
              },
            }).then((planResult) => {
              if (planResult?.id) {
                mutate({
                  table: 'training_plan_sessions',
                  action: 'insert',
                  data: {
                    plan_id: planResult.id,
                    session_number: 1,
                    session_label: ps.session_label,
                    content: ps.content,
                  },
                }).then(() => {
                  queryClient.invalidateQueries({ queryKey: ['training-plans', teamId] });
                  setActivePlanId(planResult.id);
                  setView('list');
                });
              }
            });
          }}
        />
      </div>
    );
  }

  // ─── List view ─────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-4 space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Training Plans</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {plans.length} plan{plans.length !== 1 ? 's' : ''} saved
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setView('quick')}
            className="border-zinc-700 text-zinc-400 hover:text-zinc-200 gap-1.5 h-9"
          >
            <Zap className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Quick Session</span>
          </Button>
          <Button
            size="sm"
            onClick={() => setView('create')}
            disabled={atPlanLimit}
            className="bg-orange-500 hover:bg-orange-600 text-white gap-1.5 h-9"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Plan</span>
          </Button>
        </div>
      </div>

      {/* Team personality share */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/20">
              <Users className="h-4 w-4 text-orange-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-100">{teamName}</p>
              <p className="text-[11px] text-zinc-500">Team personality</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleShareTeamPersonality}
            className="border-zinc-700 text-zinc-400 hover:text-zinc-200 gap-1.5 shrink-0 h-8 px-2.5"
          >
            <Share2 className="h-3.5 w-3.5" />
            <span className="text-xs">Share</span>
          </Button>
        </div>
      </div>

      {/* Plan limit warning */}
      {atPlanLimit && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2">
          <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300">
            You've reached your plan limit. <UpgradeGate feature="training_plans" currentCount={plans.length} teamId={teamId} asLink>Upgrade to create more.</UpgradeGate>
          </p>
        </div>
      )}

      {/* Plans list */}
      {plansLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 text-orange-400 animate-spin" />
        </div>
      ) : plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-900 border border-zinc-800">
            <ClipboardList className="h-8 w-8 text-zinc-600" />
          </div>
          <div>
            <p className="font-semibold text-zinc-300">No training plans yet</p>
            <p className="text-sm text-zinc-600 mt-1">
              Generate AI-powered practice plans tailored to your team.
            </p>
          </div>
          <Button
            onClick={() => setView('create')}
            className="bg-orange-500 hover:bg-orange-600 text-white gap-2"
          >
            <Wand2 className="h-4 w-4" />
            Create Your First Plan
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {plans.map((plan) => (
            <PlanListItem
              key={plan.id}
              plan={plan}
              isActive={plan.id === activePlanId}
              onClick={() => setActivePlanId(plan.id)}
              onDelete={() => deletePlan.mutate(plan.id)}
            />
          ))}
        </div>
      )}

      {shareOpen && shareText && (
        <ShareSheet text={shareText} onClose={() => { setShareOpen(false); setShareText(''); }} />
      )}
    </div>
  );
}

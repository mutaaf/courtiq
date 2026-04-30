'use client';

import { useState, useEffect } from 'react';
import { useActiveTeam } from '@/hooks/use-active-team';
import { query, mutate } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Check,
  Star,
  AlertTriangle,
  X,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  ClipboardList,
  Eye,
  MessageCircle,
  Send,
  Copy,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import Link from 'next/link';
import { buildWhatsAppUrl, formatGroupMessage } from '@/lib/team-group-message-utils';
import type { TeamGroupMessage } from '@/lib/team-group-message-utils';

interface Props {
  sessionId: string;
  onClose: () => void;
}

interface Template {
  text: string;
  category: string;
}

interface SessionObs {
  player_id: string | null;
}

const POSITIVE_TEMPLATES: Template[] = [
  { text: 'Great energy',      category: 'hustle'      },
  { text: 'Strong passing',    category: 'passing'     },
  { text: 'Good defense',      category: 'defense'     },
  { text: 'Excellent hustle',  category: 'hustle'      },
  { text: 'Smart plays',       category: 'awareness'   },
  { text: 'Team leadership',   category: 'leadership'  },
  { text: 'Great shooting',    category: 'shooting'    },
  { text: 'Strong rebounding', category: 'rebounding'  },
];

const NEEDS_WORK_TEMPLATES: Template[] = [
  { text: 'Ball handling',         category: 'dribbling' },
  { text: 'Spacing',               category: 'awareness' },
  { text: 'Transitions',           category: 'hustle'    },
  { text: 'Communication',         category: 'teamwork'  },
  { text: 'Shot selection',        category: 'shooting'  },
  { text: 'Defensive positioning', category: 'defense'   },
  { text: 'Footwork',              category: 'footwork'  },
  { text: 'Free throws',           category: 'shooting'  },
];

type Step = 'standouts' | 'positives' | 'work' | 'notes' | 'done';

interface SavedSummary {
  obsCount: number;
  playerCount: number;
}

export function PostPracticeDebrief({ sessionId, onClose }: Props) {
  const { activeTeam, coach } = useActiveTeam();
  const qc = useQueryClient();
  const setPracticeActive = useAppStore((s) => s.setPracticeActive);

  const [step, setStep] = useState<Step>('standouts');
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [positives, setPositives] = useState<Template[]>([]);
  const [needsWork, setNeedsWork] = useState<Template[]>([]);
  const [notes, setNotes] = useState('');
  const [players, setPlayers] = useState<{ id: string; name: string; jersey_number: number | null }[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedSummary, setSavedSummary] = useState<SavedSummary | null>(null);
  const [sessionObservedIds, setSessionObservedIds] = useState<Set<string>>(new Set());

  // Share with Parents state
  type ShareState = 'idle' | 'generating' | 'ready' | 'copied' | 'shared' | 'error' | 'upgrade';
  const [shareState, setShareState] = useState<ShareState>('idle');
  const [groupMessage, setGroupMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!activeTeam?.id) return;
    Promise.all([
      query<{ id: string; name: string; jersey_number: number | null }[]>({
        table: 'players',
        select: 'id, name, jersey_number',
        filters: { team_id: activeTeam.id, is_active: true },
      }),
      query<SessionObs[]>({
        table: 'observations',
        select: 'player_id',
        filters: { session_id: sessionId },
      }),
    ]).then(([playerData, obsData]) => {
      setPlayers(playerData || []);
      const ids = new Set(
        (obsData || []).filter((o) => o.player_id).map((o) => o.player_id as string)
      );
      setSessionObservedIds(ids);
    });
  }, [activeTeam?.id, sessionId]);

  const steps: Step[] = ['standouts', 'positives', 'work', 'notes'];
  const stepIndex = steps.indexOf(step as Exclude<Step, 'done'>);

  function nextStep() {
    if (stepIndex < steps.length - 1) {
      setStep(steps[stepIndex + 1]);
    }
  }

  function prevStep() {
    if (stepIndex > 0) {
      setStep(steps[stepIndex - 1]);
    }
  }

  function togglePlayer(id: string) {
    setSelectedPlayers((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  function togglePositive(t: Template) {
    setPositives((prev) =>
      prev.some((p) => p.text === t.text) ? prev.filter((p) => p.text !== t.text) : [...prev, t]
    );
  }

  function toggleWork(t: Template) {
    setNeedsWork((prev) =>
      prev.some((p) => p.text === t.text) ? prev.filter((p) => p.text !== t.text) : [...prev, t]
    );
  }

  async function handleShareWithParents() {
    if (!activeTeam?.id) return;
    setShareState('generating');
    try {
      const res = await fetch('/api/ai/team-group-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: activeTeam.id, sessionId }),
      });
      if (res.status === 402 || res.status === 403) {
        setShareState('upgrade');
        return;
      }
      if (!res.ok) {
        setShareState('error');
        return;
      }
      const data = await res.json();
      const msg = formatGroupMessage(
        data.groupMessage as TeamGroupMessage,
        coach?.full_name ?? undefined,
        activeTeam.name ?? undefined,
      );
      setGroupMessage(msg);
      setShareState('ready');
    } catch {
      setShareState('error');
    }
  }

  async function handleDoShare() {
    if (!groupMessage) return;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ text: groupMessage });
        setShareState('shared');
        return;
      } catch {
        // user cancelled or not supported — fall through
      }
    }
    window.open(buildWhatsAppUrl(groupMessage), '_blank');
    setShareState('shared');
  }

  function handleCopyMessage() {
    if (!groupMessage) return;
    navigator.clipboard.writeText(groupMessage).catch(() => {});
    setShareState('copied');
    setTimeout(() => setShareState('ready'), 2000);
  }

  async function handleSave() {
    setSaving(true);
    const observations: Record<string, unknown>[] = [];

    for (const playerId of selectedPlayers) {
      for (const tpl of positives) {
        observations.push({
          player_id: playerId,
          team_id: activeTeam?.id,
          coach_id: coach?.id,
          session_id: sessionId,
          category: tpl.category,
          sentiment: 'positive',
          text: tpl.text,
          source: 'debrief',
          ai_parsed: false,
        });
      }
      for (const tpl of needsWork) {
        observations.push({
          player_id: playerId,
          team_id: activeTeam?.id,
          coach_id: coach?.id,
          session_id: sessionId,
          category: tpl.category,
          sentiment: 'needs-work',
          text: tpl.text,
          source: 'debrief',
          ai_parsed: false,
        });
      }
    }

    if (notes.trim()) {
      observations.push({
        player_id: null,
        team_id: activeTeam?.id,
        coach_id: coach?.id,
        session_id: sessionId,
        category: 'General',
        sentiment: 'neutral',
        text: notes.trim(),
        source: 'debrief',
        ai_parsed: false,
      });
    }

    if (observations.length > 0) {
      await mutate({ table: 'observations', operation: 'insert', data: observations });
    }

    try {
      await fetch('/api/ai/session-debrief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, teamId: activeTeam?.id }),
      });
    } catch {
      // best-effort
    }

    setPracticeActive(false);
    useAppStore.getState().setPracticeSessionId(null);
    useAppStore.getState().setPracticeStartedAt(null);

    qc.invalidateQueries({ queryKey: ['home-stats'] });
    qc.invalidateQueries({ queryKey: ['home-pulse'] });

    const playerCount = selectedPlayers.length;
    const obsCount =
      selectedPlayers.length * (positives.length + needsWork.length) +
      (notes.trim() ? 1 : 0);

    setSavedSummary({ obsCount, playerCount });
    setSaving(false);
    setStep('done');
  }

  function handleClose() {
    if (step !== 'done') {
      setPracticeActive(false);
      useAppStore.getState().setPracticeSessionId(null);
      useAppStore.getState().setPracticeStartedAt(null);
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2 className="text-lg font-bold text-zinc-100">Practice Debrief</h2>
          <button
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Progress dots (hidden on done screen) */}
        {step !== 'done' && (
          <div className="flex items-center justify-center gap-2 py-3">
            {steps.map((s, i) => (
              <div
                key={s}
                className={`h-2 rounded-full transition-all ${
                  i === stepIndex ? 'w-6 bg-emerald-500' : i < stepIndex ? 'w-2 bg-emerald-500/50' : 'w-2 bg-zinc-700'
                }`}
              />
            ))}
          </div>
        )}

        <div className="px-5 pb-5">
          {/* ── Step 1: Standouts ── */}
          {step === 'standouts' && (
            <Card className="border-zinc-800">
              <CardContent className="p-4 space-y-4">
                <div className="text-center">
                  <Star className="h-8 w-8 text-amber-400 mx-auto mb-2" />
                  <h3 className="text-base font-semibold text-zinc-100">Who stood out today?</h3>
                  <p className="text-xs text-zinc-500 mt-1">Tap players who caught your eye</p>
                </div>

                {/* Coverage summary */}
                {players.length > 0 && (
                  <div className={`rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3 ${
                    sessionObservedIds.size === players.length
                      ? 'bg-emerald-500/10 border border-emerald-500/20'
                      : sessionObservedIds.size > 0
                        ? 'bg-amber-500/10 border border-amber-500/20'
                        : 'bg-zinc-800/60 border border-zinc-700/60'
                  }`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`h-2 w-2 shrink-0 rounded-full ${
                        sessionObservedIds.size === players.length
                          ? 'bg-emerald-400'
                          : sessionObservedIds.size > 0
                            ? 'bg-amber-400'
                            : 'bg-zinc-500'
                      }`} />
                      <span className={`text-xs font-medium ${
                        sessionObservedIds.size === players.length
                          ? 'text-emerald-300'
                          : sessionObservedIds.size > 0
                            ? 'text-amber-300'
                            : 'text-zinc-400'
                      }`}>
                        {sessionObservedIds.size === players.length
                          ? `All ${players.length} players observed ✓`
                          : sessionObservedIds.size === 0
                            ? `No players observed yet`
                            : `${sessionObservedIds.size} of ${players.length} players observed`
                        }
                      </span>
                    </div>
                    {sessionObservedIds.size > 0 && sessionObservedIds.size < players.length && (
                      <span className="shrink-0 text-[11px] text-amber-400 font-medium">
                        {players.length - sessionObservedIds.size} missed
                      </span>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 justify-center">
                  {players.map((p) => {
                    const alreadyObserved = sessionObservedIds.has(p.id);
                    const isSelected = selectedPlayers.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => togglePlayer(p.id)}
                        className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-all active:scale-95 touch-manipulation ${
                          isSelected
                            ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                            : alreadyObserved
                              ? 'bg-zinc-800/80 border border-zinc-600 text-zinc-300'
                              : 'bg-amber-500/10 border border-amber-500/25 text-amber-300 hover:border-amber-500/40'
                        }`}
                        title={alreadyObserved ? 'Observed this session' : 'Not yet observed'}
                      >
                        {isSelected
                          ? <Check className="h-3.5 w-3.5" />
                          : alreadyObserved
                            ? <Check className="h-3.5 w-3.5 text-zinc-500" />
                            : null
                        }
                        {p.jersey_number != null && (
                          <span className={`text-xs ${alreadyObserved ? 'text-zinc-500' : 'text-amber-500/70'}`}>
                            #{p.jersey_number}
                          </span>
                        )}
                        {p.name.split(' ')[0]}
                      </button>
                    );
                  })}
                  {players.length === 0 && (
                    <p className="text-sm text-zinc-500">No players found</p>
                  )}
                </div>

                {/* Not-yet-observed callout */}
                {players.length > 0 && sessionObservedIds.size < players.length && sessionObservedIds.size >= 0 && (
                  <p className="text-center text-[11px] text-zinc-600">
                    <span className="inline-block w-2 h-2 rounded-full bg-amber-500/60 mr-1.5 align-middle" />
                    Amber = not yet observed this session
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Step 2: Positives ── */}
          {step === 'positives' && (
            <Card className="border-zinc-800">
              <CardContent className="p-4 space-y-4">
                <div className="text-center">
                  <Check className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                  <h3 className="text-base font-semibold text-zinc-100">What went well?</h3>
                  <p className="text-xs text-zinc-500 mt-1">Tap all that apply</p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {POSITIVE_TEMPLATES.map((t) => (
                    <button
                      key={t.text}
                      onClick={() => togglePositive(t)}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition-all active:scale-95 touch-manipulation ${
                        positives.some((p) => p.text === t.text)
                          ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                          : 'bg-zinc-800 border border-zinc-700 text-zinc-300 hover:border-zinc-600'
                      }`}
                    >
                      {t.text}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Step 3: Needs work ── */}
          {step === 'work' && (
            <Card className="border-zinc-800">
              <CardContent className="p-4 space-y-4">
                <div className="text-center">
                  <AlertTriangle className="h-8 w-8 text-amber-400 mx-auto mb-2" />
                  <h3 className="text-base font-semibold text-zinc-100">What needs work?</h3>
                  <p className="text-xs text-zinc-500 mt-1">Tap all that apply</p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {NEEDS_WORK_TEMPLATES.map((t) => (
                    <button
                      key={t.text}
                      onClick={() => toggleWork(t)}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition-all active:scale-95 touch-manipulation ${
                        needsWork.some((p) => p.text === t.text)
                          ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                          : 'bg-zinc-800 border border-zinc-700 text-zinc-300 hover:border-zinc-600'
                      }`}
                    >
                      {t.text}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Step 4: Notes ── */}
          {step === 'notes' && (
            <Card className="border-zinc-800">
              <CardContent className="p-4 space-y-4">
                <div className="text-center">
                  <h3 className="text-base font-semibold text-zinc-100">Any final notes?</h3>
                  <p className="text-xs text-zinc-500 mt-1">Optional — anything else to remember</p>
                </div>
                <Textarea
                  placeholder="e.g. Team energy was high today, need to work on zone defense next practice..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className="bg-zinc-800 border-zinc-700 text-zinc-200 placeholder:text-zinc-600"
                />
              </CardContent>
            </Card>
          )}

          {/* ── Step 5: Done ── */}
          {step === 'done' && savedSummary && (
            <div className="py-2 space-y-5">
              <div className="text-center space-y-3">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/20">
                  <Sparkles className="h-8 w-8 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-100">Practice wrapped up!</h3>
                  <p className="text-sm text-zinc-400 mt-1">
                    {savedSummary.obsCount > 0
                      ? `${savedSummary.obsCount} observation${savedSummary.obsCount !== 1 ? 's' : ''} saved${savedSummary.playerCount > 0 ? ` for ${savedSummary.playerCount} player${savedSummary.playerCount !== 1 ? 's' : ''}` : ''}.`
                      : 'Session recorded.'}
                    {' '}AI debrief is generating in the background.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Link
                  href={`/sessions/${sessionId}?fromPractice=1&obsCount=${savedSummary.obsCount}&playerCount=${savedSummary.playerCount}`}
                  onClick={onClose}
                >
                  <button className="w-full flex flex-col items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800/60 p-4 text-center hover:border-orange-500/40 hover:bg-zinc-800 transition-colors touch-manipulation active:scale-[0.97]">
                    <Eye className="h-6 w-6 text-orange-400" />
                    <span className="text-sm font-medium text-zinc-200">View Session</span>
                    <span className="text-xs text-zinc-500">AI debrief + timeline</span>
                  </button>
                </Link>
                <Link href="/plans" onClick={onClose}>
                  <button className="w-full flex flex-col items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800/60 p-4 text-center hover:border-orange-500/40 hover:bg-zinc-800 transition-colors touch-manipulation active:scale-[0.97]">
                    <ClipboardList className="h-6 w-6 text-blue-400" />
                    <span className="text-sm font-medium text-zinc-200">Plan Next Practice</span>
                    <span className="text-xs text-zinc-500">AI-powered from today</span>
                  </button>
                </Link>
              </div>

              {/* Share with Parents */}
              <div className="rounded-xl border border-teal-500/30 bg-teal-500/10 p-4">
                {shareState === 'idle' && (
                  <button
                    onClick={handleShareWithParents}
                    className="w-full flex items-center gap-3 touch-manipulation active:scale-[0.97]"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/20">
                      <MessageCircle className="h-5 w-5 text-teal-400" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-teal-300">Share with Parents</p>
                      <p className="text-xs text-teal-400/70">AI writes your WhatsApp update</p>
                    </div>
                    <ChevronRight className="ml-auto h-4 w-4 text-teal-400/60 shrink-0" />
                  </button>
                )}

                {shareState === 'generating' && (
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 text-teal-400 animate-spin shrink-0" />
                    <p className="text-sm text-teal-300">Writing your parent message…</p>
                  </div>
                )}

                {(shareState === 'ready' || shareState === 'copied') && groupMessage && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-teal-300 flex items-center gap-1.5">
                      <MessageCircle className="h-3.5 w-3.5" />
                      Your parent message is ready
                    </p>
                    <div className="rounded-lg bg-zinc-900/70 border border-zinc-800 p-3 text-xs text-zinc-300 whitespace-pre-wrap max-h-28 overflow-y-auto leading-relaxed">
                      {groupMessage}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleDoShare}
                        className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white py-2.5 text-sm font-semibold touch-manipulation active:scale-[0.97] transition-colors"
                      >
                        <Send className="h-4 w-4" />
                        Send via WhatsApp / SMS
                      </button>
                      <button
                        onClick={handleCopyMessage}
                        className="flex items-center justify-center gap-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 px-3 py-2.5 text-sm hover:border-zinc-600 touch-manipulation active:scale-[0.97] transition-colors"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {shareState === 'copied' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>
                )}

                {shareState === 'shared' && (
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-500/20">
                      <Check className="h-4 w-4 text-teal-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-teal-300">Shared with parents!</p>
                      <p className="text-xs text-teal-400/60">Great work this practice 🏀</p>
                    </div>
                  </div>
                )}

                {shareState === 'upgrade' && (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <MessageCircle className="h-4 w-4 text-zinc-500 shrink-0" />
                      <p className="text-xs text-zinc-400">Parent sharing requires Coach plan or higher</p>
                    </div>
                    <Link
                      href="/settings/upgrade"
                      className="shrink-0 text-xs font-semibold text-orange-400 hover:text-orange-300"
                      onClick={onClose}
                    >
                      Upgrade →
                    </Link>
                  </div>
                )}

                {shareState === 'error' && (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-zinc-400">Couldn't generate message — try from session detail</p>
                    <button
                      onClick={() => setShareState('idle')}
                      className="shrink-0 text-xs font-semibold text-teal-400 hover:text-teal-300"
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="w-full text-zinc-500 hover:text-zinc-300"
                onClick={onClose}
              >
                Back to Dashboard
              </Button>
            </div>
          )}

          {/* Navigation buttons (hidden on done screen) */}
          {step !== 'done' && (
            <div className="flex items-center justify-between mt-4">
              {stepIndex > 0 ? (
                <Button variant="ghost" size="sm" onClick={prevStep} className="text-zinc-400">
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              ) : (
                <div />
              )}

              {step !== 'notes' ? (
                <div className="flex items-center gap-2">
                  <button onClick={nextStep} className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1">
                    Skip
                  </button>
                  <Button size="sm" onClick={nextStep} className="bg-emerald-600 hover:bg-emerald-500 text-white">
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save & Wrap Up'
                  )}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

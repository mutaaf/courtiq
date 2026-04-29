'use client';

import { useState, useRef, useEffect, useMemo, type ReactNode } from 'react';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery } from '@tanstack/react-query';
import { query } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Sparkles,
  Send,
  Loader2,
  Dumbbell,
  BarChart3,
  FileText,
  Save,
  Plus,
  Bot,
  User,
  History,
  Trash2,
  CheckCircle2,
  Copy,
  Mic,
  MicOff,
  CalendarDays,
  Users,
  Zap,
} from 'lucide-react';
import { useVoiceInput } from '@/hooks/use-voice-input';
import { UpgradeGate } from '@/components/ui/upgrade-gate';
import { trackEvent } from '@/lib/analytics';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  type?: 'plan' | 'drill' | 'report' | 'analysis' | 'general';
  structured_data?: Record<string, unknown>;
  suggestions?: string[];
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// Markdown renderer — parses common coaching AI response patterns
// ---------------------------------------------------------------------------

/** Renders inline markdown: **bold**, *italic*, `code` */
function renderInline(text: string): ReactNode {
  const INLINE_RE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/;
  const parts = text.split(INLINE_RE);
  if (parts.length === 1) return text;
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
          return <strong key={i} className="font-semibold text-zinc-100">{part.slice(2, -2)}</strong>;
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2)
          return <em key={i} className="italic">{part.slice(1, -1)}</em>;
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
          return <code key={i} className="rounded bg-zinc-900 px-1 py-0.5 font-mono text-[11px] text-orange-300">{part.slice(1, -1)}</code>;
        return part;
      })}
    </>
  );
}

/** Block-level markdown renderer for AI assistant messages */
function MarkdownContent({ content }: { content: string }) {
  const lines = content.split('\n');
  const nodes: ReactNode[] = [];
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip blank lines between blocks
    if (!line.trim()) { i++; continue; }

    // Headings
    if (line.startsWith('### ')) {
      nodes.push(
        <h3 key={k++} className="mt-3 mb-1 text-[13px] font-semibold text-orange-300 uppercase tracking-wider">
          {renderInline(line.slice(4))}
        </h3>
      );
      i++; continue;
    }
    if (line.startsWith('## ')) {
      nodes.push(
        <h2 key={k++} className="mt-3 mb-1 text-sm font-bold text-zinc-100">
          {renderInline(line.slice(3))}
        </h2>
      );
      i++; continue;
    }
    if (line.startsWith('# ')) {
      nodes.push(
        <h1 key={k++} className="mt-3 mb-1 text-base font-bold text-zinc-100">
          {renderInline(line.slice(2))}
        </h1>
      );
      i++; continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      nodes.push(<hr key={k++} className="my-2 border-zinc-700" />);
      i++; continue;
    }

    // Unordered list — collect consecutive items
    if (/^[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(lines[i].slice(2));
        i++;
      }
      nodes.push(
        <ul key={k++} className="my-1.5 space-y-1">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2">
              <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" />
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list — collect consecutive items
    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, ''));
        i++;
      }
      nodes.push(
        <ol key={k++} className="my-1.5 space-y-1">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2">
              <span className="shrink-0 min-w-[1.25rem] text-[11px] font-semibold text-orange-400">{j + 1}.</span>
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Fenced code block
    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // consume closing ```
      nodes.push(
        <pre key={k++} className="my-2 overflow-x-auto rounded-lg bg-zinc-900 p-3 text-xs text-zinc-300">
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // Regular paragraph — collect consecutive "plain" lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^#{1,3} /.test(lines[i]) &&
      !/^[-*] /.test(lines[i]) &&
      !/^\d+\. /.test(lines[i]) &&
      !lines[i].startsWith('```') &&
      !/^---+$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      nodes.push(
        <p key={k++} className="leading-relaxed">
          {renderInline(paraLines.join(' '))}
        </p>
      );
    }
  }

  return <div className="space-y-0.5 text-sm">{nodes}</div>;
}

// ---------------------------------------------------------------------------

interface QuickAction {
  icon: React.ElementType;
  label: string;
  color: string;
  bg: string;
  border: string;
  iconBg: string;
  hoverBg: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    icon: Sparkles,
    label: 'Generate a practice plan for tomorrow\'s session',
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    iconBg: 'bg-orange-500/20',
    hoverBg: 'hover:bg-orange-500/15',
  },
  {
    icon: Dumbbell,
    label: 'Create a drill for teaching pick and roll',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    iconBg: 'bg-emerald-500/20',
    hoverBg: 'hover:bg-emerald-500/15',
  },
  {
    icon: BarChart3,
    label: 'How is the team progressing this week?',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    iconBg: 'bg-blue-500/20',
    hoverBg: 'hover:bg-blue-500/15',
  },
  {
    icon: FileText,
    label: 'Write a parent update for this week\'s practice',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/30',
    iconBg: 'bg-purple-500/20',
    hoverBg: 'hover:bg-purple-500/15',
  },
];

// Compute up to 4 personalized suggestions from live team data.
// Returns null when there's not enough data (new team / no observations).
function buildDynamicSuggestions(
  sessions: Array<{ id: string; type: string; date: string; opponent: string | null }> | null,
  obs: Array<{ player_id: string | null; category: string | null; sentiment: string; created_at: string }> | null,
  players: Array<{ id: string; name: string }> | null,
  today: string,
): QuickAction[] | null {
  if (!obs || obs.length < 5) return null;

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString();
  const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
  const suggestions: QuickAction[] = [];

  // 1. Upcoming session today or tomorrow
  const upcoming = sessions?.find(s => s.date === today || s.date === tomorrow);
  if (upcoming) {
    const dayLabel = upcoming.date === today ? "today's" : "tomorrow's";
    suggestions.push({
      icon: CalendarDays,
      label: `Help me run ${dayLabel} ${upcoming.type}${upcoming.opponent ? ` vs ${upcoming.opponent}` : ''}`,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/30',
      iconBg: 'bg-emerald-500/20',
      hoverBg: 'hover:bg-emerald-500/15',
    });
  }

  // 2. Top skill gap (last 14 days needs-work observations)
  const recentNeedsWork = obs.filter(o => o.sentiment === 'needs_work' && o.created_at >= twoWeeksAgo);
  if (recentNeedsWork.length >= 2) {
    const catCounts: Record<string, number> = {};
    recentNeedsWork.forEach(o => {
      if (o.category) catCounts[o.category] = (catCounts[o.category] || 0) + 1;
    });
    const top = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0];
    if (top) {
      const label = top[0].charAt(0).toUpperCase() + top[0].slice(1);
      suggestions.push({
        icon: Dumbbell,
        label: `Create a drill to improve ${label} — our biggest team gap this week`,
        color: 'text-orange-400',
        bg: 'bg-orange-500/10',
        border: 'border-orange-500/30',
        iconBg: 'bg-orange-500/20',
        hoverBg: 'hover:bg-orange-500/15',
      });
    }
  }

  // 3. Player needing attention — never observed or overdue
  if (players && players.length > 0) {
    const lastObsMap: Record<string, string> = {};
    obs.forEach(o => {
      if (o.player_id && !lastObsMap[o.player_id]) lastObsMap[o.player_id] = o.created_at;
    });
    const neverObserved = players.find(p => !lastObsMap[p.id]);
    if (neverObserved) {
      const firstName = neverObserved.name.split(' ')[0];
      suggestions.push({
        icon: Users,
        label: `${firstName} has never been observed — how do I engage them in practice?`,
        color: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        iconBg: 'bg-amber-500/20',
        hoverBg: 'hover:bg-amber-500/15',
      });
    } else {
      const oldest = players
        .filter(p => lastObsMap[p.id])
        .sort((a, b) => (lastObsMap[a.id] < lastObsMap[b.id] ? -1 : 1))[0];
      if (oldest) {
        const daysAgo = Math.floor((Date.now() - new Date(lastObsMap[oldest.id]).getTime()) / 86400000);
        if (daysAgo >= 5) {
          const firstName = oldest.name.split(' ')[0];
          suggestions.push({
            icon: Users,
            label: `${firstName} hasn't been observed in ${daysAgo} days — suggest a coaching focus`,
            color: 'text-amber-400',
            bg: 'bg-amber-500/10',
            border: 'border-amber-500/30',
            iconBg: 'bg-amber-500/20',
            hoverBg: 'hover:bg-amber-500/15',
          });
        }
      }
    }
  }

  // 4. Parent update from a recent past session
  const recentPast = sessions?.find(s => s.date <= today && s.date >= fiveDaysAgo);
  if (recentPast) {
    const daysAgo = Math.floor((Date.now() - new Date(recentPast.date).getTime()) / 86400000);
    const dayLabel = daysAgo === 0 ? "today's" : daysAgo === 1 ? "yesterday's" : `${daysAgo} days ago`;
    suggestions.push({
      icon: FileText,
      label: `Write a parent update from ${dayLabel} ${recentPast.type}`,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
      border: 'border-purple-500/30',
      iconBg: 'bg-purple-500/20',
      hoverBg: 'hover:bg-purple-500/15',
    });
  }

  return suggestions.length >= 2 ? suggestions.slice(0, 4) : null;
}

export default function AssistantPage() {
  const { activeTeam } = useActiveTeam();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedDrillIds, setSavedDrillIds] = useState<Set<string>>(new Set());
  const [copiedReportIds, setCopiedReportIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voice = useVoiceInput();

  // ── Context data for personalised quick-start suggestions ──────────────────
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const sevenDaysAgo = useMemo(
    () => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
    [],
  );

  const { data: suggCtx } = useQuery({
    queryKey: ['assistant-context', activeTeam?.id],
    queryFn: async () => {
      if (!activeTeam) return null;
      const [sessions, obs, players] = await Promise.all([
        query<Array<{ id: string; type: string; date: string; opponent: string | null }>>({
          table: 'sessions',
          select: 'id,type,date,opponent',
          filters: { team_id: activeTeam.id, date: { op: 'gte', value: sevenDaysAgo } },
          order: { column: 'date', ascending: true },
          limit: 20,
        }),
        query<Array<{ player_id: string | null; category: string | null; sentiment: string; created_at: string }>>({
          table: 'observations',
          select: 'player_id,category,sentiment,created_at',
          filters: { team_id: activeTeam.id },
          order: { column: 'created_at', ascending: false },
          limit: 60,
        }),
        query<Array<{ id: string; name: string }>>({
          table: 'players',
          select: 'id,name',
          filters: { team_id: activeTeam.id, is_active: true },
        }),
      ]);
      return { sessions, obs, players };
    },
    enabled: !!activeTeam,
    staleTime: 5 * 60 * 1000,
  });

  const dynamicActions = useMemo(
    () => buildDynamicSuggestions(
      suggCtx?.sessions ?? null,
      suggCtx?.obs ?? null,
      suggCtx?.players ?? null,
      today,
    ),
    [suggCtx, today],
  );

  const actionsToShow = dynamicActions ?? QUICK_ACTIONS;
  const isPersonalised = dynamicActions !== null;
  // ── End context suggestions ─────────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || !activeTeam || isLoading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };

    // Capture history BEFORE adding the new user message (last 10 turns = 20 messages max)
    const historySnapshot = messages
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    trackEvent('assistant_query_sent', {
      message_chars: text.trim().length,
      turn_index: messages.length,
      via_voice: voice.isRecording,
    });

    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          teamId: activeTeam.id,
          history: historySnapshot,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to get response');
      }

      const data = await res.json();

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.response,
        type: data.type,
        structured_data: data.structured_data,
        suggestions: data.suggestions,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      trackEvent('assistant_response_received', {
        response_type: data.type ?? null,
        has_structured: !!data.structured_data,
      });
    } catch (err) {
      trackEvent('assistant_response_failed', {
        reason: err instanceof Error ? err.message : 'unknown',
      });
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleVoiceToggle = () => {
    if (voice.isRecording) {
      const finalText = voice.stop();
      const combined = (input + (input ? ' ' : '') + finalText).trim();
      setInput(combined);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      voice.start();
    }
  };

  const handleQuickAction = (label: string) => {
    setInput(label);
    sendMessage(label);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
    sendMessage(suggestion);
  };

  const showToast = (msg: string, ok = true) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, ok });
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  };

  const addToDrills = async (message: ChatMessage) => {
    if (!activeTeam || !message.structured_data || savedDrillIds.has(message.id)) return;
    try {
      const res = await fetch('/api/ai/save-drill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: activeTeam.id, drill: message.structured_data }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save drill');
      }
      setSavedDrillIds((prev) => new Set([...prev, message.id]));
      showToast('Drill saved to your library!');
    } catch {
      showToast('Failed to save drill', false);
    }
  };

  const shareWithParents = async (message: ChatMessage) => {
    if (!message.structured_data || copiedReportIds.has(message.id)) return;
    const data = message.structured_data;
    const lines: string[] = [];
    if (data.title) lines.push(String(data.title), '');
    for (const [key, value] of Object.entries(data)) {
      if (key === 'title') continue;
      lines.push(key.replace(/_/g, ' ').toUpperCase() + ':');
      if (typeof value === 'string') {
        lines.push(value, '');
      } else if (Array.isArray(value)) {
        (value as unknown[]).forEach((v) =>
          lines.push('• ' + (typeof v === 'string' ? v : JSON.stringify(v)))
        );
        lines.push('');
      } else if (typeof value === 'object' && value !== null) {
        lines.push(JSON.stringify(value, null, 2), '');
      } else {
        lines.push(String(value), '');
      }
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedReportIds((prev) => new Set([...prev, message.id]));
      showToast('Report copied — paste it into your messaging app!');
    } catch {
      showToast('Could not copy to clipboard', false);
    }
  };

  const saveAsPlan = async (message: ChatMessage) => {
    if (!activeTeam || !message.structured_data) return;
    try {
      const res = await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: activeTeam.id,
          type: message.type === 'drill' ? 'practice' : message.type === 'report' ? 'parent_report' : 'custom',
          title: (message.structured_data as any).title || `${message.type} - ${new Date().toLocaleDateString()}`,
          content: JSON.stringify(message.structured_data),
          content_structured: message.structured_data,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
    } catch {
      setError('Failed to save plan');
    }
  };

  const renderStructuredData = (data: Record<string, unknown>) => {
    return (
      <div className="mt-3 space-y-2 rounded-lg border border-zinc-700/50 bg-zinc-800/50 p-3">
        {Object.entries(data).map(([key, value]) => {
          if (key === 'title') {
            return (
              <h4 key={key} className="text-sm font-semibold text-zinc-200">
                {String(value)}
              </h4>
            );
          }
          return (
            <div key={key} className="text-xs">
              <span className="font-medium text-zinc-400 uppercase tracking-wider">
                {key.replace(/_/g, ' ')}
              </span>
              <div className="mt-1 text-zinc-300">
                {typeof value === 'string' ? (
                  <p>{value}</p>
                ) : Array.isArray(value) ? (
                  <ul className="space-y-1 ml-2">
                    {value.map((item, i) => (
                      <li key={i} className="text-zinc-300">
                        {typeof item === 'string' ? (
                          `- ${item}`
                        ) : typeof item === 'object' && item !== null ? (
                          <div className="rounded border border-zinc-700/50 bg-zinc-800/30 p-2 mb-1">
                            {Object.entries(item).map(([ik, iv]) => (
                              <p key={ik} className="text-[11px]">
                                <span className="font-medium text-zinc-400">{ik.replace(/_/g, ' ')}:</span>{' '}
                                {typeof iv === 'string' ? iv
                                  : Array.isArray(iv) ? (iv as any[]).map((s: any) => typeof s === 'string' ? s : s?.name || String(s)).join(', ')
                                  : String(iv)}
                              </p>
                            ))}
                          </div>
                        ) : (
                          `- ${String(item)}`
                        )}
                      </li>
                    ))}
                  </ul>
                ) : typeof value === 'object' && value !== null ? (
                  <div className="space-y-1">
                    {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
                      <p key={k} className="text-[11px]">
                        <span className="font-medium text-zinc-400">{k.replace(/_/g, ' ')}:</span>{' '}
                        {typeof v === 'string' ? v
                          : Array.isArray(v) ? (v as any[]).map((s: any) => typeof s === 'string' ? s : String(s)).join(', ')
                          : String(v)}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p>{String(value)}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderMessage = (message: ChatMessage) => {
    const isUser = message.role === 'user';

    return (
      <div
        key={message.id}
        className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
      >
        {!isUser && (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500/20">
            <Bot className="h-4 w-4 text-orange-400" />
          </div>
        )}

        <div className={`max-w-[85%] ${isUser ? 'order-first' : ''}`}>
          <div
            className={`rounded-2xl px-4 py-3 text-sm ${
              isUser
                ? 'bg-orange-500 text-white rounded-br-md'
                : 'bg-zinc-800 text-zinc-200 rounded-bl-md'
            }`}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
            ) : (
              <MarkdownContent content={message.content} />
            )}

            {message.structured_data && Object.keys(message.structured_data).length > 0 && (
              renderStructuredData(message.structured_data)
            )}
          </div>

          {/* Action buttons for assistant messages with structured data */}
          {!isUser && message.structured_data && Object.keys(message.structured_data).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => saveAsPlan(message)}
                className="flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                <Save className="h-3 w-3" />
                Save as Plan
              </button>
              {message.type === 'report' && (
                <button
                  onClick={() => shareWithParents(message)}
                  disabled={copiedReportIds.has(message.id)}
                  className="flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-60"
                >
                  {copiedReportIds.has(message.id) ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Share with Parents
                    </>
                  )}
                </button>
              )}
              {message.type === 'drill' && (
                <button
                  onClick={() => addToDrills(message)}
                  disabled={savedDrillIds.has(message.id)}
                  className="flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-60"
                >
                  {savedDrillIds.has(message.id) ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                      <span className="text-emerald-400">Saved!</span>
                    </>
                  ) : (
                    <>
                      <Plus className="h-3 w-3" />
                      Add to Drills
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Suggestion chips */}
          {!isUser && message.suggestions && message.suggestions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {message.suggestions.map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-xs font-medium text-orange-300 hover:bg-orange-500/20 hover:border-orange-500/40 transition-colors active:scale-[0.97] touch-manipulation"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          <p className="mt-1 text-[10px] text-zinc-600">
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        {isUser && (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500/30">
            <User className="h-4 w-4 text-orange-300" />
          </div>
        )}
      </div>
    );
  };

  const hasMessages = messages.length > 0;

  return (
    <UpgradeGate feature="assistant" featureLabel="AI Coach Assistant">
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-zinc-800 px-4 py-3 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/20">
            <Sparkles className="h-5 w-5 text-orange-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold">AI Coach Assistant</h1>
            <p className="text-xs text-zinc-500">
              {activeTeam ? `Coaching ${activeTeam.name}` : 'Select a team to get started'}
            </p>
          </div>
          {messages.length > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 px-2.5 py-1">
                <History className="h-3 w-3 text-orange-400" />
                <span className="text-[10px] font-medium text-orange-400">
                  {messages.length} turn{messages.length !== 1 ? 's' : ''}
                </span>
              </div>
              <button
                onClick={() => {
                  setMessages([]);
                  setError(null);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                title="Clear conversation"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto">
        {!hasMessages ? (
          /* Welcome state with quick actions — compact on mobile */
          <div className="flex h-full flex-col items-center justify-center px-4 py-4 sm:py-8">
            <div className="flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-orange-500/20 mb-3 sm:mb-4">
              <Sparkles className="h-6 w-6 sm:h-8 sm:w-8 text-orange-400" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-zinc-100 mb-0.5">What can I help with?</h2>
            <p className="text-xs sm:text-sm text-zinc-500 mb-1 text-center max-w-sm">
              Practice plans, drills, player analysis, and more.
            </p>

            {/* Personalised badge — shown when suggestions are data-driven */}
            {isPersonalised && (
              <div className="mb-4 sm:mb-6 flex items-center gap-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 px-2.5 py-1">
                <Zap className="h-3 w-3 text-orange-400" />
                <span className="text-[10px] font-medium text-orange-400">Personalised for {activeTeam?.name}</span>
              </div>
            )}
            {!isPersonalised && <div className="mb-4 sm:mb-6" />}

            <div className="w-full max-w-lg space-y-2 sm:space-y-3">
              {actionsToShow.map((action, i) => {
                const Icon = action.icon;
                return (
                  <button
                    key={i}
                    onClick={() => handleQuickAction(action.label)}
                    className={`flex w-full items-center gap-3 rounded-xl border ${action.border} ${action.bg} ${action.hoverBg} p-3 sm:p-4 text-left transition-all active:scale-[0.97] touch-manipulation`}
                  >
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${action.iconBg}`}>
                      <Icon className={`h-5 w-5 ${action.color}`} />
                    </div>
                    <span className="text-sm font-medium text-zinc-200">{action.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* Messages */
          <div className="space-y-4 px-4 py-4 lg:px-8">
            {messages.map(renderMessage)}

            {isLoading && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500/20">
                  <Bot className="h-4 w-4 text-orange-400" />
                </div>
                <div className="rounded-2xl rounded-bl-md bg-zinc-800 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Thinking...
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="mx-auto max-w-md rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400 text-center">
                {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area — pinned to bottom; on mobile, lift above the tab bar */}
      <div className="border-t border-zinc-800 bg-zinc-900/80 px-4 pb-2 pt-2 mb-[calc(4rem+env(safe-area-inset-bottom))] lg:mb-0 lg:px-8 lg:pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          {/* Voice input wrapper */}
          <div className={`relative flex-1 rounded-xl border bg-zinc-800 transition-all focus-within:ring-1 ${
            voice.isRecording
              ? 'border-red-500/70 ring-red-500/20 focus-within:border-red-500/70'
              : 'border-zinc-700 focus-within:border-orange-500/50 focus-within:ring-orange-500/20'
          }`}>
            <textarea
              ref={inputRef}
              value={voice.isRecording ? (input + (input && voice.interimTranscript ? ' ' : '') + voice.interimTranscript) : input}
              onChange={(e) => {
                if (!voice.isRecording) setInput(e.target.value);
              }}
              onKeyDown={handleKeyDown}
              placeholder={voice.isRecording ? 'Listening...' : 'Ask anything about coaching...'}
              rows={1}
              disabled={!activeTeam || isLoading}
              readOnly={voice.isRecording}
              className={`w-full resize-none bg-transparent px-4 py-3 text-sm focus:outline-none disabled:opacity-50 ${
                voice.isRecording
                  ? 'text-zinc-300 placeholder:text-red-400 cursor-default select-none'
                  : 'text-zinc-100 placeholder:text-zinc-500'
              }`}
            />
            {/* Recording indicator pill */}
            {voice.isRecording && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 rounded-full bg-red-500/20 px-2 py-0.5">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
                <span className="text-[10px] font-medium text-red-400">REC</span>
              </div>
            )}
          </div>

          {/* Mic button — orange themed */}
          {voice.isSupported && (
            <button
              onClick={handleVoiceToggle}
              disabled={!activeTeam || isLoading}
              aria-label={voice.isRecording ? 'Stop recording' : 'Start voice input'}
              aria-pressed={voice.isRecording}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors touch-manipulation disabled:opacity-30 ${
                voice.isRecording
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-orange-500/15 hover:bg-orange-500/25 text-orange-400 border border-orange-500/30'
              }`}
            >
              {voice.isRecording ? (
                <MicOff className="h-5 w-5" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
            </button>
          )}

          <Button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || !activeTeam || isLoading || voice.isRecording}
            size="icon"
            className="h-11 w-11 shrink-0 rounded-xl bg-orange-500 hover:bg-orange-600 text-white disabled:bg-zinc-700 disabled:text-zinc-500 disabled:opacity-100"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>

        {/* Recording hint */}
        {voice.isRecording && (
          <p className="mx-auto mt-1.5 max-w-3xl text-center text-[11px] text-red-400/80">
            Tap the mic again to stop and use your message
          </p>
        )}
      </div>
    </div>

    {/* Toast notification */}
    {toast && (
      <div
        className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium shadow-lg transition-all ${
          toast.ok
            ? 'bg-emerald-500 text-white'
            : 'bg-red-500 text-white'
        }`}
      >
        {toast.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : null}
        {toast.msg}
      </div>
    )}
    </UpgradeGate>
  );
}

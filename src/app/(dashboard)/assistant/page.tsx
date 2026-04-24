'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { useActiveTeam } from '@/hooks/use-active-team';
import { Button } from '@/components/ui/button';
import {
  Sparkles,
  Send,
  Loader2,
  ClipboardList,
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
} from 'lucide-react';
import { useVoiceInput } from '@/hooks/use-voice-input';
import { UpgradeGate } from '@/components/ui/upgrade-gate';

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

const QUICK_ACTIONS = [
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
    } catch (err) {
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
            <p className="text-xs sm:text-sm text-zinc-500 mb-4 sm:mb-8 text-center max-w-sm">
              Practice plans, drills, player analysis, and more.
            </p>

            <div className="w-full max-w-lg space-y-2 sm:space-y-3">
              {QUICK_ACTIONS.map((action, i) => {
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

      {/* Input area — pinned to bottom, minimal spacing */}
      <div className="border-t border-zinc-800 bg-zinc-900/80 px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 lg:px-8">
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

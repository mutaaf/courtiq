'use client';

import { useState } from 'react';
import { ALLOWED_REACTIONS, getReactionLabel, MAX_MESSAGE_LENGTH } from '@/lib/parent-reaction-utils';

interface ParentReactionFormProps {
  shareToken: string;
  playerFirstName: string;
  coachName: string | null;
}

type FormState = 'idle' | 'loading' | 'success' | 'error';

export function ParentReactionForm({ shareToken, playerFirstName, coachName }: ParentReactionFormProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [parentName, setParentName] = useState('');
  const [state, setState] = useState<FormState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [expanded, setExpanded] = useState(false);

  async function handleSubmit() {
    if (!selected) return;
    setState('loading');
    setErrorMsg('');

    try {
      const res = await fetch('/api/parent-reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          share_token: shareToken,
          reaction: selected,
          message: message.trim() || null,
          parent_name: parentName.trim() || null,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Something went wrong');
      }

      setState('success');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to send. Please try again.');
      setState('error');
    }
  }

  if (state === 'success') {
    return (
      <div className="rounded-2xl bg-white p-5 shadow-sm text-center">
        <div className="text-3xl mb-2">🎉</div>
        <p className="text-base font-semibold text-gray-900">Message sent!</p>
        <p className="mt-1 text-sm text-gray-500">
          {coachName ? `Coach ${coachName} will see your reaction.` : 'The coach will see your reaction.'}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-lg" aria-hidden="true">💬</span>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Send a message to the coach
        </h3>
      </div>

      {/* Prompt */}
      <p className="mb-4 text-sm text-gray-600">
        How is {playerFirstName} doing? Let{' '}
        {coachName ? `Coach ${coachName}` : 'the coach'} know you appreciate their work.
      </p>

      {/* Reaction buttons */}
      <div className="flex gap-2 flex-wrap mb-4" role="group" aria-label="Choose a reaction">
        {ALLOWED_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => {
              setSelected(emoji);
              setExpanded(true);
            }}
            aria-label={getReactionLabel(emoji)}
            aria-pressed={selected === emoji}
            className={`flex h-12 w-12 items-center justify-center rounded-full text-xl transition-all active:scale-95 touch-manipulation
              ${selected === emoji
                ? 'bg-orange-100 ring-2 ring-orange-400 scale-110'
                : 'bg-gray-100 hover:bg-gray-200'
              }`}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Expanded message form */}
      {expanded && (
        <div className="space-y-3">
          <div>
            <label htmlFor="parent-message" className="sr-only">Optional message</label>
            <textarea
              id="parent-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={MAX_MESSAGE_LENGTH}
              placeholder={`Add a message (optional)…`}
              rows={3}
              className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
            />
            <p className="mt-1 text-right text-xs text-gray-400">
              {message.length}/{MAX_MESSAGE_LENGTH}
            </p>
          </div>

          <div>
            <label htmlFor="parent-name" className="sr-only">Your name (optional)</label>
            <input
              id="parent-name"
              type="text"
              value={parentName}
              onChange={(e) => setParentName(e.target.value)}
              maxLength={50}
              placeholder="Your name (optional)"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
            />
          </div>

          {state === 'error' && (
            <p className="text-sm text-red-600" role="alert">{errorMsg}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={!selected || state === 'loading'}
            aria-label={`Send ${selected ? getReactionLabel(selected) : 'reaction'} to coach`}
            className="w-full rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white transition-all active:scale-[0.98] touch-manipulation disabled:opacity-50 hover:bg-orange-600"
          >
            {state === 'loading' ? 'Sending…' : `Send ${selected} to Coach`}
          </button>
        </div>
      )}

      {!expanded && (
        <p className="text-xs text-gray-400 text-center">Tap a reaction to get started</p>
      )}
    </div>
  );
}

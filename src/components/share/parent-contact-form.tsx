'use client';

import { useState } from 'react';
import { Phone, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import {
  buildContactFormHeadline,
  buildFormDescription,
  buildContactSuccessText,
  buildContactApiUrl,
  isContactFormReady,
} from '@/lib/share-parent-contact-utils';

interface ParentContactFormProps {
  shareToken: string;
  playerFirstName: string;
  coachName: string | null;
  teamName: string;
}

export function ParentContactForm({
  shareToken,
  playerFirstName,
  coachName,
  teamName,
}: ParentContactFormProps) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const coachFirst = coachName ? coachName.split(' ')[0] : null;

  if (saved) {
    return (
      <div className="mx-4 mt-3 rounded-2xl bg-emerald-50 border border-emerald-200 p-4 flex items-start gap-3">
        <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-emerald-800">You&apos;re all set!</p>
          <p className="mt-0.5 text-xs text-emerald-700">
            {buildContactSuccessText(playerFirstName, coachFirst)}
          </p>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(buildContactApiUrl(shareToken), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentName: name, parentPhone: phone, parentEmail: email || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
      } else {
        setSaved(true);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-4 mt-3 rounded-2xl bg-white border border-blue-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 shrink-0">
            <Phone className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {buildContactFormHeadline(coachFirst)}
            </p>
            <p className="text-xs text-gray-500">
              Add your number — takes 15 seconds
            </p>
          </div>
        </div>
        {expanded
          ? <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" aria-hidden="true" />
          : <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" aria-hidden="true" />
        }
      </button>

      {expanded && (
        <form onSubmit={handleSubmit} className="px-4 pb-4 space-y-3 border-t border-blue-50">
          <p className="pt-3 text-xs text-gray-500">
            {buildFormDescription(playerFirstName, teamName, coachFirst)}
          </p>

          {error && (
            <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}

          <div className="space-y-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name (e.g. Marcus's Mom)"
              required
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="WhatsApp / mobile number"
              required
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email (optional)"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !isContactFormReady(name, phone)}
            className="w-full rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-600 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Save my details'}
          </button>

          <p className="text-center text-[11px] text-gray-400">
            Only shared with your coach. No spam, ever.
          </p>
        </form>
      )}
    </div>
  );
}

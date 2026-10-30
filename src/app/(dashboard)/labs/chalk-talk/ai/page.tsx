'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Sparkles, Check } from 'lucide-react';

// Chalk Talk AI: the subscription CourtIQ resells, its offer, and this month's usage from the ledger.
interface Usage {
  plan: 'ai_plan' | 'included' | null;
  capUSD?: number; usedUSD?: number; leftUSD?: number; period?: string; renews?: string | null; canceling?: boolean;
  byTask?: Record<string, { calls: number; usd: number }>;
  offer: { list: number; launch: number };
}
const TASKS: Record<string, string> = { play: 'Plays drawn from your words', smart: 'Smart players', brain: 'Film room brains', tutor: 'IQ tutor', analyst: 'Analyst voice' };

export default function ChalkTalkAIPage() {
  const [u, setU] = useState<Usage | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('success')) setMsg('You’re in. Chalk Talk AI is on, here and on mutaafaziz.com/chalktalk once you connect it.');
    fetch('/api/labs/chalk-talk/usage').then((r) => r.json()).then(setU).catch(() => setU({ plan: null, offer: { list: 9.99, launch: 4.99 } }));
  }, []);
  const go = async (path: string, body?: unknown) => {
    setBusy(true);
    try {
      const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const j = await r.json();
      if (j.url) window.location.assign(j.url); else setMsg(j.error || 'That didn’t work.');
    } finally { setBusy(false); }
  };
  const offer = u?.offer || { list: 9.99, launch: 4.99 };
  const pct = u?.plan && u.capUSD ? Math.min(100, Math.round(((u.usedUSD || 0) / u.capUSD) * 100)) : 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link href="/labs/chalk-talk" className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-100"><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Chalk Talk</Link>
      <h1 className="mt-4 text-2xl font-bold text-zinc-100">Chalk Talk AI</h1>
      <p className="mt-1 text-sm text-zinc-400">Say a play and watch it draw. Every position gets its own AI brain in the film room, players get a tutor in the IQ game, and an analyst explains every read.</p>
      {msg && <p className="mt-4 rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-sm text-orange-200">{msg}</p>}

      {u?.plan ? (
        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-zinc-100">{u.plan === 'ai_plan' ? 'Chalk Talk AI' : 'Included with your CourtIQ plan'}</p>
            <p className="text-xs text-zinc-500">{u.period}</p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800"><div className="h-full rounded-full bg-orange-500" style={{ width: pct + '%' }} /></div>
          <p className="mt-2 text-sm text-zinc-400">{pct}% of this month’s AI used.{pct >= 100 ? ' The board is using the free AI until the 1st.' : ''}</p>
          {u.byTask && Object.keys(u.byTask).length > 0 && (
            <ul className="mt-4 divide-y divide-zinc-800 text-sm">
              {Object.entries(u.byTask).map(([k, v]) => (
                <li key={k} className="flex justify-between py-2 text-zinc-300"><span>{TASKS[k] || k}</span><span className="tabular-nums text-zinc-400">{v.calls}</span></li>
              ))}
            </ul>
          )}
          {u.plan === 'ai_plan' ? (
            <button disabled={busy} onClick={() => go('/api/stripe/portal')} className="mt-4 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800">{u.canceling ? 'Ends at the period end · Manage' : 'Manage subscription'}</button>
          ) : (
            <p className="mt-4 text-sm text-zinc-400">Want more? Chalk Talk AI gives you three times the AI for <b className="text-zinc-200">${offer.launch}</b>/month.</p>
          )}
        </section>
      ) : null}

      {u?.plan !== 'ai_plan' && (
        <section className="mt-6 rounded-2xl border border-orange-500/40 bg-gradient-to-br from-orange-500/15 to-transparent p-5">
          <div className="flex items-baseline gap-2">
            <Sparkles className="h-5 w-5 self-center text-orange-400" aria-hidden="true" />
            <span className="text-3xl font-bold text-zinc-100">${offer.launch}</span>
            <span className="text-sm text-zinc-400">/month</span>
            <span className="text-sm text-zinc-500 line-through">${offer.list}</span>
            <span className="ml-auto rounded-full bg-orange-500 px-2 py-0.5 text-xs font-semibold text-zinc-950">Launch price, yours to keep</span>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-zinc-300">
            {['Plays drawn from your own words, no key needed', 'A brain for every position in the film room', 'The IQ tutor for your players, pitched at their age', 'The analyst voice that explains every read', 'Works here and on mutaafaziz.com/chalktalk'].map((t) => (
              <li key={t} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" aria-hidden="true" />{t}</li>
            ))}
          </ul>
          <button disabled={busy} onClick={() => go('/api/stripe/create-checkout', { product: 'chalk_talk_ai' })} className="mt-5 w-full rounded-xl bg-orange-500 px-4 py-3 font-semibold text-zinc-950 hover:bg-orange-400 disabled:opacity-60">Get Chalk Talk AI for ${offer.launch}/month</button>
          <p className="mt-2 text-xs text-zinc-500">Cancel any time. Every CourtIQ plan already includes a smaller monthly amount of Chalk Talk AI. Fair use applies; past it, the board uses the free AI until the 1st.</p>
        </section>
      )}
    </div>
  );
}

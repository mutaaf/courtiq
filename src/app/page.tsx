import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function LandingPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/home');

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Hero */}
      <div className="flex flex-col items-center justify-center px-4 pt-20 pb-16 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500 text-3xl shadow-lg shadow-orange-500/20">
          🏀
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Coach smarter.<br />
          <span className="text-orange-500">Not harder.</span>
        </h1>
        <p className="mt-4 max-w-md text-lg text-zinc-400">
          Voice-first AI coaching platform. Record observations, generate practice plans, track player progress — all from your voice.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/demo" className="inline-flex h-12 items-center justify-center rounded-xl bg-orange-500 px-8 text-base font-semibold text-white shadow-lg shadow-orange-500/25 transition hover:bg-orange-600">
            Try it free — no signup
          </Link>
          <Link href="/login" className="inline-flex h-12 items-center justify-center rounded-xl border border-zinc-700 px-8 text-base font-medium text-zinc-300 transition hover:bg-zinc-800">
            Sign in
          </Link>
        </div>
      </div>

      {/* Features */}
      <div className="mx-auto max-w-4xl px-4 py-16">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {[
            { icon: '🎙️', title: 'Voice Capture', desc: 'Talk naturally during practice. AI segments your notes into per-player observations.' },
            { icon: '📊', title: 'Skill Tracking', desc: 'Curriculum-aligned progression from Exploring to Game Ready. Parents see beautiful report cards.' },
            { icon: '📋', title: 'AI Plans', desc: 'Generate practice plans, game day sheets, and development cards with one tap.' },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-800 text-2xl">{f.icon}</div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-zinc-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Sports */}
      <div className="mx-auto max-w-4xl px-4 pb-16 text-center">
        <p className="text-sm text-zinc-500">Works with</p>
        <div className="mt-3 flex justify-center gap-6 text-3xl">
          <span title="Basketball">🏀</span>
          <span title="Flag Football">🏈</span>
          <span title="Soccer">⚽</span>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-zinc-800 py-8 text-center text-sm text-zinc-500">
        CourtIQ — Coaching Intelligence Platform
      </div>
    </div>
  );
}

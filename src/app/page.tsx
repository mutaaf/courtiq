import Link from 'next/link';
import Image from 'next/image';
import { createServerSupabase } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Mic, BarChart3, Share2, Check, ArrowRight } from 'lucide-react';

export default async function LandingPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/home');

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 p-1.5 shadow-lg shadow-orange-500/20">
            <Image src="/logo.svg" alt="CourtIQ" width={28} height={28} className="invert" />
          </div>
          <span className="font-bold text-xl">CourtIQ</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm font-medium text-zinc-400 hover:text-zinc-100 transition-colors">
            Sign in
          </Link>
          <Link href="/demo" className="inline-flex h-10 items-center justify-center rounded-xl bg-orange-500 px-5 text-sm font-semibold text-white shadow-lg shadow-orange-500/25 transition hover:bg-orange-600">
            Try Free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="flex flex-col items-center justify-center px-4 pt-16 pb-20 text-center max-w-4xl mx-auto">
        <div className="mb-4 inline-flex items-center rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-1.5 text-sm font-medium text-orange-400">
          Built for YMCA, AAU, and rec league coaches
        </div>
        <h1 className="text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl leading-tight">
          Coach smarter.<br />
          <span className="text-orange-500">Not harder.</span>
        </h1>
        <p className="mt-6 max-w-lg text-lg text-zinc-400 leading-relaxed">
          Voice-first AI coaching platform. Record observations during practice, get AI-generated plans, and share beautiful progress reports with parents.
        </p>
        <div className="mt-10 flex flex-col gap-4 sm:flex-row">
          <Link href="/demo" className="inline-flex h-14 items-center justify-center rounded-xl bg-orange-500 px-10 text-lg font-semibold text-white shadow-lg shadow-orange-500/25 transition hover:bg-orange-600 hover:shadow-orange-500/40 hover:scale-[1.02] active:scale-[0.98]">
            Try it free -- no signup
            <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
          <Link href="/login" className="inline-flex h-14 items-center justify-center rounded-xl border border-zinc-700 px-10 text-lg font-medium text-zinc-300 transition hover:bg-zinc-800 hover:border-zinc-600">
            Sign in
          </Link>
        </div>
      </div>

      {/* Social proof bar */}
      <div className="border-y border-zinc-800/50 bg-zinc-900/30 py-8">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <p className="text-sm font-medium text-zinc-500 uppercase tracking-wider mb-6">Trusted by coaches at</p>
          <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-12">
            <div className="text-zinc-600 font-bold text-lg tracking-wide">YMCA</div>
            <div className="text-zinc-600 font-bold text-lg tracking-wide">AAU</div>
            <div className="text-zinc-600 font-bold text-lg tracking-wide">CYO</div>
            <div className="text-zinc-600 font-bold text-lg tracking-wide">Rec Leagues</div>
            <div className="text-zinc-600 font-bold text-lg tracking-wide">Travel Teams</div>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="mx-auto max-w-5xl px-4 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold sm:text-4xl">How it works</h2>
          <p className="mt-3 text-zinc-400 text-lg">Three steps to better coaching</p>
        </div>
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div className="relative text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500/15 ring-1 ring-orange-500/30">
              <Mic className="h-8 w-8 text-orange-500" />
            </div>
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">1</div>
            <h3 className="text-lg font-semibold">Record</h3>
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed max-w-xs mx-auto">
              Talk naturally during practice. CourtIQ listens and automatically tags observations to each player.
            </p>
          </div>
          <div className="relative text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/15 ring-1 ring-blue-500/30">
              <BarChart3 className="h-8 w-8 text-blue-500" />
            </div>
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white">2</div>
            <h3 className="text-lg font-semibold">AI Analyzes</h3>
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed max-w-xs mx-auto">
              AI maps observations to your curriculum, tracks skill progression, and spots patterns you might miss.
            </p>
          </div>
          <div className="relative text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 ring-1 ring-emerald-500/30">
              <Share2 className="h-8 w-8 text-emerald-500" />
            </div>
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">3</div>
            <h3 className="text-lg font-semibold">Share Reports</h3>
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed max-w-xs mx-auto">
              Generate practice plans, report cards, and parent-friendly progress updates with one tap.
            </p>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="mx-auto max-w-5xl px-4 py-16">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {[
            { icon: '🎙️', title: 'Voice Capture', desc: 'Talk naturally during practice. AI segments your notes into per-player observations automatically.' },
            { icon: '📊', title: 'Skill Tracking', desc: 'Curriculum-aligned progression from Exploring to Game Ready. Parents see beautiful report cards.' },
            { icon: '📋', title: 'AI Practice Plans', desc: 'Generate practice plans, game day sheets, and development cards tailored to your team.' },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 text-center hover:border-zinc-700 transition-colors">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-800 text-2xl">{f.icon}</div>
              <h3 className="text-lg font-semibold">{f.title}</h3>
              <p className="mt-3 text-sm text-zinc-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Pricing */}
      <div className="mx-auto max-w-5xl px-4 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold sm:text-4xl">Simple pricing</h2>
          <p className="mt-3 text-zinc-400 text-lg">Start free. Upgrade when you are ready.</p>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {/* Free */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8">
            <h3 className="text-lg font-semibold">Free</h3>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-4xl font-bold">$0</span>
              <span className="text-zinc-500">/month</span>
            </div>
            <p className="mt-3 text-sm text-zinc-400">Perfect for trying things out</p>
            <ul className="mt-6 space-y-3">
              {['1 team, up to 12 players', '5 voice captures/week', 'Basic skill tracking', 'Community support'].map(f => (
                <li key={f} className="flex items-start gap-2 text-sm text-zinc-300">
                  <Check className="h-4 w-4 mt-0.5 text-zinc-500 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Link href="/demo" className="mt-8 flex h-11 items-center justify-center rounded-xl border border-zinc-700 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition">
              Get Started
            </Link>
          </div>
          {/* Coach — highlighted */}
          <div className="rounded-2xl border-2 border-orange-500 bg-zinc-900/50 p-8 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-orange-500 px-4 py-1 text-xs font-bold text-white">MOST POPULAR</div>
            <h3 className="text-lg font-semibold">Coach</h3>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-4xl font-bold text-orange-500">$9</span>
              <span className="text-zinc-500">/month</span>
            </div>
            <p className="mt-3 text-sm text-zinc-400">For serious volunteer coaches</p>
            <ul className="mt-6 space-y-3">
              {['Unlimited teams & players', 'Unlimited voice captures', 'AI practice plan generation', 'Parent report cards', 'Email support'].map(f => (
                <li key={f} className="flex items-start gap-2 text-sm text-zinc-300">
                  <Check className="h-4 w-4 mt-0.5 text-orange-500 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Link href="/demo" className="mt-8 flex h-11 items-center justify-center rounded-xl bg-orange-500 text-sm font-semibold text-white shadow-lg shadow-orange-500/25 hover:bg-orange-600 transition">
              Start Free Trial
            </Link>
          </div>
          {/* Pro */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8">
            <h3 className="text-lg font-semibold">Pro</h3>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-4xl font-bold">$29</span>
              <span className="text-zinc-500">/month</span>
            </div>
            <p className="mt-3 text-sm text-zinc-400">For organizations & leagues</p>
            <ul className="mt-6 space-y-3">
              {['Everything in Coach', 'Multi-coach organizations', 'Custom curriculum builder', 'Advanced analytics', 'Priority support', 'API access'].map(f => (
                <li key={f} className="flex items-start gap-2 text-sm text-zinc-300">
                  <Check className="h-4 w-4 mt-0.5 text-zinc-500 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Link href="/demo" className="mt-8 flex h-11 items-center justify-center rounded-xl border border-zinc-700 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition">
              Contact Sales
            </Link>
          </div>
        </div>
      </div>

      {/* Sports */}
      <div className="mx-auto max-w-4xl px-4 pb-16 text-center">
        <p className="text-sm text-zinc-500 font-medium uppercase tracking-wider">Works with</p>
        <div className="mt-4 flex justify-center gap-8 text-4xl">
          <span title="Basketball">🏀</span>
          <span title="Flag Football">🏈</span>
          <span title="Soccer">⚽</span>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="bg-gradient-to-t from-orange-500/10 to-transparent py-24">
        <div className="mx-auto max-w-2xl px-4 text-center">
          <h2 className="text-3xl font-bold sm:text-4xl">Start coaching smarter today</h2>
          <p className="mt-4 text-lg text-zinc-400">
            Join hundreds of volunteer coaches who save hours every week with AI-powered practice planning and player tracking.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
            <Link href="/demo" className="inline-flex h-14 items-center justify-center rounded-xl bg-orange-500 px-10 text-lg font-semibold text-white shadow-lg shadow-orange-500/25 transition hover:bg-orange-600 hover:scale-[1.02] active:scale-[0.98]">
              Try it free -- no signup
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-zinc-800 py-8 text-center text-sm text-zinc-500">
        CourtIQ -- Coaching Intelligence Platform
      </div>
    </div>
  );
}

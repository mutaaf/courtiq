'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { Mic, BarChart3, Share2, Check, ArrowRight, Brain, Users, Shield, Trophy, ClipboardList, Eye } from 'lucide-react';

export default function LandingContent() {
  const [annual, setAnnual] = useState(false);

  const monthlyPrices = [0, 9.99, 24.99, 49.99];
  const annualPrices = monthlyPrices.map(p => +(p * 0.8).toFixed(2));
  const prices = annual ? annualPrices : monthlyPrices;
  const period = annual ? '/mo (billed yearly)' : '/month';

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
          <p className="text-sm font-medium text-zinc-500 uppercase tracking-wider mb-6">Designed for organizations like</p>
          <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-12">
            <div className="text-zinc-600 font-bold text-lg tracking-wide">YMCA</div>
            <div className="text-zinc-600 font-bold text-lg tracking-wide">Boys &amp; Girls Club</div>
            <div className="text-zinc-600 font-bold text-lg tracking-wide">AAU</div>
            <div className="text-zinc-600 font-bold text-lg tracking-wide">CYO</div>
            <div className="text-zinc-600 font-bold text-lg tracking-wide">Rec Leagues</div>
          </div>
        </div>
      </div>

      {/* How it works — 4 steps */}
      <div className="mx-auto max-w-5xl px-4 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold sm:text-4xl">How it works</h2>
          <p className="mt-3 text-zinc-400 text-lg">Four steps from practice to progress</p>
        </div>
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Step 1 */}
          <div className="relative text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500/15 ring-1 ring-orange-500/30">
              <Mic className="h-8 w-8 text-orange-500" />
            </div>
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">1</div>
            <h3 className="text-lg font-semibold">Record</h3>
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed max-w-xs mx-auto">
              Talk naturally during practice. Just hit record and coach. Our AI understands coaching language.
            </p>
          </div>
          {/* Step 2 */}
          <div className="relative text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/15 ring-1 ring-blue-500/30">
              <Brain className="h-8 w-8 text-blue-500" />
            </div>
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white">2</div>
            <h3 className="text-lg font-semibold">AI Analyzes</h3>
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed max-w-xs mx-auto">
              Observations are automatically segmented per player, categorized, and linked to your curriculum.
            </p>
          </div>
          {/* Step 3 */}
          <div className="relative text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 ring-1 ring-emerald-500/30">
              <BarChart3 className="h-8 w-8 text-emerald-500" />
            </div>
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">3</div>
            <h3 className="text-lg font-semibold">Track Progress</h3>
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed max-w-xs mx-auto">
              Watch players grow from &ldquo;Exploring&rdquo; to &ldquo;Game Ready&rdquo; with data-driven skill progression.
            </p>
          </div>
          {/* Step 4 */}
          <div className="relative text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-500/15 ring-1 ring-purple-500/30">
              <Share2 className="h-8 w-8 text-purple-500" />
            </div>
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-purple-500 text-xs font-bold text-white">4</div>
            <h3 className="text-lg font-semibold">Share</h3>
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed max-w-xs mx-auto">
              Send beautiful, interactive report cards to parents. They&apos;ll love seeing their child&apos;s progress.
            </p>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="mx-auto max-w-5xl px-4 py-16">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {[
            { icon: Mic, title: 'Voice Capture', desc: 'Talk naturally during practice. AI segments your notes into per-player observations automatically.', color: 'text-orange-500 bg-orange-500/10' },
            { icon: BarChart3, title: 'Skill Tracking', desc: 'Curriculum-aligned progression from Exploring to Game Ready. Parents see beautiful report cards.', color: 'text-blue-500 bg-blue-500/10' },
            { icon: ClipboardList, title: 'AI Practice Plans', desc: 'Generate practice plans, game day sheets, and development cards tailored to your team.', color: 'text-emerald-500 bg-emerald-500/10' },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 text-center hover:border-zinc-700 transition-colors">
              <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${f.color}`}>
                <f.icon className="h-7 w-7" />
              </div>
              <h3 className="text-lg font-semibold">{f.title}</h3>
              <p className="mt-3 text-sm text-zinc-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Persona sections */}
      <div className="mx-auto max-w-5xl px-4 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold sm:text-4xl">Built for everyone in youth sports</h2>
          <p className="mt-3 text-zinc-400 text-lg">Whether you coach, parent, or run a program</p>
        </div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {/* Volunteer Coaches */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 hover:border-orange-500/40 transition-colors">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500/15">
              <Trophy className="h-6 w-6 text-orange-500" />
            </div>
            <h3 className="text-lg font-semibold">For Volunteer Coaches</h3>
            <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
              No coaching degree required. CourtIQ&apos;s curriculum engine guides you through age-appropriate skill development.
            </p>
          </div>
          {/* Parents */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 hover:border-blue-500/40 transition-colors">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/15">
              <Eye className="h-6 w-6 text-blue-500" />
            </div>
            <h3 className="text-lg font-semibold">For Parents</h3>
            <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
              See your child&apos;s progress in beautiful, easy-to-understand report cards. Know exactly what they&apos;re working on.
            </p>
          </div>
          {/* Program Directors */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 hover:border-emerald-500/40 transition-colors">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15">
              <Users className="h-6 w-6 text-emerald-500" />
            </div>
            <h3 className="text-lg font-semibold">For Program Directors</h3>
            <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
              Track every team, coach, and player across your program. Ensure curriculum compliance and coach engagement.
            </p>
          </div>
        </div>
      </div>

      {/* Pricing */}
      <div className="mx-auto max-w-6xl px-4 py-24">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold sm:text-4xl">Simple pricing</h2>
          <p className="mt-3 text-zinc-400 text-lg">Start free. Upgrade when you are ready.</p>
          {/* Annual toggle */}
          <div className="mt-8 flex items-center justify-center gap-3">
            <span className={`text-sm font-medium ${!annual ? 'text-zinc-100' : 'text-zinc-500'}`}>Monthly</span>
            <button
              onClick={() => setAnnual(!annual)}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${annual ? 'bg-orange-500' : 'bg-zinc-700'}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${annual ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <span className={`text-sm font-medium ${annual ? 'text-zinc-100' : 'text-zinc-500'}`}>Annual</span>
            {annual && <span className="ml-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">Save 20%</span>}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {/* Free */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8">
            <h3 className="text-lg font-semibold">Free</h3>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-4xl font-bold">$0</span>
              <span className="text-zinc-500">/month</span>
            </div>
            <p className="mt-3 text-sm text-zinc-400">Perfect for trying CourtIQ</p>
            <ul className="mt-6 space-y-3">
              {['1 team, 10 players', '5 AI-powered observations/month', 'Basic practice plans', 'Community support'].map(f => (
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
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-orange-500 px-4 py-1 text-xs font-bold text-white uppercase tracking-wide">Most Popular</div>
            <h3 className="text-lg font-semibold">Coach</h3>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-4xl font-bold text-orange-500">${prices[1]}</span>
              <span className="text-zinc-500">{period}</span>
            </div>
            <p className="mt-3 text-sm text-zinc-400">For individual coaches</p>
            <ul className="mt-6 space-y-3">
              {['Unlimited teams & players', 'Unlimited AI observations', 'Practice plans & game day sheets', 'Player report cards', 'Parent sharing portal'].map(f => (
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

          {/* Pro Coach */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8">
            <h3 className="text-lg font-semibold">Pro Coach</h3>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-4xl font-bold">${prices[2]}</span>
              <span className="text-zinc-500">{period}</span>
            </div>
            <p className="mt-3 text-sm text-zinc-400">For serious coaches</p>
            <ul className="mt-6 space-y-3">
              {['Everything in Coach', 'Advanced analytics & tendencies', 'Custom AI prompts', 'Priority AI processing', 'Video upload & analysis'].map(f => (
                <li key={f} className="flex items-start gap-2 text-sm text-zinc-300">
                  <Check className="h-4 w-4 mt-0.5 text-zinc-500 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Link href="/demo" className="mt-8 flex h-11 items-center justify-center rounded-xl border border-zinc-700 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition">
              Start Free Trial
            </Link>
          </div>

          {/* Program */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8">
            <h3 className="text-lg font-semibold">Program</h3>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-4xl font-bold">${prices[3]}</span>
              <span className="text-zinc-500">{period}</span>
            </div>
            <p className="mt-3 text-sm text-zinc-400">For leagues &amp; programs</p>
            <ul className="mt-6 space-y-3">
              {['Everything in Pro Coach', 'Multi-coach collaboration', 'Organization dashboard', 'Custom branding', 'API access'].map(f => (
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

      {/* Sports + trust signals */}
      <div className="border-y border-zinc-800/50 bg-zinc-900/30 py-16">
        <div className="mx-auto max-w-4xl px-4">
          {/* Sport badges */}
          <div className="text-center mb-12">
            <p className="text-sm text-zinc-500 font-medium uppercase tracking-wider mb-4">Works with your sport</p>
            <div className="flex justify-center gap-6">
              <div className="flex flex-col items-center gap-2">
                <span className="text-4xl">🏀</span>
                <span className="text-xs font-medium text-zinc-400">Basketball</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <span className="text-4xl">🏈</span>
                <span className="text-xs font-medium text-zinc-400">Flag Football</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <span className="text-4xl">⚽</span>
                <span className="text-xs font-medium text-zinc-400">Soccer</span>
              </div>
              <div className="flex flex-col items-center gap-2 opacity-50">
                <span className="text-4xl">+</span>
                <span className="text-xs font-medium text-zinc-500">More coming</span>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap justify-center gap-8 mb-12">
            <div className="text-center">
              <div className="text-2xl font-bold text-zinc-100">50+</div>
              <div className="text-xs text-zinc-500 mt-1">Drills</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-zinc-100">12</div>
              <div className="text-xs text-zinc-500 mt-1">Curriculum Skills</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-zinc-100">3</div>
              <div className="text-xs text-zinc-500 mt-1">AI Providers</div>
            </div>
          </div>

          {/* Trust / compliance */}
          <div className="flex items-center justify-center gap-2 text-sm text-zinc-500">
            <Shield className="h-4 w-4 text-emerald-500" />
            <span>Your data is yours. COPPA compliant. Encrypted. Never shared.</span>
          </div>
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

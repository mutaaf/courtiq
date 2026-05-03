'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import {
  Mic,
  BarChart3,
  Share2,
  Check,
  ArrowRight,
  Sparkles,
  Users,
  Shield,
  ClipboardList,
  ChevronDown,
  MessageCircle,
  Smartphone,
  WifiOff,
  Lock,
  Calendar,
  Star,
  Loader2,
  RotateCcw,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

export default function LandingContent() {
  const [annual, setAnnual] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // ── Inline AI demo state ────────────────────────────────────────────────────
  type InlineDemoPhase = 'idle' | 'loading' | 'done';
  const [inlinePhase, setInlinePhase] = useState<InlineDemoPhase>('idle');
  const [inlineText, setInlineText] = useState('');
  const [inlineObs, setInlineObs] = useState<Array<{
    player_name: string;
    category: string;
    sentiment: 'positive' | 'needs-work';
    text: string;
  }>>([]);
  const [inlineFromAI, setInlineFromAI] = useState(false);

  const INLINE_ROSTER = [
    { name: 'Marcus', nickname: null, position: 'Guard', jersey_number: 12, name_variants: [] },
    { name: 'Sofia', nickname: null, position: 'Guard', jersey_number: 23, name_variants: [] },
    { name: 'Jayden', nickname: 'Jay', position: 'Forward', jersey_number: 7, name_variants: [] },
    { name: 'Tyler', nickname: null, position: 'Forward', jersey_number: 4, name_variants: [] },
  ];

  const INLINE_PLACEHOLDER =
    "Marcus had a great cut to the basket. Sofia needs to work on her footwork — she's getting caught flat-footed on defense. Jayden showed excellent court vision and made the extra pass.";

  const INLINE_FALLBACK = [
    { player_name: 'Marcus', category: 'Offense', sentiment: 'positive' as const, text: 'Excellent cut to the basket with great timing. Shows strong off-ball movement and reads the defense well.' },
    { player_name: 'Sofia', category: 'Defense', sentiment: 'needs-work' as const, text: 'Needs to work on footwork on defense — getting caught flat-footed when the offense changes direction quickly.' },
    { player_name: 'Jayden', category: 'IQ', sentiment: 'positive' as const, text: 'Made a smart extra pass to the open player instead of forcing a shot. Great court vision under pressure.' },
  ];

  async function handleInlineDemo() {
    const transcript = inlineText.trim() || INLINE_PLACEHOLDER;
    setInlinePhase('loading');
    try {
      const res = await fetch('/api/ai/demo-segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, demoRoster: INLINE_ROSTER }),
      });
      if (res.ok) {
        const data = await res.json();
        if (!data.fallback && data.observations?.length > 0) {
          setInlineObs(data.observations.slice(0, 3));
          setInlineFromAI(true);
          setInlinePhase('done');
          return;
        }
      }
    } catch {}
    setInlineObs(INLINE_FALLBACK);
    setInlineFromAI(false);
    setInlinePhase('done');
  }

  function resetInlineDemo() {
    setInlinePhase('idle');
    setInlineText('');
    setInlineObs([]);
    setInlineFromAI(false);
  }
  // ────────────────────────────────────────────────────────────────────────────

  const monthlyPrices = [0, 9.99, 24.99];
  const annualPrices = monthlyPrices.map((p) => +(p * 0.8).toFixed(2));
  const prices = annual ? annualPrices : monthlyPrices;
  const period = annual ? '/mo (billed yearly)' : '/month';

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 border-b border-zinc-200 bg-white/80 backdrop-blur-lg">
        <div className="flex items-center justify-between px-4 py-3 max-w-6xl mx-auto">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 p-1.5 shadow-lg shadow-orange-500/20">
              <Image src="/logo.svg" alt="SportsIQ" width={24} height={24} className="invert" />
            </div>
            <span className="font-bold text-lg text-zinc-900">SportsIQ</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="text-sm font-medium text-zinc-500 hover:text-zinc-800 transition-colors px-3 py-2"
            >
              Sign in
            </Link>
            <Button asChild size="sm">
              <Link href="/signup">Sign up</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-orange-50 via-transparent to-transparent pointer-events-none" />
        <div className="relative flex flex-col items-center px-4 pt-12 pb-16 sm:pt-20 sm:pb-24 text-center max-w-3xl mx-auto">
          <Badge className="mb-6 bg-orange-100 text-orange-700 border-orange-200">Used by 50+ youth coaches across YMCA, AAU &amp; rec leagues</Badge>

          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl leading-[1.1]">
            Every player deserves a coach{' '}
            <span className="text-orange-500">who sees them.</span>
          </h1>

          <p className="mt-5 max-w-lg text-base sm:text-lg text-zinc-600 leading-relaxed">
            Voice-powered AI that turns your courtside observations into player development plans, progress reports, and smarter practices.
          </p>

          <div className="mt-8 flex flex-col gap-3 w-full sm:flex-row sm:justify-center sm:w-auto">
            <Button asChild size="xl" className="shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all">
              <Link href="/signup">
                Get started — free
                <ArrowRight className="ml-1.5 h-5 w-5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="xl" className="border-zinc-300 text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900">
              <button onClick={() => scrollTo('how-it-works')}>
                Watch how it works
                <ChevronDown className="ml-1.5 h-4 w-4" />
              </button>
            </Button>
          </div>

          <p className="mt-4 text-xs text-zinc-400">20-second demo. No signup required.</p>
        </div>
      </section>

      {/* ── Problem Statement ── */}
      <section className="border-y border-zinc-200 bg-zinc-50/50 py-14 sm:py-20">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-center text-2xl font-bold sm:text-3xl mb-10">Sound familiar?</h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              {
                icon: MessageCircle,
                pain: '"How\'s my kid doing?"',
                detail: 'Parents ask and you don\'t have specifics. You know their child is improving, but you can\'t point to when or how.',
              },
              {
                icon: ClipboardList,
                pain: '"I\'ll plan practice later..."',
                detail: 'By the time you get home, you forgot what you wanted to work on. Practice planning starts from scratch every time.',
              },
              {
                icon: Calendar,
                pain: '"I know they\'ve gotten better, but..."',
                detail: 'You see the progress in real time, but you have no record of it. Season-end reports are guesswork.',
              },
            ].map((p) => (
              <Card key={p.pain} className="p-6 text-center bg-white border-zinc-200 text-zinc-900 hover:border-zinc-300 hover:shadow-md transition-all">
                <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50">
                  <p.icon className="h-5 w-5 text-orange-500" />
                </div>
                <p className="font-semibold text-sm text-orange-400 mb-2">{p.pain}</p>
                <p className="text-sm text-zinc-600 leading-relaxed">{p.detail}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="mx-auto max-w-4xl px-4 py-16 sm:py-24">
        <div className="text-center mb-14">
          <h2 className="text-2xl font-bold sm:text-3xl">Three steps. Zero learning curve.</h2>
          <p className="mt-3 text-zinc-400">From practice to progress report in minutes.</p>
        </div>

        <div className="grid gap-8 sm:grid-cols-3">
          {[
            {
              step: '1',
              icon: Mic,
              color: 'orange',
              title: 'Record',
              desc: 'Hit record during practice and talk naturally. "Marcus needs work on his left hand." We handle the rest.',
              ring: 'ring-orange-500/30 bg-orange-100',
              badge: 'bg-orange-500',
              iconColor: 'text-orange-500',
            },
            {
              step: '2',
              icon: Sparkles,
              color: 'blue',
              title: 'AI Analyzes',
              desc: 'Your words become per-player observations, sorted by skill, linked to your curriculum. Automatically.',
              ring: 'ring-blue-500/30 bg-blue-50',
              badge: 'bg-blue-500',
              iconColor: 'text-blue-500',
            },
            {
              step: '3',
              icon: Share2,
              color: 'emerald',
              title: 'Share & Plan',
              desc: 'Generate practice plans. Send beautiful report cards to parents. Track development all season long.',
              ring: 'ring-emerald-500/30 bg-emerald-500/15',
              badge: 'bg-emerald-500',
              iconColor: 'text-emerald-500',
            },
          ].map((s) => (
            <div key={s.step} className="relative text-center">
              <div className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl ring-1 ${s.ring}`}>
                <s.icon className={`h-8 w-8 ${s.iconColor}`} />
              </div>
              <div className={`absolute -top-2 left-1/2 -translate-x-1/2 flex h-7 w-7 items-center justify-center rounded-full ${s.badge} text-xs font-bold text-white`}>
                {s.step}
              </div>
              <h3 className="text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-zinc-600 leading-relaxed max-w-xs mx-auto">{s.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button asChild size="lg">
            <Link href="/demo">
              See it in action
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="border-zinc-300 text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900">
            <Link href="/demo/report">
              See a sample parent report
            </Link>
          </Button>
        </div>
      </section>

      {/* ── App Preview ── */}
      <section className="overflow-hidden bg-zinc-950 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center mb-12">
            <Badge className="mb-4 bg-orange-500/20 text-orange-400 border-orange-500/30 hover:bg-orange-500/20">See the app</Badge>
            <h2 className="text-2xl font-bold sm:text-3xl text-zinc-100">From whistle to parent update in minutes</h2>
            <p className="mt-3 text-zinc-400 max-w-xl mx-auto">No forms. No spreadsheets. Talk during practice — SportsIQ turns your words into organized notes, skill tracking, and parent-ready reports.</p>
          </div>

          <div className="flex gap-6 overflow-x-auto pb-6 sm:grid sm:grid-cols-3 sm:overflow-x-visible sm:pb-0 snap-x snap-mandatory sm:snap-none">

            {/* Phone 1: Voice Capture */}
            <div className="flex-shrink-0 snap-center flex flex-col items-center" style={{ minWidth: 220 }}>
              <div className="w-56 rounded-[2.5rem] border-2 border-zinc-700 bg-zinc-900 p-2 shadow-2xl shadow-black/60">
                <div className="rounded-[2rem] overflow-hidden bg-zinc-950">
                  <div className="flex items-center justify-between px-5 pt-3 pb-1">
                    <span className="text-[10px] text-zinc-500 font-medium">9:41</span>
                    <div className="flex gap-1">
                      <div className="w-4 h-1.5 rounded-sm bg-zinc-600" />
                      <div className="w-1.5 h-1.5 rounded-sm bg-zinc-600" />
                    </div>
                  </div>
                  <div className="px-4 pb-6 pt-2">
                    <div className="text-center mb-5">
                      <p className="text-[10px] text-zinc-500 mb-0.5">YMCA Rockets · Practice</p>
                      <p className="text-xs font-semibold text-zinc-100">Capture Observation</p>
                    </div>
                    <div className="flex flex-col items-center gap-4">
                      <div className="relative flex items-center justify-center">
                        <div className="absolute h-20 w-20 rounded-full bg-orange-500/20 animate-ping" style={{ animationDuration: '2s' }} />
                        <div className="absolute h-24 w-24 rounded-full bg-orange-500/10" />
                        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-orange-500 shadow-lg shadow-orange-500/40">
                          <Mic className="h-7 w-7 text-white" />
                        </div>
                      </div>
                      <div className="w-full rounded-xl bg-zinc-800 p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                          <span className="text-[10px] font-semibold text-zinc-400 tracking-wider">RECORDING</span>
                        </div>
                        <p className="text-[10px] text-zinc-300 leading-relaxed italic">
                          &ldquo;Marcus needs work on his left-hand crossover… Tyler had great defensive positioning today…&rdquo;
                        </p>
                      </div>
                      <p className="text-[10px] text-zinc-600 text-center">Tap to stop recording</p>
                    </div>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm font-semibold text-zinc-300">1. Talk during practice</p>
              <p className="text-xs text-zinc-500 text-center max-w-[14rem] mt-1">Hands-free. Just coach like normal.</p>
            </div>

            {/* Phone 2: AI Observations */}
            <div className="flex-shrink-0 snap-center flex flex-col items-center" style={{ minWidth: 220 }}>
              <div className="w-56 rounded-[2.5rem] border-2 border-zinc-700 bg-zinc-900 p-2 shadow-2xl shadow-black/60">
                <div className="rounded-[2rem] overflow-hidden bg-zinc-950">
                  <div className="flex items-center justify-between px-5 pt-3 pb-1">
                    <span className="text-[10px] text-zinc-500 font-medium">9:41</span>
                    <div className="flex gap-1">
                      <div className="w-4 h-1.5 rounded-sm bg-zinc-600" />
                      <div className="w-1.5 h-1.5 rounded-sm bg-zinc-600" />
                    </div>
                  </div>
                  <div className="px-4 pb-6 pt-2">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-5 w-5 rounded-full bg-blue-500/20 flex items-center justify-center">
                        <Sparkles className="h-3 w-3 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-zinc-100">AI found 3 observations</p>
                        <p className="text-[9px] text-zinc-500">Review and save</p>
                      </div>
                    </div>
                    {[
                      { name: 'Marcus', initial: 'M', text: 'Needs work on left-hand crossover', positive: false, category: 'Dribbling' },
                      { name: 'Tyler', initial: 'T', text: 'Strong defensive positioning', positive: true, category: 'Defense' },
                      { name: 'Team', initial: '★', text: 'Great energy all practice', positive: true, category: 'Hustle' },
                    ].map((obs) => (
                      <div key={obs.name} className="mb-2 rounded-xl border border-zinc-800 bg-zinc-900/80 p-2.5">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold ${obs.positive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                              {obs.initial}
                            </div>
                            <span className="text-[10px] font-medium text-zinc-200">{obs.name}</span>
                          </div>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${obs.positive ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                            {obs.category}
                          </span>
                        </div>
                        <p className="text-[10px] text-zinc-400 leading-relaxed">{obs.text}</p>
                      </div>
                    ))}
                    <button className="mt-1 w-full rounded-xl bg-orange-500 py-2 text-[10px] font-semibold text-white">
                      Save 3 Observations
                    </button>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm font-semibold text-zinc-300">2. AI organizes everything</p>
              <p className="text-xs text-zinc-500 text-center max-w-[14rem] mt-1">Named, categorized, ready to review.</p>
            </div>

            {/* Phone 3: Parent Portal */}
            <div className="flex-shrink-0 snap-center flex flex-col items-center" style={{ minWidth: 220 }}>
              <div className="w-56 rounded-[2.5rem] border-2 border-zinc-700 bg-zinc-900 p-2 shadow-2xl shadow-black/60">
                <div className="rounded-[2rem] overflow-hidden bg-gray-50">
                  <div className="flex items-center justify-between px-5 pt-3 pb-1 bg-gray-50">
                    <span className="text-[10px] text-gray-400 font-medium">9:41</span>
                    <div className="flex gap-1">
                      <div className="w-4 h-1.5 rounded-sm bg-gray-300" />
                      <div className="w-1.5 h-1.5 rounded-sm bg-gray-300" />
                    </div>
                  </div>
                  <div className="px-4 pb-6 pt-2 bg-gray-50">
                    <div className="text-center mb-3">
                      <div className="mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-orange-100">
                        <span className="text-sm font-bold text-orange-600">M</span>
                      </div>
                      <p className="text-xs font-bold text-gray-900">Marcus Johnson</p>
                      <p className="text-[9px] text-gray-500">YMCA Rockets · Spring 2025</p>
                    </div>
                    <div className="rounded-xl bg-white border border-gray-100 p-2.5 mb-2 shadow-sm">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <MessageCircle className="h-3 w-3 text-emerald-500" />
                        <span className="text-[10px] font-semibold text-gray-700">Coach&apos;s Update</span>
                      </div>
                      <p className="text-[10px] text-gray-600 leading-relaxed italic">
                        &ldquo;Marcus showed real improvement in his defensive footwork — the extra work is paying off!&rdquo;
                      </p>
                    </div>
                    <div className="rounded-xl bg-white border border-gray-100 p-2.5 shadow-sm">
                      <p className="text-[10px] font-semibold text-gray-700 mb-2">Skill Progress</p>
                      {[
                        { skill: 'Defense', pct: 85, color: 'bg-emerald-400' },
                        { skill: 'Teamwork', pct: 72, color: 'bg-orange-400' },
                        { skill: 'Dribbling', pct: 55, color: 'bg-amber-400' },
                      ].map((s) => (
                        <div key={s.skill} className="mb-2 last:mb-0">
                          <div className="flex justify-between mb-0.5">
                            <span className="text-[9px] text-gray-500">{s.skill}</span>
                            <span className="text-[9px] font-semibold text-gray-700">{s.pct}%</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-gray-100">
                            <div className={`h-1.5 rounded-full ${s.color}`} style={{ width: `${s.pct}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <div className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5">
                        <Check className="h-2.5 w-2.5 text-emerald-600" />
                        <span className="text-[9px] font-medium text-emerald-700">Defense on the rise</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm font-semibold text-zinc-300">3. Parents are impressed</p>
              <p className="text-xs text-zinc-500 text-center max-w-[14rem] mt-1">One tap to share. Parents screenshot it.</p>
            </div>

          </div>

          <div className="mt-10 text-center">
            <Button asChild size="lg" className="shadow-lg shadow-orange-500/30">
              <Link href="/demo">
                Try it yourself — free, no signup
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ── For Coaches ── */}
      <section className="border-y border-zinc-200 bg-zinc-50/50 py-16 sm:py-24">
        <div className="mx-auto max-w-4xl px-4">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold sm:text-3xl">Built for coaches like you</h2>
            <p className="mt-3 text-zinc-400">No tech skills. No coaching degree. Just better practices.</p>
          </div>

          {/* Testimonial */}
          <Card className="p-6 sm:p-8 mb-10 border-orange-200 bg-orange-50/50 text-zinc-900">
            <blockquote className="text-base sm:text-lg text-zinc-800 leading-relaxed italic text-center">
              &ldquo;I used to forget what I wanted to work on by the time I got home. Now everything&apos;s captured before I even leave the gym.&rdquo;
            </blockquote>
            <p className="mt-4 text-sm text-zinc-500 text-center">-- A YMCA Youth Basketball Coach</p>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { icon: Mic, label: 'Voice capture', desc: 'Hands-free during practice. Just talk.' },
              { icon: Sparkles, label: 'AI practice plans', desc: 'Generated from what your players actually need.' },
              { icon: BarChart3, label: 'Player report cards', desc: 'Beautiful progress reports parents love.' },
              { icon: Smartphone, label: 'No tech skills required', desc: 'If you can press record, you\'re good.' },
            ].map((b) => (
              <div key={b.label} className="flex items-start gap-4 rounded-xl border border-zinc-200 bg-white p-5 hover:border-zinc-300 hover:shadow-sm transition-colors">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50">
                  <b.icon className="h-5 w-5 text-orange-500" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{b.label}</p>
                  <p className="text-sm text-zinc-600 mt-0.5">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── For Organizations ── */}
      <section className="mx-auto max-w-4xl px-4 py-16 sm:py-24">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold sm:text-3xl">Running a program?</h2>
          <p className="mt-3 text-zinc-600 max-w-lg mx-auto">
            SportsIQ gives you visibility across every team, every coach, every player in your organization.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: ClipboardList, label: 'Curriculum compliance', desc: 'Ensure all coaches follow your development framework.' },
            { icon: Users, label: 'Coach engagement', desc: 'See which coaches are actively recording and tracking.' },
            { icon: BarChart3, label: 'Standardized reporting', desc: 'Consistent progress reports across your entire program.' },
          ].map((b) => (
            <Card key={b.label} className="p-6 text-center bg-white border-zinc-200 text-zinc-900 hover:border-zinc-300 hover:shadow-md transition-all">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50">
                <b.icon className="h-5 w-5 text-emerald-500" />
              </div>
              <p className="font-semibold text-sm">{b.label}</p>
              <p className="text-sm text-zinc-600 mt-1">{b.desc}</p>
            </Card>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Button asChild variant="outline" size="lg" className="border-zinc-300 text-zinc-700 hover:bg-zinc-100">
            <Link href="/demo">Schedule a Demo</Link>
          </Button>
        </div>
      </section>

      {/* ── Demo Preview — inline AI ── */}
      <section className="border-y border-zinc-200 bg-zinc-50/50 py-16 sm:py-20">
        <div className="mx-auto max-w-2xl px-4">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold sm:text-3xl mb-3">See it in action</h2>
            <p className="text-zinc-600 max-w-md mx-auto">
              Type what you&apos;d say on the sideline. Claude AI turns your words into structured player observations instantly — no account needed.
            </p>
          </div>

          <Card className="bg-white border-orange-200 text-zinc-900 overflow-hidden">
            {/* Idle state — input */}
            {inlinePhase === 'idle' && (
              <div className="p-6 sm:p-8 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                    What did you see at practice today?
                  </label>
                  <Textarea
                    placeholder={INLINE_PLACEHOLDER}
                    value={inlineText}
                    onChange={(e) => setInlineText(e.target.value)}
                    rows={3}
                    className="w-full resize-none border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus:border-orange-400 bg-white"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleInlineDemo();
                    }}
                  />
                  <p className="mt-1.5 text-xs text-zinc-400">Mention any player names — AI will match them automatically. ⌘↵ to run.</p>
                </div>
                <Button
                  onClick={handleInlineDemo}
                  size="lg"
                  className="w-full shadow-lg shadow-orange-500/25"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Analyze with Claude AI
                </Button>
                <div className="flex items-center justify-center gap-4 text-xs text-zinc-400">
                  <span>No signup · No mic needed</span>
                  <span>·</span>
                  <Link href="/demo" className="hover:text-zinc-600 underline underline-offset-2 flex items-center gap-1">
                    <Mic className="h-3 w-3" />
                    Prefer voice?
                  </Link>
                </div>
              </div>
            )}

            {/* Loading state */}
            {inlinePhase === 'loading' && (
              <div className="p-8 flex flex-col items-center gap-4 text-center">
                <div className="relative flex h-14 w-14 items-center justify-center">
                  <div className="absolute inset-0 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
                  <Sparkles className="h-5 w-5 text-orange-500" />
                </div>
                <div>
                  <p className="font-semibold text-zinc-800">Claude AI is reading your coaching…</p>
                  <p className="text-sm text-zinc-500 mt-1">Identifying players, categorising skills, flagging growth areas</p>
                </div>
                <div className="mt-1 flex flex-col gap-1.5 text-xs text-zinc-400">
                  {['👤 Matching player names', '🏀 Categorising by skill', '💡 Positive vs needs-work'].map((s, i) => (
                    <span key={s} className="animate-pulse" style={{ animationDelay: `${i * 0.3}s` }}>{s}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Done state — results */}
            {inlinePhase === 'done' && (
              <div className="divide-y divide-zinc-100">
                {/* Header bar */}
                <div className="flex items-center justify-between px-5 py-3 bg-zinc-50 border-b border-zinc-200">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-600">
                      {inlineObs.length} observation{inlineObs.length !== 1 ? 's' : ''} found
                    </span>
                    {inlineFromAI && (
                      <span className="flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                        <Wand2 className="h-2.5 w-2.5" />
                        Live Claude AI
                      </span>
                    )}
                  </div>
                  <button
                    onClick={resetInlineDemo}
                    className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Try again
                  </button>
                </div>

                {/* Observation cards */}
                <div className="p-5 space-y-3">
                  {inlineObs.map((obs, i) => (
                    <div key={i} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-600">
                            {obs.player_name[0]}
                          </div>
                          <span className="font-semibold text-sm text-zinc-800">{obs.player_name}</span>
                        </div>
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          obs.sentiment === 'positive'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {obs.sentiment === 'positive' ? '✓' : '!'} {obs.category}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-600 leading-relaxed">{obs.text}</p>
                    </div>
                  ))}
                </div>

                {/* Signup CTA */}
                <div className="p-5 bg-gradient-to-r from-orange-500 to-orange-600 text-center space-y-3">
                  <div>
                    <p className="font-bold text-white">Ready to save observations and track real progress?</p>
                    <p className="text-orange-100 text-sm mt-0.5">
                      Free account · 2-minute setup · No credit card needed
                    </p>
                  </div>
                  <Link href="/signup">
                    <button className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-orange-600 hover:bg-orange-50 transition-colors shadow-lg">
                      Create free account
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </Link>
                  <p className="text-xs text-orange-200">
                    Or{' '}
                    <Link href="/demo" className="underline hover:text-white">try the voice demo</Link>
                    {' '}·{' '}
                    <Link href="/demo/report" className="underline hover:text-white">see a sample parent report</Link>
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:py-24">
        <div className="text-center mb-12">
          <p className="text-sm font-semibold uppercase tracking-wider text-orange-500 mb-2">Coach Stories</p>
          <h2 className="text-2xl font-bold sm:text-3xl">Coaches love it. Parents share it.</h2>
          <p className="mt-3 text-zinc-500 max-w-lg mx-auto">
            What volunteer coaches say after their first season with SportsIQ.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            {
              quote: "I sent the first parent report and two families messaged me before I even left the parking lot. One mom said it was the most detailed update she'd ever gotten from any coach. I didn't write a single word — the AI pulled it from my voice notes.",
              name: 'Marcus T.',
              role: 'YMCA Basketball Coach · Chicago, IL',
              initials: 'MT',
              color: '#F97316',
            },
            {
              quote: "My 13-year-old had to show me how to press record. Now I use it every practice. The kids love the 'Player of the Week' moment — they all want to know who the AI picks. It's become our Friday ritual.",
              name: 'Sandra L.',
              role: 'Youth Soccer Coach · Austin, TX',
              initials: 'SL',
              color: '#3B82F6',
            },
            {
              quote: "Sunday-night planning used to take me an hour — trying to remember what went wrong Tuesday. Now I pull up my observations and hit Generate Plan. Done in 90 seconds and it's actually better than what I was writing.",
              name: 'Kevin M.',
              role: 'Flag Football Volunteer · Dallas, TX',
              initials: 'KM',
              color: '#10B981',
            },
          ].map((t) => (
            <Card key={t.name} className="p-6 bg-white border-zinc-200 text-zinc-900 flex flex-col hover:border-zinc-300 hover:shadow-md transition-all">
              <div className="flex gap-0.5 mb-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className="h-4 w-4 fill-orange-400 text-orange-400" />
                ))}
              </div>
              <blockquote className="text-sm text-zinc-700 leading-relaxed flex-1">
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <div className="mt-5 flex items-center gap-3 pt-5 border-t border-zinc-100">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ backgroundColor: t.color }}
                >
                  {t.initials}
                </div>
                <div>
                  <p className="text-sm font-semibold">{t.name}</p>
                  <p className="text-xs text-zinc-500">{t.role}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold sm:text-3xl">Simple, honest pricing</h2>
          <p className="mt-3 text-zinc-400">Start free. Upgrade when you&apos;re ready.</p>

          <div className="mt-6 flex items-center justify-center gap-3">
            <span className={`text-sm font-medium ${!annual ? 'text-zinc-900' : 'text-zinc-400'}`}>Monthly</span>
            <button
              onClick={() => setAnnual(!annual)}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${annual ? 'bg-orange-500' : 'bg-zinc-300'}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${annual ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <span className={`text-sm font-medium ${annual ? 'text-zinc-900' : 'text-zinc-400'}`}>Annual</span>
            {annual && <Badge className="ml-1 bg-emerald-100 text-emerald-700 border-emerald-200">Save 20%</Badge>}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Free */}
          <Card className="p-6 flex flex-col bg-white border-zinc-200 text-zinc-900">
            <h3 className="text-lg font-semibold">Free</h3>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-bold">$0</span>
              <span className="text-zinc-500 text-sm">/month</span>
            </div>
            <p className="mt-2 text-sm text-zinc-400">Perfect for trying it out</p>
            <ul className="mt-5 space-y-2.5 flex-1">
              {['1 team, 1 sport', '10 players per team', '5 AI observations/month', 'Basic practice plans'].map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-zinc-700">
                  <Check className="h-4 w-4 mt-0.5 text-zinc-400 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Button asChild variant="outline" className="mt-6 w-full border-zinc-300 text-zinc-700 hover:bg-zinc-100">
              <Link href="/signup">Get Started Free</Link>
            </Button>
          </Card>

          {/* Coach */}
          <Card className="p-6 flex flex-col bg-white border-2 border-orange-500 text-zinc-900 shadow-lg shadow-orange-500/10 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge>Most Popular</Badge>
            </div>
            <h3 className="text-lg font-semibold">Coach</h3>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-bold text-orange-500">${prices[1]}</span>
              <span className="text-zinc-500 text-sm">{period}</span>
            </div>
            <p className="mt-2 text-sm text-zinc-400">For individual coaches</p>
            <ul className="mt-5 space-y-2.5 flex-1">
              {['3 teams, 1 sport', 'Unlimited players', 'Unlimited AI observations', 'Practice plans & game sheets', 'Player report cards', 'Parent sharing portal'].map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-zinc-700">
                  <Check className="h-4 w-4 mt-0.5 text-orange-500 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Button asChild className="mt-6 w-full shadow-lg shadow-orange-500/25">
              <Link href="/signup?plan=coach">Start Coaching</Link>
            </Button>
          </Card>

          {/* Pro Coach */}
          <Card className="p-6 flex flex-col bg-white border-zinc-200 text-zinc-900">
            <h3 className="text-lg font-semibold">Pro Coach</h3>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-bold">${prices[2]}</span>
              <span className="text-zinc-500 text-sm">{period}</span>
            </div>
            <p className="mt-2 text-sm text-zinc-400">For serious coaches</p>
            <ul className="mt-5 space-y-2.5 flex-1">
              {['Unlimited teams & sports', 'Everything in Coach', 'AI Coach Assistant', 'Player analytics & trends', 'Session media upload', 'Custom AI prompts'].map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-zinc-700">
                  <Check className="h-4 w-4 mt-0.5 text-zinc-400 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Button asChild variant="outline" className="mt-6 w-full border-zinc-300 text-zinc-700 hover:bg-zinc-100">
              <Link href="/signup?plan=pro_coach">Go Pro</Link>
            </Button>
          </Card>

          {/* Organization */}
          <Card className="p-6 flex flex-col bg-white border-zinc-200 text-zinc-900">
            <h3 className="text-lg font-semibold">Organization</h3>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-bold">Custom</span>
            </div>
            <p className="mt-2 text-sm text-zinc-400">For leagues &amp; programs</p>
            <ul className="mt-5 space-y-2.5 flex-1">
              {['Everything in Pro Coach', 'Multi-coach collaboration', 'Program-wide analytics', 'Custom branding', 'Priority support'].map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-zinc-700">
                  <Check className="h-4 w-4 mt-0.5 text-zinc-400 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Button asChild variant="outline" className="mt-6 w-full border-zinc-300 text-zinc-700 hover:bg-zinc-100">
              <Link href="mailto:sales@youthsportsiq.com">Contact Us</Link>
            </Button>
          </Card>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="border-y border-zinc-200 bg-zinc-50/50 py-16 sm:py-20">
        <div className="mx-auto max-w-2xl px-4">
          <h2 className="text-2xl font-bold sm:text-3xl text-center mb-10">Frequently asked questions</h2>
          <div className="space-y-3">
            {[
              {
                q: 'Do I need to be tech-savvy?',
                a: 'Not at all. If you can press a record button and talk, you can use SportsIQ. There\'s nothing to configure or learn.',
              },
              {
                q: 'Does it work offline?',
                a: 'Yes. Recordings save locally on your device and sync automatically when you\'re back online. Perfect for gyms with spotty Wi-Fi.',
              },
              {
                q: 'Is my players\' data safe?',
                a: 'Absolutely. We\'re COPPA compliant, all data is encrypted in transit and at rest, and we never sell or share your information.',
              },
              {
                q: 'What sports do you support?',
                a: 'Basketball, soccer, flag football, and volleyball are fully supported with sport-specific observation templates, practice drills, and coaching cues. More sports are added regularly based on coach feedback.',
              },
              {
                q: 'Can I cancel anytime?',
                a: 'Yes, no contracts. Cancel from your account settings at any time. Your data stays available through the end of your billing period.',
              },
            ].map((faq, i) => (
              <button
                key={i}
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full text-left rounded-xl border border-zinc-200 bg-white p-5 hover:border-zinc-300 hover:shadow-sm transition-colors"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="font-medium text-sm">{faq.q}</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                </div>
                {openFaq === i && (
                  <p className="mt-3 text-sm text-zinc-600 leading-relaxed">{faq.a}</p>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Sports + Trust ── */}
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-4xl px-4">
          <div className="text-center mb-8">
            <p className="text-sm text-zinc-400 font-medium uppercase tracking-wider mb-4">Works with your sport</p>
            <div className="flex justify-center gap-6 flex-wrap">
              {[
                { emoji: '\u{1F3C0}', name: 'Basketball' },
                { emoji: '\u{1F3C8}', name: 'Flag Football' },
                { emoji: '\u26BD', name: 'Soccer' },
                { emoji: '\u{1F3D0}', name: 'Volleyball' },
              ].map((s) => (
                <div key={s.name} className="flex flex-col items-center gap-1.5">
                  <span className="text-3xl">{s.emoji}</span>
                  <span className="text-xs font-medium text-zinc-400">{s.name}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center gap-6 text-sm text-zinc-400 flex-wrap">
            <span className="flex items-center gap-1.5"><Shield className="h-4 w-4 text-emerald-500" /> COPPA Compliant</span>
            <span className="flex items-center gap-1.5"><Lock className="h-4 w-4 text-emerald-500" /> Encrypted</span>
            <span className="flex items-center gap-1.5"><WifiOff className="h-4 w-4 text-emerald-500" /> Works Offline</span>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="bg-gradient-to-t from-orange-100/50 via-orange-500/5 to-transparent py-16 sm:py-24">
        <div className="mx-auto max-w-2xl px-4 text-center">
          <h2 className="text-2xl font-bold sm:text-4xl">Start coaching smarter today</h2>
          <p className="mt-4 text-base sm:text-lg text-zinc-400">
            Join coaches who save hours every week with AI-powered practice planning and player tracking.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
            <Button asChild size="xl" className="shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all">
              <Link href="/signup">
                Create Free Account
                <ArrowRight className="ml-1.5 h-5 w-5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="xl" className="border-zinc-300 text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900">
              <Link href="/demo">Or try the demo first</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-zinc-200 py-8">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <p className="text-sm text-zinc-400">SportsIQ -- Coaching Intelligence Platform</p>
          <div className="mt-3 flex items-center justify-center gap-4 text-xs text-zinc-400 flex-wrap">
            <Link href="/privacy" className="hover:text-zinc-400 transition-colors">Privacy Policy</Link>
            <span>&middot;</span>
            <Link href="/terms" className="hover:text-zinc-400 transition-colors">Terms</Link>
            <span>&middot;</span>
            <Link href="/demo" className="hover:text-zinc-400 transition-colors">Contact</Link>
            <span>&middot;</span>
            <span className="flex items-center gap-1">
              <Shield className="h-3 w-3 text-emerald-500" />
              COPPA Compliant
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

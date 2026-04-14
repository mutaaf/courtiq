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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

export default function LandingContent() {
  const [annual, setAnnual] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const monthlyPrices = [0, 9.99, 24.99];
  const annualPrices = monthlyPrices.map((p) => +(p * 0.8).toFixed(2));
  const prices = annual ? annualPrices : monthlyPrices;
  const period = annual ? '/mo (billed yearly)' : '/month';

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-lg">
        <div className="flex items-center justify-between px-4 py-3 max-w-6xl mx-auto">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 p-1.5 shadow-lg shadow-orange-500/20">
              <Image src="/logo.svg" alt="SportsIQ" width={24} height={24} className="invert" />
            </div>
            <span className="font-bold text-lg">SportsIQ</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="hidden sm:inline-flex text-sm font-medium text-zinc-400 hover:text-zinc-100 transition-colors px-3 py-2">
              Sign in
            </Link>
            <Button asChild size="sm">
              <Link href="/demo">Try Free</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-orange-500/5 via-transparent to-transparent pointer-events-none" />
        <div className="relative flex flex-col items-center px-4 pt-12 pb-16 sm:pt-20 sm:pb-24 text-center max-w-3xl mx-auto">
          <Badge className="mb-6">Used by 50+ youth coaches across YMCA, AAU &amp; rec leagues</Badge>

          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl leading-[1.1]">
            Every player deserves a coach{' '}
            <span className="text-orange-500">who sees them.</span>
          </h1>

          <p className="mt-5 max-w-lg text-base sm:text-lg text-zinc-400 leading-relaxed">
            Voice-powered AI that turns your courtside observations into player development plans, progress reports, and smarter practices.
          </p>

          <div className="mt-8 flex flex-col gap-3 w-full sm:flex-row sm:justify-center sm:w-auto">
            <Button asChild size="xl" className="shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all">
              <Link href="/demo">
                Try it now — free
                <ArrowRight className="ml-1.5 h-5 w-5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="xl" className="border-zinc-700">
              <button onClick={() => scrollTo('how-it-works')}>
                Watch how it works
                <ChevronDown className="ml-1.5 h-4 w-4" />
              </button>
            </Button>
          </div>

          <p className="mt-4 text-xs text-zinc-500">20-second demo. No signup required.</p>
        </div>
      </section>

      {/* ── Problem Statement ── */}
      <section className="border-y border-zinc-800/50 bg-zinc-900/30 py-14 sm:py-20">
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
              <Card key={p.pain} className="p-6 text-center hover:border-zinc-700 transition-colors">
                <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500/10">
                  <p.icon className="h-5 w-5 text-orange-500" />
                </div>
                <p className="font-semibold text-sm text-orange-400 mb-2">{p.pain}</p>
                <p className="text-sm text-zinc-400 leading-relaxed">{p.detail}</p>
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
              ring: 'ring-orange-500/30 bg-orange-500/15',
              badge: 'bg-orange-500',
              iconColor: 'text-orange-500',
            },
            {
              step: '2',
              icon: Sparkles,
              color: 'blue',
              title: 'AI Analyzes',
              desc: 'Your words become per-player observations, sorted by skill, linked to your curriculum. Automatically.',
              ring: 'ring-blue-500/30 bg-blue-500/15',
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
              <p className="mt-2 text-sm text-zinc-400 leading-relaxed max-w-xs mx-auto">{s.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Button asChild size="lg">
            <Link href="/demo">
              See it in action
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* ── For Coaches ── */}
      <section className="border-y border-zinc-800/50 bg-zinc-900/30 py-16 sm:py-24">
        <div className="mx-auto max-w-4xl px-4">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold sm:text-3xl">Built for coaches like you</h2>
            <p className="mt-3 text-zinc-400">No tech skills. No coaching degree. Just better practices.</p>
          </div>

          {/* Testimonial */}
          <Card className="p-6 sm:p-8 mb-10 border-orange-500/20 bg-zinc-900/80">
            <blockquote className="text-base sm:text-lg text-zinc-200 leading-relaxed italic text-center">
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
              <div key={b.label} className="flex items-start gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 hover:border-zinc-700 transition-colors">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-500/10">
                  <b.icon className="h-5 w-5 text-orange-500" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{b.label}</p>
                  <p className="text-sm text-zinc-400 mt-0.5">{b.desc}</p>
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
          <p className="mt-3 text-zinc-400 max-w-lg mx-auto">
            SportsIQ gives you visibility across every team, every coach, every player in your organization.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: ClipboardList, label: 'Curriculum compliance', desc: 'Ensure all coaches follow your development framework.' },
            { icon: Users, label: 'Coach engagement', desc: 'See which coaches are actively recording and tracking.' },
            { icon: BarChart3, label: 'Standardized reporting', desc: 'Consistent progress reports across your entire program.' },
          ].map((b) => (
            <Card key={b.label} className="p-6 text-center hover:border-zinc-700 transition-colors">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10">
                <b.icon className="h-5 w-5 text-emerald-500" />
              </div>
              <p className="font-semibold text-sm">{b.label}</p>
              <p className="text-sm text-zinc-400 mt-1">{b.desc}</p>
            </Card>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Button asChild variant="outline" size="lg">
            <Link href="/demo">Schedule a Demo</Link>
          </Button>
        </div>
      </section>

      {/* ── Demo Preview ── */}
      <section className="border-y border-zinc-800/50 bg-zinc-900/30 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-2xl font-bold sm:text-3xl mb-4">See it in action</h2>
          <p className="text-zinc-400 mb-8">Try the live recording demo. 20 seconds, no account needed.</p>

          <Card className="p-8 sm:p-10 border-orange-500/20 hover:border-orange-500/40 transition-colors">
            <div className="flex flex-col items-center gap-5">
              <div className="relative">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-orange-500/15 ring-2 ring-orange-500/30">
                  <Mic className="h-10 w-10 text-orange-500" />
                </div>
                <span className="absolute -top-1 -right-1 flex h-5 w-5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-40" />
                  <span className="relative inline-flex rounded-full h-5 w-5 bg-orange-500" />
                </span>
              </div>
              <p className="text-sm text-zinc-400 max-w-sm">
                &ldquo;Hit record, coach like normal, and let AI turn your words into organized player notes.&rdquo;
              </p>
              <Button asChild size="lg" className="shadow-lg shadow-orange-500/25">
                <Link href="/demo">
                  Try it yourself — no signup
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </Card>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold sm:text-3xl">Simple, honest pricing</h2>
          <p className="mt-3 text-zinc-400">Start free. Upgrade when you&apos;re ready.</p>

          <div className="mt-6 flex items-center justify-center gap-3">
            <span className={`text-sm font-medium ${!annual ? 'text-zinc-100' : 'text-zinc-500'}`}>Monthly</span>
            <button
              onClick={() => setAnnual(!annual)}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${annual ? 'bg-orange-500' : 'bg-zinc-700'}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${annual ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <span className={`text-sm font-medium ${annual ? 'text-zinc-100' : 'text-zinc-500'}`}>Annual</span>
            {annual && <Badge variant="success" className="ml-1">Save 20%</Badge>}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Free */}
          <Card className="p-6 flex flex-col">
            <h3 className="text-lg font-semibold">Free</h3>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-bold">$0</span>
              <span className="text-zinc-500 text-sm">/month</span>
            </div>
            <p className="mt-2 text-sm text-zinc-400">Perfect for trying it out</p>
            <ul className="mt-5 space-y-2.5 flex-1">
              {['1 team, 1 sport', '10 players per team', '5 AI observations/month', 'Basic practice plans'].map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-zinc-300">
                  <Check className="h-4 w-4 mt-0.5 text-zinc-500 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Button asChild variant="outline" className="mt-6 w-full">
              <Link href="/signup">Get Started Free</Link>
            </Button>
          </Card>

          {/* Coach */}
          <Card className="p-6 flex flex-col border-2 border-orange-500 relative">
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
                <li key={f} className="flex items-start gap-2 text-sm text-zinc-300">
                  <Check className="h-4 w-4 mt-0.5 text-orange-500 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Button asChild className="mt-6 w-full shadow-lg shadow-orange-500/25">
              <Link href="/signup">Start Coaching</Link>
            </Button>
          </Card>

          {/* Pro Coach */}
          <Card className="p-6 flex flex-col">
            <h3 className="text-lg font-semibold">Pro Coach</h3>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-bold">${prices[2]}</span>
              <span className="text-zinc-500 text-sm">{period}</span>
            </div>
            <p className="mt-2 text-sm text-zinc-400">For serious coaches</p>
            <ul className="mt-5 space-y-2.5 flex-1">
              {['Unlimited teams & sports', 'Everything in Coach', 'AI Coach Assistant', 'Player analytics & trends', 'Session media upload', 'Custom AI prompts'].map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-zinc-300">
                  <Check className="h-4 w-4 mt-0.5 text-zinc-500 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Button asChild variant="outline" className="mt-6 w-full">
              <Link href="/signup">Go Pro</Link>
            </Button>
          </Card>

          {/* Organization */}
          <Card className="p-6 flex flex-col">
            <h3 className="text-lg font-semibold">Organization</h3>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-bold">Custom</span>
            </div>
            <p className="mt-2 text-sm text-zinc-400">For leagues &amp; programs</p>
            <ul className="mt-5 space-y-2.5 flex-1">
              {['Everything in Pro Coach', 'Multi-coach collaboration', 'Program-wide analytics', 'Custom branding', 'Priority support'].map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-zinc-300">
                  <Check className="h-4 w-4 mt-0.5 text-zinc-500 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Button asChild variant="outline" className="mt-6 w-full">
              <Link href="/demo">Contact Us</Link>
            </Button>
          </Card>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="border-y border-zinc-800/50 bg-zinc-900/30 py-16 sm:py-20">
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
                a: 'Basketball, flag football, and soccer are fully supported today. More sports are added regularly based on coach feedback.',
              },
              {
                q: 'Can I cancel anytime?',
                a: 'Yes, no contracts. Cancel from your account settings at any time. Your data stays available through the end of your billing period.',
              },
            ].map((faq, i) => (
              <button
                key={i}
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="font-medium text-sm">{faq.q}</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                </div>
                {openFaq === i && (
                  <p className="mt-3 text-sm text-zinc-400 leading-relaxed">{faq.a}</p>
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
            <p className="text-sm text-zinc-500 font-medium uppercase tracking-wider mb-4">Works with your sport</p>
            <div className="flex justify-center gap-8">
              {[
                { emoji: '\u{1F3C0}', name: 'Basketball' },
                { emoji: '\u{1F3C8}', name: 'Flag Football' },
                { emoji: '\u26BD', name: 'Soccer' },
              ].map((s) => (
                <div key={s.name} className="flex flex-col items-center gap-1.5">
                  <span className="text-3xl">{s.emoji}</span>
                  <span className="text-xs font-medium text-zinc-400">{s.name}</span>
                </div>
              ))}
              <div className="flex flex-col items-center gap-1.5 opacity-50">
                <span className="text-3xl">+</span>
                <span className="text-xs font-medium text-zinc-500">More coming</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-6 text-sm text-zinc-500 flex-wrap">
            <span className="flex items-center gap-1.5"><Shield className="h-4 w-4 text-emerald-500" /> COPPA Compliant</span>
            <span className="flex items-center gap-1.5"><Lock className="h-4 w-4 text-emerald-500" /> Encrypted</span>
            <span className="flex items-center gap-1.5"><WifiOff className="h-4 w-4 text-emerald-500" /> Works Offline</span>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="bg-gradient-to-t from-orange-500/10 via-orange-500/5 to-transparent py-16 sm:py-24">
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
            <Button asChild variant="outline" size="xl" className="border-zinc-700">
              <Link href="/demo">Or try the demo first</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-zinc-800 py-8">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <p className="text-sm text-zinc-500">SportsIQ -- Coaching Intelligence Platform</p>
          <div className="mt-3 flex items-center justify-center gap-4 text-xs text-zinc-600 flex-wrap">
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

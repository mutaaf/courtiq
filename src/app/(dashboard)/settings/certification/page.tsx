'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Award,
  Share2,
  Copy,
  Check,
  Lock,
  Star,
} from 'lucide-react';
import Link from 'next/link';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CriterionResult {
  key: string;
  label: string;
  description: string;
  count: number;
  required: number;
  met: boolean;
}

interface CertificationData {
  earned: boolean;
  earnedAt: string | null;
  coachName: string;
  criteria: CriterionResult[];
}

// ─── Badge SVG ────────────────────────────────────────────────────────────────

function CertBadge({ earned, coachName }: { earned: boolean; coachName: string }) {
  return (
    <div
      className={`relative mx-auto flex flex-col items-center justify-center rounded-2xl border-2 p-8 text-center transition-all ${
        earned
          ? 'border-amber-400/60 bg-gradient-to-b from-amber-500/15 via-orange-500/10 to-transparent shadow-[0_0_40px_rgba(251,191,36,0.15)]'
          : 'border-zinc-700 bg-zinc-900/50'
      }`}
      style={{ maxWidth: 340 }}
    >
      {/* Outer ring decoration */}
      <div
        className={`absolute inset-4 rounded-xl border ${
          earned ? 'border-amber-400/20' : 'border-zinc-800'
        }`}
      />

      {/* Icon */}
      <div
        className={`relative z-10 flex h-20 w-20 items-center justify-center rounded-full border-2 ${
          earned
            ? 'border-amber-400/50 bg-amber-500/20 shadow-[0_0_20px_rgba(251,191,36,0.3)]'
            : 'border-zinc-700 bg-zinc-800'
        }`}
      >
        {earned ? (
          <Award className="h-10 w-10 text-amber-400" />
        ) : (
          <Lock className="h-8 w-8 text-zinc-600" />
        )}
      </div>

      {/* Stars (earned only) */}
      {earned && (
        <div className="relative z-10 mt-3 flex items-center gap-1">
          {[...Array(5)].map((_, i) => (
            <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />
          ))}
        </div>
      )}

      {/* Title */}
      <div className="relative z-10 mt-3 space-y-1">
        <p
          className={`text-xs font-semibold uppercase tracking-widest ${
            earned ? 'text-amber-400/80' : 'text-zinc-600'
          }`}
        >
          SportsIQ
        </p>
        <p
          className={`text-xl font-bold ${
            earned ? 'text-amber-100' : 'text-zinc-500'
          }`}
        >
          Certified Coach
        </p>
        {earned && coachName && (
          <p className="text-sm text-zinc-300 mt-1">{coachName}</p>
        )}
      </div>

      {/* Divider */}
      <div
        className={`relative z-10 mt-4 h-px w-24 ${
          earned ? 'bg-amber-400/30' : 'bg-zinc-800'
        }`}
      />

      {/* Tagline */}
      <p
        className={`relative z-10 mt-4 text-xs leading-relaxed ${
          earned ? 'text-zinc-300' : 'text-zinc-600'
        }`}
      >
        {earned
          ? 'Excellence in player development & data-driven coaching'
          : 'Complete all criteria to earn this badge'}
      </p>
    </div>
  );
}

// ─── Criterion row ────────────────────────────────────────────────────────────

function CriterionRow({ criterion }: { criterion: CriterionResult }) {
  const pct = Math.min(100, Math.round((criterion.count / criterion.required) * 100));

  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 shrink-0">
        {criterion.met ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
        ) : (
          <Circle className="h-5 w-5 text-zinc-600" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className={`text-sm font-medium ${criterion.met ? 'text-zinc-200' : 'text-zinc-400'}`}>
            {criterion.label}
          </p>
          <span className="text-xs text-zinc-500 shrink-0">
            {criterion.count.toLocaleString()}/{criterion.required}
          </span>
        </div>
        <p className="text-xs text-zinc-500 mt-0.5">{criterion.description}</p>
        {!criterion.met && (
          <div className="mt-2 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-orange-500 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CertificationPage() {
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery<CertificationData>({
    queryKey: ['certifications'],
    queryFn: async () => {
      const res = await fetch('/api/certifications');
      if (!res.ok) throw new Error('Failed to load certification data');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const metCount = data?.criteria.filter((c) => c.met).length ?? 0;
  const totalCount = data?.criteria.length ?? 4;

  function buildShareText() {
    if (!data) return '';
    const earnedDate = data.earnedAt
      ? new Date(data.earnedAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : '';
    return [
      `I earned the SportsIQ Certified Coach badge${earnedDate ? ` in ${earnedDate}` : ''}!`,
      '',
      'What it took:',
      ...data.criteria.map((c) => `✅ ${c.label}`),
      '',
      'SportsIQ helps me track player development with AI-powered observations and practice plans.',
      'Join me: https://sportsiq.app',
    ].join('\n');
  }

  function handleCopy() {
    navigator.clipboard.writeText(buildShareText()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleNativeShare() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({
        title: 'SportsIQ Certified Coach',
        text: buildShareText(),
      });
    } else {
      handleCopy();
    }
  }

  return (
    <div className="p-4 lg:p-8 space-y-6 pb-8 max-w-xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/settings">
          <Button variant="ghost" size="icon" aria-label="Back to settings">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Certified Coach Badge</h1>
          <p className="text-zinc-400 text-sm">Earn your badge by hitting key coaching milestones</p>
        </div>
      </div>

      {/* Badge visual */}
      {isLoading ? (
        <Skeleton className="h-72 w-full max-w-sm mx-auto rounded-2xl" />
      ) : (
        <CertBadge earned={data?.earned ?? false} coachName={data?.coachName ?? ''} />
      )}

      {/* Earned date */}
      {data?.earned && data.earnedAt && (
        <p className="text-center text-xs text-amber-400/70">
          Earned on{' '}
          {new Date(data.earnedAt).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
      )}

      {/* Share buttons (earned only) */}
      {data?.earned && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-medium text-amber-300">Share your achievement</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={handleCopy}
                variant="outline"
                className="h-12 gap-2 border-amber-500/30 hover:border-amber-500/50"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Copy className="h-4 w-4 text-amber-400" />
                )}
                <span className="text-sm">{copied ? 'Copied!' : 'Copy text'}</span>
              </Button>
              <Button
                onClick={handleNativeShare}
                className="h-12 gap-2 bg-amber-500 hover:bg-amber-600 text-zinc-950 font-semibold"
              >
                <Share2 className="h-4 w-4" />
                <span className="text-sm">Share</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Criteria checklist */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Certification criteria</span>
            {!isLoading && (
              <span
                className={`text-sm font-normal ${
                  metCount === totalCount ? 'text-emerald-400' : 'text-zinc-500'
                }`}
              >
                {metCount}/{totalCount} complete
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <>
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </>
          ) : (
            data?.criteria.map((criterion) => (
              <CriterionRow key={criterion.key} criterion={criterion} />
            ))
          )}
        </CardContent>
      </Card>

      {/* Info footer */}
      <Card className="border-zinc-800/50">
        <CardContent className="p-4 space-y-2">
          <p className="text-xs font-medium text-zinc-400">About this badge</p>
          <p className="text-xs text-zinc-500 leading-relaxed">
            The SportsIQ Certified Coach badge recognises coaches who consistently use data-driven
            approaches to player development. Complete all four criteria to automatically unlock your
            badge and share it with your community.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

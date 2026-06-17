'use client';

/**
 * Ticket 0087 — read-only preview of the Organization plan for a director
 * on a free-tier program with 3+ active paying coaches.
 *
 * The page renders a banner across the top ("Preview — Organization plan")
 * and a CTA at the bottom that routes through Stripe with
 * `?resume=adopt_org_tier:<orgId>`. The 0035 resume primitive's new
 * `adopt_org_tier` kind lands the director back on /admin once Stripe
 * flips the org tier.
 *
 * The body lists what Organization plan unlocks — leaning on the existing
 * `<UpgradeGate>` benefit copy for the `multi_coach`, `org_analytics`,
 * and `custom_branding` features so the preview stays in sync with the
 * canonical benefit-list source of truth.
 *
 * Director-only: rendered behind `coach.role === 'admin'` (the existing
 * admin gate; non-admins are redirected to /home).
 */
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';
import { useActiveTeam } from '@/hooks/use-active-team';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ArrowRight, Building2, Check, Eye } from 'lucide-react';
import { FEATURE_CONFIG } from '@/components/ui/upgrade-gate';

const ORG_FEATURE_KEYS = [
  'multi_coach',
  'org_analytics',
  'custom_branding',
  'feature_program_pulse',
  'feature_program_focus',
] as const;

export default function PreviewOrganizationPage() {
  const router = useRouter();
  const { coach } = useActiveTeam();
  const isAdmin = coach?.role === 'admin';
  const orgId = coach?.org_id;

  // A non-admin should never land here. Redirect to /home with a soft
  // bounce; the admin role check on the API side is the load-bearing gate
  // (this client check is defense-in-depth).
  useEffect(() => {
    if (coach && !isAdmin) {
      router.replace('/home');
    }
  }, [coach, isAdmin, router]);

  if (!isAdmin) {
    return null;
  }

  const adoptResume = orgId ? `adopt_org_tier:${orgId}` : '';
  const upgradeHref = orgId
    ? `/settings/upgrade?intent=organization&resume=${encodeURIComponent(adoptResume)}`
    : '/settings/upgrade?intent=organization';

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 lg:p-8 pb-12">
      {/* Banner */}
      <div className="rounded-2xl border border-orange-500/30 bg-orange-500/5 px-5 py-4 flex items-start gap-3">
        <Eye className="h-5 w-5 text-orange-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-500">
            Preview — Organization plan
          </p>
          <p className="text-sm text-zinc-300 mt-1 leading-snug">
            A read-only walk-through of what your director surface looks like
            once your program is on the Organization plan. Nothing here writes
            to your data.
          </p>
        </div>
        <Link href="/admin" aria-label="Back to admin home">
          <Button variant="ghost" size="icon" className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Building2 className="h-7 w-7 text-orange-500" />
          Organization plan, on your program
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          $49.99/mo — one roster, one billing line, the staff under one roof.
        </p>
      </div>

      {/* What Organization unlocks */}
      {ORG_FEATURE_KEYS.map((key) => {
        const cfg = FEATURE_CONFIG[key];
        if (!cfg) return null;
        const Icon = cfg.icon;
        return (
          <Card key={key}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Icon className={`h-4 w-4 ${cfg.accentColor}`} />
                {cfg.headline.replace(/^Unlock\s+/, '')}
                <Badge variant="outline" className="ml-auto text-xs border-orange-500/30 text-orange-400">
                  Preview
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-zinc-400 leading-relaxed">{cfg.tagline}</p>
              <ul className="space-y-2 mt-2">
                {cfg.benefits.slice(0, 3).map((b) => (
                  <li key={b} className="flex items-start gap-2 text-sm text-zinc-300">
                    <Check className={`mt-0.5 h-4 w-4 shrink-0 ${cfg.accentColor}`} />
                    {b}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}

      {/* CTA */}
      <Card className="border-orange-500/30 bg-orange-500/5">
        <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="font-semibold text-zinc-100">Ready to bring the program under one plan?</p>
            <p className="text-xs text-zinc-400 mt-1">
              $49.99/mo on Organization. Cancel anytime.
            </p>
          </div>
          <Link href={upgradeHref} className="shrink-0">
            <Button
              data-testid="preview-organization-upgrade-cta"
              className="bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20 active:scale-[0.98] transition-all"
            >
              Upgrade to Organization
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

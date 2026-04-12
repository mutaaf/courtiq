'use client';
import { useTier } from '@/hooks/use-tier';
import { Card, CardContent } from './card';
import { Button } from './button';
import { Lock } from 'lucide-react';
import Link from 'next/link';

export function UpgradeGate({ feature, children, featureLabel }: {
  feature: string;
  children: React.ReactNode;
  featureLabel?: string;
}) {
  const { canAccess, tier } = useTier();

  if (canAccess(feature)) return <>{children}</>;

  return (
    <div className="flex items-center justify-center p-8">
      <Card className="max-w-md text-center">
        <CardContent className="p-8">
          <Lock className="mx-auto h-10 w-10 text-zinc-600 mb-4" />
          <h3 className="text-lg font-semibold">{featureLabel || 'Premium Feature'}</h3>
          <p className="text-sm text-zinc-400 mt-2">
            This feature requires a higher plan. Upgrade to unlock {featureLabel?.toLowerCase() || 'this feature'}.
          </p>
          <p className="text-xs text-zinc-500 mt-1">Current plan: <span className="capitalize text-orange-400">{tier.replace('_', ' ')}</span></p>
          <Link href="/settings/upgrade">
            <Button className="mt-4">View Plans</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

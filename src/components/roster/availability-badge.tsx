'use client';

import { cn } from '@/lib/utils';
import type { AvailabilityStatus } from '@/types/database';
import { Activity, AlertTriangle, Ban, Heart, Minus } from 'lucide-react';

export const AVAILABILITY_CONFIG: Record<
  AvailabilityStatus,
  { label: string; color: string; bg: string; border: string; icon: React.ComponentType<{ className?: string }> }
> = {
  available: {
    label: 'Available',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/15',
    border: 'border-emerald-500/30',
    icon: Activity,
  },
  limited: {
    label: 'Limited',
    color: 'text-amber-400',
    bg: 'bg-amber-500/15',
    border: 'border-amber-500/30',
    icon: Minus,
  },
  injured: {
    label: 'Injured',
    color: 'text-red-400',
    bg: 'bg-red-500/15',
    border: 'border-red-500/30',
    icon: AlertTriangle,
  },
  sick: {
    label: 'Sick',
    color: 'text-blue-400',
    bg: 'bg-blue-500/15',
    border: 'border-blue-500/30',
    icon: Heart,
  },
  unavailable: {
    label: 'Unavailable',
    color: 'text-zinc-400',
    bg: 'bg-zinc-500/15',
    border: 'border-zinc-500/30',
    icon: Ban,
  },
};

interface AvailabilityBadgeProps {
  status: AvailabilityStatus;
  /** 'sm' = icon + short label (default), 'dot' = coloured dot only */
  size?: 'sm' | 'dot';
  className?: string;
}

export function AvailabilityBadge({ status, size = 'sm', className }: AvailabilityBadgeProps) {
  const cfg = AVAILABILITY_CONFIG[status];
  const Icon = cfg.icon;

  if (size === 'dot') {
    return (
      <span
        className={cn('inline-block h-2.5 w-2.5 rounded-full', cfg.bg.replace('/15', ''), className)}
        title={cfg.label}
        aria-label={cfg.label}
      />
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
        cfg.bg,
        cfg.border,
        cfg.color,
        className,
      )}
      aria-label={`Player status: ${cfg.label}`}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

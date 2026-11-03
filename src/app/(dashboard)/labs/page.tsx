import Link from 'next/link';
import { FlaskConical, PenLine } from 'lucide-react';
import { Card } from '@/components/ui/card';

export const metadata = { title: 'Labs' };

// Labs: tools we're trying with coaches before they become part of CourtIQ proper.
export default function LabsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:py-8">
      <div className="mb-6 flex items-center gap-3">
        <FlaskConical className="h-6 w-6 text-orange-500" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-zinc-100">Labs</h1>
      </div>
      <p className="mb-6 text-sm text-zinc-400">
        Experiments we&apos;re trying with coaches. They may change or go away; tell us what works.
      </p>

      <Card className="p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-orange-500/10">
            <PenLine className="h-5 w-5 text-orange-500" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-zinc-100">Chalk Talk</h2>
              <span className="rounded-full border border-orange-500/40 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-orange-400">
                Experimental
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-400">
              Say a play out loud, or sketch it, and watch it draw as X&apos;s and O&apos;s. Basketball and flag
              football, with a concept library you can show your team.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/labs/chalk-talk"
                className="inline-flex h-9 items-center rounded-md bg-orange-500 px-4 text-sm font-medium text-zinc-950 hover:bg-orange-600"
              >
                Open Chalk Talk
              </Link>
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              Plays from your own words use your own Claude or OpenAI key, which stays in this browser.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

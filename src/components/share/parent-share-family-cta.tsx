'use client';

import { useState } from 'react';
import { Share2, Check, Heart } from 'lucide-react';

interface Props {
  playerFirstName: string;
  coachName: string | null;
  teamName: string | null | undefined;
  improvingSkillNames: string[];
  recentObsCount: number;
  totalObsCount: number;
  shareToken: string;
  featuredQuote?: string | null;
}

export function ParentShareFamilyCTA({
  playerFirstName,
  coachName,
  teamName,
  improvingSkillNames,
  recentObsCount,
  totalObsCount,
  shareToken,
  featuredQuote,
}: Props) {
  const [shared, setShared] = useState(false);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sportsiq.app';
  const portalUrl = `${appUrl}/share/${shareToken}`;

  function buildShareText(): string {
    const lines: string[] = [];

    lines.push(`🏅 Check out ${playerFirstName}'s progress this season!`);

    if (teamName && coachName) {
      const first = coachName.split(' ')[0];
      lines.push(`Coach ${first} from ${teamName} has been tracking their development all season.`);
    } else if (coachName) {
      const first = coachName.split(' ')[0];
      lines.push(`Coach ${first} has been tracking their development all season.`);
    }

    lines.push('');

    if (improvingSkillNames.length > 0) {
      const skills = improvingSkillNames.slice(0, 2).join(' & ');
      lines.push(`📈 Improving in: ${skills}`);
    }

    const obsLabel =
      recentObsCount > 0
        ? `${recentObsCount} coaching notes this fortnight`
        : totalObsCount > 0
        ? `${totalObsCount} coaching notes this season`
        : null;

    if (obsLabel) lines.push(`👀 ${obsLabel}`);

    if (featuredQuote) {
      lines.push('');
      lines.push(`Coach says: "${featuredQuote.slice(0, 120)}${featuredQuote.length > 120 ? '…' : ''}"`);
    }

    lines.push('');
    lines.push(`See the full report → ${portalUrl}`);

    return lines.join('\n');
  }

  async function handleShare() {
    const text = buildShareText();
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: `${playerFirstName}'s Progress Report`,
          text,
          url: portalUrl,
        });
      } else {
        await navigator.clipboard.writeText(text);
      }
      setShared(true);
      setTimeout(() => setShared(false), 3000);
    } catch {
      // user cancelled or clipboard blocked — silent no-op
    }
  }

  return (
    <div className="rounded-2xl border border-pink-200 bg-gradient-to-br from-pink-50 to-white p-5 shadow-sm">
      <div className="flex items-start gap-3 mb-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pink-100">
          <Heart className="h-4 w-4 text-pink-500" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900 leading-snug">
            Proud of {playerFirstName}?
          </p>
          <p className="mt-1 text-xs text-gray-500 leading-relaxed">
            Share their progress report with grandparents, family &amp; friends — one tap.
          </p>
        </div>
      </div>

      <button
        onClick={handleShare}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-pink-500 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-pink-600 active:scale-[0.98] transition-all touch-manipulation"
        aria-label={`Share ${playerFirstName}'s progress report with family`}
      >
        {shared ? (
          <>
            <Check className="h-4 w-4" aria-hidden="true" />
            <span>{'share' in (typeof navigator !== 'undefined' ? navigator : {}) ? 'Shared!' : 'Link copied!'}</span>
          </>
        ) : (
          <>
            <Share2 className="h-4 w-4" aria-hidden="true" />
            Share {playerFirstName}&apos;s progress with family
          </>
        )}
      </button>
    </div>
  );
}

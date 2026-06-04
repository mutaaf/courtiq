'use client';

// Ticket 0067 — the rendered body of /sub/[token]. Extracted from the page
// client component so the AC's per-section render + omission cases can be
// unit-tested with plain prop fixtures (LESSONS#0060 pattern).
//
// The aesthetic is the PARENT-PORTAL gray + orange — NOT the dark coach
// theme. Large readable type. Generous spacing. No emoji-decorated section
// headings; no "AI-generic" copy. Voice is the regular coach's clipboard.

interface DrillBlock {
  drillName: string;
  setupLines: string[];
  coachNote?: string;
}

interface EyesPlayer {
  firstName: string;
  oneLineWatch: string;
}

export interface SubHandoffPayload {
  sessionDate: string;
  teamName: string;
  ageGroup: string;
  sportName: string | null;
  subFirstName: string | null;
  expiresAt: string | null;
  token?: string;
  weeklyFocusLine?: string;
  queuedDrills?: DrillBlock[];
  eyesOnPlayers?: EyesPlayer[];
}

function formatSessionDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  } catch {
    return iso;
  }
}

export function SubHandoffPageBody({ payload }: { payload: SubHandoffPayload }) {
  const subName = payload.subFirstName?.trim() || 'Coach';
  const sessionLine = `${formatSessionDate(payload.sessionDate)} — ${payload.teamName}`;

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 text-gray-900">
      <header className="mb-6">
        <p className="text-sm uppercase tracking-wider text-orange-600">
          Tonight&apos;s practice
        </p>
        <h1
          data-testid="sub-handoff-h1"
          className="mt-1 text-3xl font-semibold leading-tight"
        >
          {sessionLine}. Thanks for stepping in, {subName}.
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          {payload.sportName ? `${payload.sportName} · ` : ''}
          {payload.ageGroup}
        </p>
      </header>

      {payload.weeklyFocusLine ? (
        <section
          data-testid="sub-handoff-focus"
          className="mb-6 rounded-xl border border-orange-300 bg-orange-50 p-4"
        >
          <h2 className="text-xs font-semibold uppercase tracking-wider text-orange-700">
            What we&apos;re working on this week
          </h2>
          <p className="mt-1 text-base font-medium text-gray-900">
            {payload.weeklyFocusLine}
          </p>
        </section>
      ) : null}

      {payload.queuedDrills && payload.queuedDrills.length > 0 ? (
        <section
          data-testid="sub-handoff-drills"
          className="mb-6 rounded-xl border border-gray-200 bg-white p-4"
        >
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">
            Drills queued for tonight
          </h2>
          <ol className="mt-3 space-y-4">
            {payload.queuedDrills.map((d, i) => (
              <li key={`${d.drillName}-${i}`} className="space-y-1">
                <p className="text-base font-semibold text-gray-900">{d.drillName}</p>
                {d.setupLines.length > 0 ? (
                  <ul className="ml-4 list-disc space-y-0.5 text-sm text-gray-700">
                    {d.setupLines.map((line, j) => (
                      <li key={j}>{line}</li>
                    ))}
                  </ul>
                ) : null}
                {d.coachNote ? (
                  <p className="mt-1 rounded-md bg-gray-50 px-3 py-2 text-sm italic text-gray-700">
                    Note from the regular coach: {d.coachNote}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {payload.eyesOnPlayers && payload.eyesOnPlayers.length > 0 ? (
        <section
          data-testid="sub-handoff-eyes"
          className="mb-6 rounded-xl border border-gray-200 bg-white p-4"
        >
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">
            Two kids to give extra eyes to tonight
          </h2>
          <ul className="mt-2 space-y-2 text-sm text-gray-800">
            {payload.eyesOnPlayers.map((p, i) => (
              <li key={`${p.firstName}-${i}`}>
                <span className="font-semibold text-gray-900">{p.firstName}</span>
                {' — '}
                <span>{p.oneLineWatch}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

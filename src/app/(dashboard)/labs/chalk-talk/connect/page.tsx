'use client';

import { useEffect, useState } from 'react';

// mutaafaziz.com/chalktalk → "Use my CourtIQ AI" lands here (signed in by the dashboard layout), gets a link
// token and goes straight back to the board, which now uses this coach's Chalk Talk AI.
export default function ConnectChalkTalk() {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/labs/chalk-talk/link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ return: new URLSearchParams(window.location.search).get('return') }) })
      .then((r) => r.json())
      .then((j) => { if (j.url) window.location.replace(j.url); else setError(j.error || 'Couldn’t connect.'); })
      .catch(() => setError('Couldn’t connect.'));
  }, []);
  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <p className="text-lg font-semibold text-zinc-100">{error ? 'That didn’t work' : 'Connecting your Chalk Talk board…'}</p>
      <p className="mt-2 text-sm text-zinc-400">{error || 'You’ll be back on the board in a second, with your CourtIQ AI.'}</p>
    </div>
  );
}

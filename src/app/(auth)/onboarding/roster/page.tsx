'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, X, Loader2, AlertCircle, Users, ListChecks, Sparkles, ArrowRight } from 'lucide-react';
import { trackEvent } from '@/lib/analytics';

type ImportMode = 'one-by-one' | 'paste';

interface PlayerRow {
  name: string;
  pronunciation: string;
}

export default function RosterSetupPage() {
  const router = useRouter();
  const [mode, setMode] = useState<ImportMode>('one-by-one');

  // One-by-one mode state — name + optional "say it like" hint
  const [players, setPlayers] = useState<PlayerRow[]>([
    { name: '', pronunciation: '' },
    { name: '', pronunciation: '' },
    { name: '', pronunciation: '' },
  ]);

  // Paste mode state
  const [pasteText, setPasteText] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function addRow() { setPlayers([...players, { name: '', pronunciation: '' }]); }
  function removeRow(i: number) { setPlayers(players.filter((_, j) => j !== i)); }
  function updateName(i: number, val: string) {
    setPlayers(players.map((p, j) => j === i ? { ...p, name: val } : p));
  }
  function updatePron(i: number, val: string) {
    setPlayers(players.map((p, j) => j === i ? { ...p, pronunciation: val } : p));
  }

  const parsedPasteNames = pasteText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length >= 2 && l.length <= 60);

  async function save(
    rows: { name: string; name_variants?: string[] }[],
    mode: 'one-by-one' | 'paste' | 'skip',
  ) {
    setLoading(true);
    setError('');

    try {
      if (rows.length > 0) {
        const res = await fetch('/api/auth/add-players', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ players: rows }),
        });

        if (!res.ok) {
          const data = await res.json();
          setError(data.error || 'Failed to add players');
          setLoading(false);
          return;
        }
      }

      const withPronunciation = rows.filter((r) => r.name_variants && r.name_variants.length > 0).length;
      trackEvent('onboarding_roster_submitted', {
        mode,
        count: rows.length,
        with_pronunciation: withPronunciation,
      });

      router.push('/onboarding/first-capture');
    } catch {
      setError('Something went wrong');
      setLoading(false);
    }
  }

  function handleOneByOneSave() {
    const rows = players
      .filter((p) => p.name.trim())
      .map((p) => {
        const name_variants = p.pronunciation.trim()
          ? p.pronunciation.split(',').map((v) => v.trim()).filter(Boolean).slice(0, 5)
          : undefined;
        return { name: p.name.trim(), name_variants };
      });
    save(rows, 'one-by-one');
  }

  function handlePasteSave() {
    if (parsedPasteNames.length === 0) {
      setError('Enter at least one player name (one per line).');
      return;
    }
    save(parsedPasteNames.map((name) => ({ name })), 'paste');
  }

  function handleSkip() {
    trackEvent('onboarding_roster_submitted', { mode: 'skip', count: 0, with_pronunciation: 0 });
    router.push('/onboarding/first-capture');
  }

  async function handleSamplePlayers() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/add-players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sample: true }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to add sample players');
        setLoading(false);
        return;
      }
      trackEvent('onboarding_roster_submitted', {
        mode: 'sample',
        count: 8,
        with_pronunciation: 0,
      });
      router.push('/onboarding/first-capture');
    } catch {
      setError('Something went wrong');
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Add your players</CardTitle>
          <p className="text-sm text-zinc-400">You can always add more later</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Promoted skip / sample CTAs — surface the easy paths first so coaches
              who don't have a roster handy aren't blocked. */}
          <div className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <button
              onClick={handleSamplePlayers}
              disabled={loading}
              className="flex items-center gap-3 rounded-lg bg-orange-500/10 border border-orange-500/30 p-3 text-left hover:bg-orange-500/20 transition-colors disabled:opacity-60 touch-manipulation"
            >
              <Sparkles className="h-5 w-5 text-orange-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-100">Try with sample players</p>
                <p className="text-xs text-zinc-400">8 fictional players — perfect for testing the app first.</p>
              </div>
              <ArrowRight className="h-4 w-4 text-zinc-500 shrink-0" />
            </button>
            <button
              onClick={handleSkip}
              disabled={loading}
              className="text-xs text-zinc-500 hover:text-zinc-300 underline-offset-2 hover:underline self-center"
            >
              Add players later — take me to the dashboard
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-800" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-zinc-950 px-3 text-[11px] uppercase tracking-wider text-zinc-600">
                or add your real roster
              </span>
            </div>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => { setMode('one-by-one'); setError(''); }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${mode === 'one-by-one' ? 'bg-orange-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
            >
              <Plus className="h-4 w-4" />
              Add One by One
            </button>
            <button
              onClick={() => { setMode('paste'); setError(''); }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${mode === 'paste' ? 'bg-orange-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
            >
              <ListChecks className="h-4 w-4" />
              Paste Roster
            </button>
          </div>

          {/* One-by-one mode */}
          {mode === 'one-by-one' && (
            <div className="space-y-3">
              <p className="text-xs text-zinc-500">
                Tip: if a name is non-obvious to pronounce, type how you <em>say</em> it in the
                second field — &quot;Fuzail&quot; → &quot;foo-zayl&quot;. Helps the AI catch the
                name in voice transcripts.
              </p>
              {players.map((row, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex gap-2">
                    <Input
                      value={row.name}
                      onChange={(e) => updateName(i, e.target.value)}
                      placeholder={`Player ${i + 1}`}
                    />
                    {players.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => removeRow(i)}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <Input
                    value={row.pronunciation}
                    onChange={(e) => updatePron(i, e.target.value)}
                    placeholder="How do you say it? (optional, e.g. foo-zayl)"
                    className="text-xs h-9 text-zinc-300 placeholder:text-zinc-600"
                  />
                </div>
              ))}
              <Button variant="ghost" onClick={addRow} className="w-full">
                <Plus className="h-4 w-4 mr-2" />Add Player
              </Button>
              <div className="flex gap-2 pt-2">
                <Button variant="ghost" onClick={handleSkip} className="flex-1">Skip</Button>
                <Button onClick={handleOneByOneSave} disabled={loading} className="flex-1">
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save & Continue
                </Button>
              </div>
            </div>
          )}

          {/* Paste mode */}
          {mode === 'paste' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <p className="text-xs text-zinc-400">
                  Paste your roster — one player name per line. Copy from an email, Google Doc, or your league's website.
                </p>
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={"Amin Makki\nFuzail Saleem\nIbrahim Nanlawala\nIsa Aziz\nLucas Medina\n..."}
                  rows={8}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none"
                />
                <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <Users className="h-3.5 w-3.5" />
                  {parsedPasteNames.length > 0
                    ? <span className="text-orange-400 font-medium">{parsedPasteNames.length} player{parsedPasteNames.length !== 1 ? 's' : ''} detected</span>
                    : 'Enter one name per line'}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="ghost" onClick={handleSkip} className="flex-1">Skip</Button>
                <Button
                  onClick={handlePasteSave}
                  disabled={loading || parsedPasteNames.length === 0}
                  className="flex-1"
                >
                  {loading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Adding...</>
                  ) : (
                    <>Add {parsedPasteNames.length > 0 ? parsedPasteNames.length : ''} Players</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

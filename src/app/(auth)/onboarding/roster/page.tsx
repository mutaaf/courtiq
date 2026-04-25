'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, X, Loader2, AlertCircle, Users, ListChecks } from 'lucide-react';

type ImportMode = 'one-by-one' | 'paste';

export default function RosterSetupPage() {
  const router = useRouter();
  const [mode, setMode] = useState<ImportMode>('one-by-one');

  // One-by-one mode state
  const [players, setPlayers] = useState<string[]>(['', '', '']);

  // Paste mode state
  const [pasteText, setPasteText] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function addRow() { setPlayers([...players, '']); }
  function removeRow(i: number) { setPlayers(players.filter((_, j) => j !== i)); }
  function updateRow(i: number, val: string) { setPlayers(players.map((p, j) => j === i ? val : p)); }

  const parsedPasteNames = pasteText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length >= 2 && l.length <= 60);

  async function save(names: string[]) {
    setLoading(true);
    setError('');

    try {
      if (names.length > 0) {
        const res = await fetch('/api/auth/add-players', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerNames: names }),
        });

        if (!res.ok) {
          const data = await res.json();
          setError(data.error || 'Failed to add players');
          setLoading(false);
          return;
        }
      }

      router.push('/onboarding/tutorial');
    } catch {
      setError('Something went wrong');
      setLoading(false);
    }
  }

  function handleOneByOneSave() {
    save(players.filter(p => p.trim()));
  }

  function handlePasteSave() {
    if (parsedPasteNames.length === 0) {
      setError('Enter at least one player name (one per line).');
      return;
    }
    save(parsedPasteNames);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Add your players</CardTitle>
          <p className="text-sm text-zinc-400">You can always add more later</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

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
              {players.map((name, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={name} onChange={(e) => updateRow(i, e.target.value)} placeholder={`Player ${i + 1}`} />
                  {players.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => removeRow(i)}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button variant="ghost" onClick={addRow} className="w-full">
                <Plus className="h-4 w-4 mr-2" />Add Player
              </Button>
              <div className="flex gap-2 pt-2">
                <Button variant="ghost" onClick={() => router.push('/onboarding/tutorial')} className="flex-1">Skip</Button>
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
                <Button variant="ghost" onClick={() => router.push('/onboarding/tutorial')} className="flex-1">Skip</Button>
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

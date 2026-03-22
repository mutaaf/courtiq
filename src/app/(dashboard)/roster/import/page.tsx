'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { queryKeys } from '@/lib/query/keys';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  FileText,
  Camera,
  Loader2,
  Check,
  X,
  Upload,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { SYSTEM_DEFAULTS } from '@/lib/config/defaults';

interface ImportedPlayer {
  name: string;
  jersey_number: number | null;
  position: string;
  included: boolean;
}

type ImportMethod = 'text' | 'screenshot';
type ImportStep = 'input' | 'preview' | 'saving' | 'done';

export default function ImportRosterPage() {
  const router = useRouter();
  const { activeTeam } = useActiveTeam();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [method, setMethod] = useState<ImportMethod>('text');
  const [step, setStep] = useState<ImportStep>('input');
  const [error, setError] = useState<string | null>(null);

  // Text import
  const [bulkText, setBulkText] = useState('');

  // Screenshot import
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [aiProcessing, setAiProcessing] = useState(false);

  // Preview
  const [players, setPlayers] = useState<ImportedPlayer[]>([]);
  const [savedCount, setSavedCount] = useState(0);

  const parseTextInput = () => {
    const lines = bulkText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      setError('Please enter at least one player name.');
      return;
    }

    const parsed: ImportedPlayer[] = lines.map((line) => {
      // Try to extract jersey number from formats like "#12 John Doe" or "John Doe #12"
      const numMatch = line.match(/^#?(\d{1,2})\s+(.+)$/) || line.match(/^(.+?)\s+#(\d{1,2})$/);
      if (numMatch) {
        const isNumFirst = /^\d/.test(numMatch[1]);
        return {
          name: isNumFirst ? numMatch[2].trim() : numMatch[1].trim(),
          jersey_number: parseInt(isNumFirst ? numMatch[1] : numMatch[2], 10),
          position: SYSTEM_DEFAULTS.sport.positions[0],
          included: true,
        };
      }
      return {
        name: line,
        jersey_number: null,
        position: SYSTEM_DEFAULTS.sport.positions[0],
        included: true,
      };
    });

    setPlayers(parsed);
    setStep('preview');
    setError(null);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const processScreenshot = async () => {
    if (!imageFile || !activeTeam) return;
    setAiProcessing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('image', imageFile);
      formData.append('team_id', activeTeam.id);

      const response = await fetch('/api/ai/import-roster', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to process screenshot');
      }

      const result = await response.json();
      const parsed: ImportedPlayer[] = (result.players || []).map(
        (p: { name: string; jersey_number?: number | null; position?: string }) => ({
          name: p.name,
          jersey_number: p.jersey_number ?? null,
          position: p.position || SYSTEM_DEFAULTS.sport.positions[0],
          included: true,
        })
      );

      if (parsed.length === 0) {
        setError('No players could be extracted from the image. Try the text import instead.');
        return;
      }

      setPlayers(parsed);
      setStep('preview');
    } catch (err: any) {
      setError(err.message || 'Failed to process screenshot.');
    } finally {
      setAiProcessing(false);
    }
  };

  const togglePlayer = (index: number) => {
    setPlayers((prev) =>
      prev.map((p, i) => (i === index ? { ...p, included: !p.included } : p))
    );
  };

  const updatePlayerField = (index: number, field: keyof ImportedPlayer, value: any) => {
    setPlayers((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p))
    );
  };

  const handleSaveAll = async () => {
    if (!activeTeam) return;
    const toSave = players.filter((p) => p.included);
    if (toSave.length === 0) {
      setError('No players selected to import.');
      return;
    }

    setStep('saving');
    setError(null);

    try {
      const supabase = createClient();

      const rows = toSave.map((p) => ({
        team_id: activeTeam.id,
        name: p.name.trim(),
        position: p.position,
        jersey_number: p.jersey_number,
        age_group: activeTeam.age_group || SYSTEM_DEFAULTS.sport.age_groups[0],
        is_active: true,
      }));

      const { error: insertError } = await supabase.from('players').insert(rows);
      if (insertError) throw insertError;

      setSavedCount(toSave.length);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.players.all(activeTeam.id),
      });

      setStep('done');
    } catch (err: any) {
      setError(err.message || 'Failed to import players.');
      setStep('preview');
    }
  };

  if (!activeTeam) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <h2 className="text-lg font-semibold text-zinc-300">No Active Team</h2>
        <p className="mt-1 text-sm text-zinc-500">Select a team first.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 lg:p-8">
      {/* Back link */}
      <Link
        href="/roster"
        className="inline-flex items-center gap-1 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Roster
      </Link>

      <h1 className="text-2xl font-bold text-zinc-100">Import Roster</h1>

      {/* Done State */}
      {step === 'done' && (
        <Card>
          <CardContent className="flex flex-col items-center p-8 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
              <Check className="h-8 w-8 text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-zinc-100">Import Complete</h2>
            <p className="mt-2 text-zinc-400">
              Successfully imported {savedCount} player{savedCount !== 1 ? 's' : ''} to{' '}
              {activeTeam.name}.
            </p>
            <div className="mt-6 flex gap-3">
              <Button variant="outline" onClick={() => { setStep('input'); setPlayers([]); setBulkText(''); setImageFile(null); setImagePreview(null); }}>
                Import More
              </Button>
              <Button onClick={() => router.push('/roster')}>View Roster</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Input Step */}
      {step === 'input' && (
        <>
          {/* Method Toggle */}
          <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
            <button
              type="button"
              onClick={() => setMethod('text')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                method === 'text'
                  ? 'bg-orange-500/20 text-orange-400'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }`}
            >
              <FileText className="h-4 w-4" />
              Paste Names
            </button>
            <button
              type="button"
              onClick={() => setMethod('screenshot')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                method === 'screenshot'
                  ? 'bg-orange-500/20 text-orange-400'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }`}
            >
              <Camera className="h-4 w-4" />
              Screenshot
            </button>
          </div>

          {method === 'text' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Bulk Text Import</CardTitle>
                <CardDescription>
                  Enter player names, one per line. Optionally include jersey numbers
                  (e.g., &ldquo;#12 John Doe&rdquo;).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder={"#12 John Doe\n#7 Jane Smith\nAlex Johnson"}
                  value={bulkText}
                  onChange={(e) => { setBulkText(e.target.value); setError(null); }}
                  rows={10}
                />
                <div className="flex justify-end">
                  <Button onClick={parseTextInput} disabled={!bulkText.trim()}>
                    Preview Players
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {method === 'screenshot' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Screenshot Import</CardTitle>
                <CardDescription>
                  Upload a screenshot of a roster list and AI will extract player names.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                />

                {imagePreview ? (
                  <div className="space-y-3">
                    <div className="relative overflow-hidden rounded-lg border border-zinc-700">
                      <img
                        src={imagePreview}
                        alt="Roster screenshot"
                        className="max-h-64 w-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => { setImageFile(null); setImagePreview(null); }}
                        className="absolute right-2 top-2 rounded-full bg-zinc-900/80 p-1 text-zinc-400 hover:text-zinc-200"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex justify-end">
                      <Button onClick={processScreenshot} disabled={aiProcessing}>
                        {aiProcessing ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4" />
                            Extract Players
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-zinc-700 p-8 text-center transition-colors hover:border-orange-500/50 hover:bg-zinc-900/50"
                  >
                    <Camera className="h-10 w-10 text-zinc-600" />
                    <div>
                      <p className="font-medium text-zinc-300">Upload Screenshot</p>
                      <p className="mt-1 text-xs text-zinc-500">PNG, JPG, or HEIC</p>
                    </div>
                  </button>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Preview Step */}
      {step === 'preview' && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Preview Players</CardTitle>
                <CardDescription>
                  {players.filter((p) => p.included).length} of {players.length} selected
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setStep('input'); setPlayers([]); }}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {players.map((player, index) => (
                <div
                  key={index}
                  className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                    player.included
                      ? 'border-zinc-800 bg-zinc-900/30'
                      : 'border-zinc-800/50 bg-zinc-900/10 opacity-50'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => togglePlayer(index)}
                    className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                      player.included
                        ? 'border-orange-500 bg-orange-500 text-white'
                        : 'border-zinc-600 bg-transparent'
                    }`}
                  >
                    {player.included && <Check className="h-3.5 w-3.5" />}
                  </button>

                  <Input
                    value={player.name}
                    onChange={(e) => updatePlayerField(index, 'name', e.target.value)}
                    className="flex-1"
                    placeholder="Player name"
                  />

                  <Input
                    type="number"
                    value={player.jersey_number ?? ''}
                    onChange={(e) =>
                      updatePlayerField(
                        index,
                        'jersey_number',
                        e.target.value ? parseInt(e.target.value, 10) : null
                      )
                    }
                    className="w-16"
                    placeholder="#"
                    min={0}
                    max={99}
                  />

                  <select
                    value={player.position}
                    onChange={(e) => updatePlayerField(index, 'position', e.target.value)}
                    className="h-10 rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-100"
                  >
                    {SYSTEM_DEFAULTS.sport.positions.map((pos) => (
                      <option key={pos} value={pos}>
                        {pos}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => { setStep('input'); setPlayers([]); }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveAll}>
              <Users className="h-4 w-4" />
              Import {players.filter((p) => p.included).length} Players
            </Button>
          </div>
        </>
      )}

      {/* Saving Step */}
      {step === 'saving' && (
        <Card>
          <CardContent className="flex flex-col items-center p-8 text-center">
            <Loader2 className="mb-4 h-10 w-10 animate-spin text-orange-500" />
            <p className="text-zinc-300">Importing players...</p>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
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

type ImportStep = 'upload' | 'preview' | 'saving' | 'done';

export default function ImportPhotoPage() {
  const router = useRouter();
  const { activeTeam } = useActiveTeam();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<ImportStep>('upload');
  const [error, setError] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [players, setPlayers] = useState<ImportedPlayer[]>([]);
  const [savedCount, setSavedCount] = useState(0);

  // Resize image to max 1200px wide to stay under token limits
  async function resizeImage(file: File, maxWidth = 1200): Promise<{ base64: string; mimeType: string }> {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const base64 = dataUrl.split(',')[1];
        resolve({ base64, mimeType: 'image/jpeg' });
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Support multiple images
    const file = files[0];
    setImageFile(file);
    setError(null);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);

    // If multiple files, process them all
    if (files.length > 1) {
      setMultipleFiles(Array.from(files));
    }
  };

  const [multipleFiles, setMultipleFiles] = useState<File[]>([]);

  const processScreenshot = async () => {
    if (!activeTeam) return;
    const filesToProcess = multipleFiles.length > 0 ? multipleFiles : (imageFile ? [imageFile] : []);
    if (filesToProcess.length === 0) return;

    setAiProcessing(true);
    setError(null);

    let totalImported = 0;
    const allDuplicates: string[] = [];

    try {
      for (const file of filesToProcess) {
        // Resize image to stay under AI token limits
        const { base64, mimeType } = await resizeImage(file);

        const response = await fetch('/api/ai/import-roster', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            teamId: activeTeam.id,
            imageBase64: base64,
            mimeType,
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to process screenshot');
        }

        const result = await response.json();
        totalImported += (result.imported || []).length;
        allDuplicates.push(...(result.duplicates || []));
      }

      setSavedCount(totalImported);

      // Invalidate roster cache
      await queryClient.invalidateQueries({
        queryKey: queryKeys.players.all(activeTeam.id),
      });

      if (totalImported === 0 && allDuplicates.length === 0) {
        setError('No players could be extracted from the image(s). Try a clearer photo or use text import.');
        return;
      }

      if (allDuplicates.length > 0) {
        setError(`${allDuplicates.length} player(s) already on roster: ${allDuplicates.join(', ')}`);
      }

      setStep('done');
    } catch (err: any) {
      setError(err.message || 'Failed to process screenshot.');
    } finally {
      setAiProcessing(false);
      setMultipleFiles([]);
    }
  };

  const [textMode, setTextMode] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  const handleBulkTextImport = async () => {
    if (!bulkText.trim() || !activeTeam) return;
    setBulkSaving(true);
    setError(null);

    const names = bulkText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length >= 2 && l.length <= 60);

    if (names.length === 0) {
      setError('No valid names found. Enter one name per line.');
      setBulkSaving(false);
      return;
    }

    try {
      // Check for existing players
      const existingRes = await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'players', select: 'name', filters: { team_id: activeTeam.id } }),
      });
      const existingData = await existingRes.json();
      const existingNames = new Set(
        ((existingData.data || []) as any[]).map((p: any) => p.name.toLowerCase().trim())
      );

      const newNames = names.filter(n => !existingNames.has(n.toLowerCase().trim()));
      const dupes = names.filter(n => existingNames.has(n.toLowerCase().trim()));

      if (newNames.length > 0) {
        // Get team age group
        const teamRes = await fetch('/api/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: 'teams', select: 'age_group', filters: { id: activeTeam.id }, single: true }),
        });
        const teamData = await teamRes.json();
        const ageGroup = teamData.data?.age_group || '8-10';

        await fetch('/api/data/mutate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            table: 'players',
            operation: 'insert',
            data: newNames.map(name => ({
              team_id: activeTeam.id,
              name,
              position: 'Flex',
              age_group: ageGroup,
            })),
          }),
        });
      }

      setSavedCount(newNames.length);
      await queryClient.invalidateQueries({ queryKey: queryKeys.players.all(activeTeam.id) });

      if (dupes.length > 0) {
        setError(`${dupes.length} already on roster: ${dupes.join(', ')}`);
      }
      setStep('done');
    } catch (err: any) {
      setError(err.message || 'Failed to import players');
    } finally {
      setBulkSaving(false);
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
    <div className="mx-auto max-w-2xl space-y-6 p-4 lg:p-8 pb-8">
      {/* Back link */}
      <Link
        href="/roster"
        className="inline-flex items-center gap-1 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Roster
      </Link>

      <h1 className="text-2xl font-bold text-zinc-100">Import from Photo</h1>
      <p className="text-sm text-zinc-400">
        Upload a screenshot or photo of a roster list and AI will extract player names, numbers, and positions.
      </p>

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
              <Button
                variant="outline"
                onClick={() => {
                  setStep('upload');
                  setImageFile(null);
                  setImagePreview(null);
                  setError(null);
                  setSavedCount(0);
                }}
              >
                Import More
              </Button>
              <Button onClick={() => router.push('/roster')}>View Roster</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mode Toggle */}
      {step === 'upload' && (
        <div className="flex gap-2">
          <button
            onClick={() => setTextMode(false)}
            className={`flex-1 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${!textMode ? 'bg-orange-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
          >
            <Camera className="h-4 w-4 inline mr-2" />
            Photo Import
          </button>
          <button
            onClick={() => setTextMode(true)}
            className={`flex-1 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${textMode ? 'bg-orange-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
          >
            <Users className="h-4 w-4 inline mr-2" />
            Paste Names
          </button>
        </div>
      )}

      {/* Text Paste Mode */}
      {step === 'upload' && textMode && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Paste Player Names</CardTitle>
            <CardDescription>
              Enter one player name per line. We&apos;ll deduplicate against your existing roster.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={"Amin Makki\nFuzail Saleem\nIbrahim Nanlawala\nIsa Aziz\nLucas Medina"}
              rows={8}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
            <p className="text-xs text-zinc-500">
              {bulkText.split('\n').filter(l => l.trim().length >= 2).length} names detected
            </p>
            <Button
              onClick={handleBulkTextImport}
              disabled={bulkSaving || !bulkText.trim()}
              className="w-full"
            >
              {bulkSaving ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Importing...</>
              ) : (
                <><Upload className="h-4 w-4" /> Import {bulkText.split('\n').filter(l => l.trim().length >= 2).length} Players</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Photo Upload Step */}
      {step === 'upload' && !textMode && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload Roster Photo</CardTitle>
            <CardDescription>
              Take a photo or upload a screenshot of a team roster, lineup card, or player list.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageSelect}
              className="hidden"
            />

            {imagePreview ? (
              <div className="space-y-3">
                <div className="relative overflow-hidden rounded-lg border border-zinc-700">
                  <img
                    src={imagePreview}
                    alt="Roster screenshot"
                    className="max-h-80 w-full object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setImageFile(null);
                      setImagePreview(null);
                      setError(null);
                    }}
                    className="absolute right-2 top-2 rounded-full bg-zinc-900/80 p-1.5 text-zinc-400 hover:text-zinc-200"
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
                className="flex w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-zinc-700 p-10 text-center transition-colors hover:border-orange-500/50 hover:bg-zinc-900/50"
              >
                <Camera className="h-12 w-12 text-zinc-600" />
                <div>
                  <p className="font-medium text-zinc-300">Tap to upload or take photo</p>
                  <p className="mt-1 text-xs text-zinc-500">PNG, JPG, or HEIC</p>
                </div>
              </button>
            )}
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

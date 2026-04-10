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

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setError(null);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const processScreenshot = async () => {
    if (!imageFile || !activeTeam) return;
    setAiProcessing(true);
    setError(null);

    try {
      // Convert to base64
      const buffer = await imageFile.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      const response = await fetch('/api/ai/import-roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: activeTeam.id,
          imageBase64: base64,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to process screenshot');
      }

      const result = await response.json();

      // The API auto-imports — show results
      const imported = result.imported || [];
      const duplicates = result.duplicates || [];

      if (imported.length === 0 && duplicates.length === 0 && result.total_extracted === 0) {
        setError('No players could be extracted from the image. Try a clearer photo or use text import.');
        return;
      }

      // Build preview list from imported + duplicates info
      const parsed: ImportedPlayer[] = imported.map(
        (p: { name: string; jersey_number?: number | null; position?: string }) => ({
          name: p.name,
          jersey_number: p.jersey_number ?? null,
          position: p.position || SYSTEM_DEFAULTS.sport.positions[0],
          included: true,
        })
      );

      setSavedCount(imported.length);

      // Invalidate roster cache
      await queryClient.invalidateQueries({
        queryKey: queryKeys.players.all(activeTeam.id),
      });

      if (duplicates.length > 0) {
        setError(`${duplicates.length} player(s) already on roster: ${duplicates.join(', ')}`);
      }

      setStep('done');
    } catch (err: any) {
      setError(err.message || 'Failed to process screenshot.');
    } finally {
      setAiProcessing(false);
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

      {/* Upload Step */}
      {step === 'upload' && (
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
              capture="environment"
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

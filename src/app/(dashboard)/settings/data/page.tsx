'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useActiveTeam } from '@/hooks/use-active-team';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft,
  Download,
  Users,
  CalendarDays,
  FileText,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';
import Link from 'next/link';

type ExportType = 'observations' | 'roster' | 'sessions';

interface ExportItem {
  type: ExportType;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const EXPORTS: ExportItem[] = [
  {
    type: 'observations',
    label: 'Observations',
    description: 'All coaching notes, sentiments, and categories',
    icon: <FileText className="h-5 w-5 text-orange-400" />,
  },
  {
    type: 'roster',
    label: 'Roster',
    description: 'Player list with stats and skill data',
    icon: <Users className="h-5 w-5 text-blue-400" />,
  },
  {
    type: 'sessions',
    label: 'Sessions',
    description: 'Practice and game history with health scores',
    icon: <CalendarDays className="h-5 w-5 text-emerald-400" />,
  },
];

export default function DataPrivacyPage() {
  const router = useRouter();
  const { activeTeam } = useActiveTeam();

  const [downloading, setDownloading] = useState<ExportType | null>(null);
  const [downloadedTypes, setDownloadedTypes] = useState<Set<ExportType>>(new Set());

  // Account deletion state
  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm' | 'typing' | 'deleting'>('idle');
  const [confirmText, setConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const CONFIRM_PHRASE = 'delete my account';

  async function handleExport(type: ExportType) {
    if (!activeTeam) return;
    setDownloading(type);
    try {
      const url = `/api/export?type=${type}&team_id=${activeTeam.id}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const filename = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? `${type}.csv`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      setDownloadedTypes((prev) => new Set([...prev, type]));
    } catch {
      // silent — browser already shows download errors
    } finally {
      setDownloading(null);
    }
  }

  async function handleDeleteAccount() {
    setDeleteStep('deleting');
    setDeleteError(null);
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Deletion failed');
      }
      // Sign out client-side then redirect
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push('/login?deleted=1');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Something went wrong');
      setDeleteStep('typing');
    }
  }

  return (
    <div className="p-4 lg:p-8 space-y-6 pb-36 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/settings">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold">Data &amp; Privacy</h1>
          <p className="text-xs text-zinc-500">Export your data or delete your account</p>
        </div>
      </div>

      {/* Export Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="h-4 w-4 text-blue-400" />
            Export Your Data
          </CardTitle>
          <CardDescription>
            Download your coaching data as CSV files. All exports include data for{' '}
            <span className="font-medium text-zinc-300">{activeTeam?.name ?? 'your active team'}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {EXPORTS.map((item) => {
            const isDone = downloadedTypes.has(item.type);
            const isLoading = downloading === item.type;
            return (
              <div
                key={item.type}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"
              >
                <div className="flex items-center gap-3">
                  {item.icon}
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{item.label}</p>
                    <p className="text-xs text-zinc-500">{item.description}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={isDone ? 'ghost' : 'outline'}
                  onClick={() => handleExport(item.type)}
                  disabled={isLoading || !activeTeam}
                  className="shrink-0"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isDone ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <>
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                      CSV
                    </>
                  )}
                </Button>
              </div>
            );
          })}
          <p className="text-xs text-zinc-600 pt-1">
            Exports include only the currently selected team. Switch teams to export other teams&apos; data.
          </p>
        </CardContent>
      </Card>

      {/* Account Deletion Section */}
      <Card className="border-red-500/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-red-400">
            <ShieldAlert className="h-4 w-4" />
            Delete Account
          </CardTitle>
          <CardDescription>
            Permanently deletes your account and all associated data. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {deleteStep === 'idle' && (
            <>
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 space-y-1">
                <p className="text-xs font-medium text-red-400 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  What gets deleted:
                </p>
                <ul className="text-xs text-red-300/70 space-y-0.5 ml-5 list-disc">
                  <li>All observations, sessions, and practice plans</li>
                  <li>All player profiles and skill progress data</li>
                  <li>All shared parent report links</li>
                  <li>Your account and login credentials</li>
                </ul>
              </div>
              <Button
                variant="outline"
                className="border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                onClick={() => setDeleteStep('confirm')}
              >
                I want to delete my account
              </Button>
            </>
          )}

          {deleteStep === 'confirm' && (
            <div className="space-y-3">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="text-sm font-medium text-amber-400">Are you absolutely sure?</p>
                <p className="text-xs text-amber-300/70 mt-1">
                  We recommend exporting your data first. This action is permanent and cannot be reversed.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteStep('idle')}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => setDeleteStep('typing')}
                >
                  Yes, proceed
                </Button>
              </div>
            </div>
          )}

          {(deleteStep === 'typing' || deleteStep === 'deleting') && (
            <div className="space-y-3">
              <div>
                <p className="text-sm text-zinc-300 mb-2">
                  Type <span className="font-mono font-semibold text-red-400">{CONFIRM_PHRASE}</span> to confirm:
                </p>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={CONFIRM_PHRASE}
                  className="border-red-500/30 focus:border-red-500"
                  disabled={deleteStep === 'deleting'}
                />
              </div>
              {deleteError && (
                <p className="text-xs text-red-400 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {deleteError}
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setDeleteStep('idle'); setConfirmText(''); setDeleteError(null); }}
                  disabled={deleteStep === 'deleting'}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 text-white"
                  disabled={confirmText !== CONFIRM_PHRASE || deleteStep === 'deleting'}
                  onClick={handleDeleteAccount}
                >
                  {deleteStep === 'deleting' ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    'Permanently delete account'
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* COPPA note */}
      <p className="text-xs text-zinc-600 text-center">
        In accordance with COPPA and privacy regulations, all data associated with your account
        is permanently and irreversibly removed upon deletion. No backup copies are retained.
      </p>
    </div>
  );
}

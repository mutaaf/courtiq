'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { query, mutate } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Save, Loader2, LogOut, User } from 'lucide-react';
import Link from 'next/link';

export default function ProfileSettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [initialized, setInitialized] = useState(false);

  const { data: meData, isLoading } = useQuery({
    queryKey: queryKeys.coach.current(),
    queryFn: async () => {
      const res = await fetch('/api/me');
      if (!res.ok) return null;
      const data = await res.json();
      return data.coach;
    },
  });
  const coach = meData;

  useEffect(() => {
    if (coach && !initialized) {
      setFullName(coach.full_name || '');
      setEmail(coach.email || '');
      setAvatarUrl(coach.avatar_url || '');
      setInitialized(true);
    }
  }, [coach, initialized]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!coach) throw new Error('Not authenticated');

      await mutate({
        table: 'coaches',
        operation: 'update',
        data: {
          full_name: fullName,
          avatar_url: avatarUrl || null,
        },
        filters: { id: coach.id },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.coach.current() });
    },
  });

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const initials = fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="p-4 lg:p-8 space-y-6 pb-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/settings">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Profile</h1>
          <p className="text-zinc-400 text-sm">Manage your personal information</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-20 rounded-full mx-auto" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <>
          {/* Avatar */}
          <div className="flex justify-center">
            <div className="relative">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={fullName}
                  className="h-20 w-20 rounded-full object-cover border-2 border-zinc-700"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-zinc-800 border-2 border-zinc-700 text-xl font-bold text-zinc-300">
                  {initials || <User className="h-8 w-8" />}
                </div>
              )}
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Personal Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Full Name</label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Email</label>
                <Input value={email} disabled className="opacity-60" />
                <p className="text-xs text-zinc-500">
                  Email cannot be changed here. Contact support to update.
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Avatar URL</label>
                <Input
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://example.com/avatar.jpg"
                />
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  onClick={() => updateMutation.mutate()}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save Changes
                </Button>
              </div>

              {updateMutation.isSuccess && (
                <p className="text-xs text-emerald-400">Profile updated successfully.</p>
              )}
              {updateMutation.isError && (
                <p className="text-xs text-red-400">Failed to update profile. Please try again.</p>
              )}
            </CardContent>
          </Card>

          {/* Sign out */}
          <Card className="border-red-900/30">
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-sm">Sign Out</p>
                <p className="text-xs text-zinc-500">Sign out of your SportsIQ account</p>
              </div>
              <Button variant="destructive" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

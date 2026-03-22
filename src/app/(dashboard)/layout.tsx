import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { DashboardShell } from '@/components/layout/dashboard-shell';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: coach } = await supabase
    .from('coaches')
    .select('*, organizations(*)')
    .eq('id', user.id)
    .single();

  if (!coach) redirect('/signup');
  if (!coach.onboarding_complete) redirect('/onboarding/sport');

  return <DashboardShell coach={coach}>{children}</DashboardShell>;
}

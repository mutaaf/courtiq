import { redirect } from 'next/navigation';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { WelcomeTour } from '@/components/onboarding/welcome-tour';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Use service role to bypass RLS for layout data
  const admin = await createServiceSupabase();

  const { data: coach } = await admin
    .from('coaches')
    .select('*, organizations(*)')
    .eq('id', user.id)
    .single();

  if (!coach) redirect('/onboarding/sport');
  if (!coach.onboarding_complete) redirect('/onboarding/sport');

  return (
    <DashboardShell coach={coach}>
      {children}
      <WelcomeTour />
    </DashboardShell>
  );
}

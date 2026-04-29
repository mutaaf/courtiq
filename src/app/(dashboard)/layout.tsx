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

  if (!coach) redirect('/onboarding/setup');
  if (!coach.onboarding_complete) redirect('/onboarding/setup');

  // Tour fires only after the coach has logged at least one real (non-sample) observation.
  // Cheap query — uses the existing observations(coach_id) index.
  const { count: obsCount } = await admin
    .from('observations')
    .select('id', { count: 'exact', head: true })
    .eq('coach_id', user.id)
    .limit(1);
  const hasFirstObservation = (obsCount ?? 0) > 0;

  return (
    <DashboardShell coach={coach}>
      {children}
      <WelcomeTour enabled={hasFirstObservation} />
    </DashboardShell>
  );
}

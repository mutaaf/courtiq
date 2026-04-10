import { createServerSupabase } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import LandingContent from './landing-content';

export default async function LandingPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/home');

  return <LandingContent />;
}

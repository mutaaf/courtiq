import { redirect } from 'next/navigation';

// Legacy entry point — combined into /onboarding/setup.
export default function LegacyTeamPage() {
  redirect('/onboarding/setup');
}

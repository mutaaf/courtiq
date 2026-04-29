import { redirect } from 'next/navigation';

// Legacy entry point — combined into /onboarding/setup.
// Kept as a server-side redirect so any external links / bookmarks still work.
// Safe to delete once /onboarding/setup has been live for a release cycle.
export default function LegacySportPage() {
  redirect('/onboarding/setup');
}

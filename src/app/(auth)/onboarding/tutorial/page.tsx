import { redirect } from 'next/navigation';

// Static tutorial replaced by /onboarding/first-capture (a guided voice
// observation moment). Kept as a redirect so existing analytics and any
// stored sessionStorage flows still work.
export default function LegacyTutorialPage() {
  redirect('/onboarding/first-capture');
}

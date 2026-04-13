import Link from 'next/link';
import { Shield, ArrowLeft } from 'lucide-react';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200 transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <Shield className="h-8 w-8 text-emerald-500" />
          <h1 className="text-3xl font-bold">Privacy Policy &amp; Terms</h1>
        </div>

        <div className="space-y-8 text-sm text-zinc-300 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-zinc-100 mb-3">COPPA Compliance</h2>
            <p>
              SportsIQ is committed to protecting the privacy of children. We comply with the
              Children&apos;s Online Privacy Protection Act (COPPA). Our service is designed for use
              by coaches and program administrators who are 13 years of age or older.
            </p>
            <ul className="mt-3 space-y-2 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 mt-1">&#8226;</span>
                Minors (under 13) cannot create accounts on SportsIQ
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 mt-1">&#8226;</span>
                Player data for minors is entered and managed solely by authorized adult coaches
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 mt-1">&#8226;</span>
                We collect only the minimum data necessary to provide coaching features
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 mt-1">&#8226;</span>
                Parents/guardians can request access to or deletion of their child&apos;s data at any time
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-100 mb-3">Data Handling</h2>
            <ul className="space-y-2 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 mt-1">&#8226;</span>
                All data is encrypted in transit (TLS) and at rest
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 mt-1">&#8226;</span>
                Player information is only accessible to authorized coaches within your organization
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 mt-1">&#8226;</span>
                We do not sell, rent, or share your data with third parties
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 mt-1">&#8226;</span>
                AI processing of coaching observations is done securely and data is not used to train AI models
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-100 mb-3">Minimum Data Collection</h2>
            <p>
              We collect only what is needed to provide the coaching platform:
            </p>
            <ul className="mt-3 space-y-2 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 mt-1">&#8226;</span>
                <strong className="text-zinc-200">Coaches:</strong> Name, email, organization
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 mt-1">&#8226;</span>
                <strong className="text-zinc-200">Players:</strong> Name, position, jersey number, age group
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 mt-1">&#8226;</span>
                <strong className="text-zinc-200">Parents:</strong> Name and email (optional, for progress sharing only)
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-100 mb-3">Data Deletion</h2>
            <p>
              Parents or guardians can request deletion of their child&apos;s data at any time by
              contacting their coach or reaching out to us directly. Coaches can delete player
              records from their roster at any time.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-100 mb-3">Your Rights</h2>
            <ul className="space-y-2 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 mt-1">&#8226;</span>
                You can export your data at any time
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 mt-1">&#8226;</span>
                You can delete your account and all associated data
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 mt-1">&#8226;</span>
                Parents can request to see what data is stored about their child
              </li>
            </ul>
          </section>
        </div>

        <div className="mt-12 border-t border-zinc-800 pt-6 text-center text-xs text-zinc-600">
          Last updated: April 2026
        </div>
      </div>
    </div>
  );
}

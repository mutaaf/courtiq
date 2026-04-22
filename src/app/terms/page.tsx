import Link from 'next/link';
import { FileText, ArrowLeft } from 'lucide-react';

export default function TermsPage() {
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
          <FileText className="h-8 w-8 text-orange-500" />
          <h1 className="text-3xl font-bold">Terms of Service</h1>
        </div>

        <div className="space-y-8 text-sm text-zinc-300 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-zinc-100 mb-3">Agreement to Terms</h2>
            <p>
              By creating an account or using SportsIQ (&ldquo;the Service&rdquo;), you agree to these
              Terms of Service. If you are using the Service on behalf of an organization, you
              represent that you have authority to bind that organization to these terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-100 mb-3">Use of the Service</h2>
            <p className="mb-3">
              SportsIQ is a coaching intelligence platform designed for authorized adult coaches
              and program administrators. You agree to:
            </p>
            <ul className="space-y-2 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-1">&#8226;</span>
                Use the Service only for lawful coaching and player development purposes
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-1">&#8226;</span>
                Be at least 13 years of age to create an account
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-1">&#8226;</span>
                Obtain appropriate consent before entering player or parent information
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-1">&#8226;</span>
                Keep your account credentials confidential and notify us of any unauthorized access
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-1">&#8226;</span>
                Not use the Service to harass, harm, or discriminate against any individual
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-100 mb-3">Account Responsibilities</h2>
            <p>
              You are responsible for all activity that occurs under your account. Player data
              you enter — names, observations, progress notes — is your responsibility to manage
              appropriately and in accordance with applicable laws including COPPA. You agree to
              use accurate information and to keep your account details up to date.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-100 mb-3">Subscription &amp; Payments</h2>
            <ul className="space-y-2 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-1">&#8226;</span>
                <strong className="text-zinc-200">Free tier:</strong> Available indefinitely with usage limits described on the pricing page
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-1">&#8226;</span>
                <strong className="text-zinc-200">Paid tiers:</strong> Billed monthly or annually as selected; prices are shown in USD
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-1">&#8226;</span>
                You may cancel your subscription at any time; access continues through the end of the current billing period
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-1">&#8226;</span>
                We reserve the right to change pricing with 30 days&apos; notice to existing subscribers
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-100 mb-3">Your Content</h2>
            <p>
              You retain ownership of all coaching notes, observations, and data you enter into
              SportsIQ. By using the Service you grant us a limited license to process and store
              your content solely to provide the Service. We do not use your content to train
              AI models or share it with third parties except as required to operate the platform
              (e.g., our AI provider processes prompts to generate responses on your behalf).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-100 mb-3">AI-Generated Content</h2>
            <p>
              SportsIQ uses AI to generate practice plans, player analyses, and coaching
              suggestions. AI-generated content is provided as a coaching aid only — it is not
              a substitute for your professional judgment. Always review AI suggestions before
              sharing with players, parents, or other coaches. We are not responsible for
              decisions made based on AI-generated content.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-100 mb-3">Intellectual Property</h2>
            <p>
              The SportsIQ platform, including its design, software, and brand, is owned by
              SportsIQ and protected by applicable intellectual property laws. You may not copy,
              modify, distribute, or reverse-engineer any part of the Service without our
              express written permission.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-100 mb-3">Limitation of Liability</h2>
            <p>
              The Service is provided &ldquo;as is&rdquo; without warranty of any kind. To the maximum
              extent permitted by law, SportsIQ shall not be liable for any indirect, incidental,
              special, or consequential damages arising from your use of the Service, including
              but not limited to data loss, coaching outcomes, or player development results.
              Our total liability for any claim shall not exceed the amount you paid us in the
              three months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-100 mb-3">Termination</h2>
            <p>
              You may close your account at any time from Settings. We may suspend or terminate
              your account if you violate these terms or if required by law. Upon termination
              you may export your data for 30 days, after which it will be permanently deleted.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-100 mb-3">Changes to These Terms</h2>
            <p>
              We may update these terms from time to time. We will notify you of material changes
              by email or in-app notification. Continued use of the Service after the effective
              date of changes constitutes acceptance of the updated terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-100 mb-3">Contact</h2>
            <p>
              Questions about these terms? Reach us through the app or visit our{' '}
              <Link href="/privacy" className="text-orange-400 hover:text-orange-300 underline">
                Privacy Policy
              </Link>{' '}
              for data-related inquiries.
            </p>
          </section>
        </div>

        <div className="mt-12 border-t border-zinc-800 pt-6 text-center text-xs text-zinc-600">
          Last updated: April 2026
        </div>
      </div>
    </div>
  );
}

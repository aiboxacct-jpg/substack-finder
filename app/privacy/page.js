export const metadata = {
  title: 'Privacy Policy — Substack Finder',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <a href="/" className="text-sm text-orange-600 hover:underline">
          &larr; Back to Substack Finder
        </a>
        <h1 className="mt-4 text-3xl font-bold text-gray-900">Privacy Policy</h1>
        <p className="mt-1 text-sm text-gray-500">Last updated: July 17, 2026</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-gray-700">
          <section>
            <p>
              This policy explains what Substack Finder (operated by Stack Tools) collects and how
              we use it. We aim to collect as little as possible.
            </p>
          </section>

          <section>
            <h2 className="mb-1 text-lg font-semibold text-gray-900">What we collect</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Account info:</strong> your email address (and a password, which is stored
                securely and hashed by our authentication provider).
              </li>
              <li>
                <strong>Matches you run:</strong> the Substack link you paste in, so we can generate
                matches and show your history to you and the site owner.
              </li>
              <li>
                <strong>Payment info:</strong> handled entirely by Stripe. We never see or store
                your card details.
              </li>
              <li>
                <strong>Basic analytics:</strong> privacy-friendly page-view counts to understand
                usage.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-1 text-lg font-semibold text-gray-900">How we use it</h2>
            <p>
              To provide and improve the Service, run your account and membership, and send you
              service-related emails (and, if you opt in, your saved-match digests).
            </p>
          </section>

          <section>
            <h2 className="mb-1 text-lg font-semibold text-gray-900">Who we share it with</h2>
            <p>
              We do not sell your data. We rely on a few trusted service providers who process data
              only to run the Service:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><strong>Supabase</strong> — database &amp; login</li>
              <li><strong>Stripe</strong> — payments</li>
              <li><strong>Vercel</strong> — hosting &amp; analytics</li>
              <li>
                <strong>Anthropic</strong> — the AI that generates matches. The Substack you paste
                in is sent to the AI (which may perform a web search) to produce your matches.
              </li>
              <li><strong>Resend</strong> — email delivery</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-1 text-lg font-semibold text-gray-900">Retention &amp; deletion</h2>
            <p>
              We keep your data while your account is active. Email us anytime to access or delete
              your data.
            </p>
          </section>

          <section>
            <h2 className="mb-1 text-lg font-semibold text-gray-900">Cookies</h2>
            <p>
              We use a minimal login/session cookie to keep you signed in. We don&rsquo;t use
              advertising cookies.
            </p>
          </section>

          <section>
            <h2 className="mb-1 text-lg font-semibold text-gray-900">Contact</h2>
            <p>
              Questions or requests? Email{' '}
              <a href="mailto:stacktoolsinbox@gmail.com" className="text-orange-600 hover:underline">
                stacktoolsinbox@gmail.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

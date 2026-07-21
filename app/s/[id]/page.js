import { createClient } from '@supabase/supabase-js';
import { ExternalLink, User, FileText, Mail, Search } from 'lucide-react';

// A shared snapshot of someone's collaboration matches. Read server-side with
// the service key, so the table stays completely closed to the browser and the
// link itself is what grants access.
//
// Unlisted, not secret: anyone with the link can view it. Kept out of search
// results so these pages never compete with the real tool for rankings.
export const metadata = {
  title: 'Collaboration matches — Substack Finder',
  robots: { index: false, follow: false },
};

function relativeTime(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const day = 86400000;
  if (diff < 3600000) return 'just now';
  if (diff < day) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 30 * day) return `${Math.floor(diff / day)}d ago`;
  if (diff < 365 * day) return `${Math.floor(diff / (30 * day))}mo ago`;
  return `${Math.floor(diff / (365 * day))}y ago`;
}

function aboutUrl(url) {
  try {
    return new URL(url).origin + '/about';
  } catch {
    return url;
  }
}

async function getShared(id) {
  // A malformed id would make Postgres throw on the uuid cast, so check shape
  // first and treat anything else as simply not found.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const { data } = await admin
      .from('shared_results')
      .select('topic, results, created_at')
      .eq('id', id)
      .single();
    return data || null;
  } catch {
    return null;
  }
}

export default async function SharedResults({ params }) {
  const { id } = await params;
  const shared = await getShared(id);

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-white px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Collaboration matches
          </h1>
          {shared && (
            <p className="mt-3 break-all text-gray-600">
              Substack writers worth knowing, matched for{' '}
              <span className="font-medium">{shared.topic}</span>
            </p>
          )}
        </header>

        {!shared ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
            <p className="text-gray-600">This share link is no longer available.</p>
            <a
              href="/"
              className="mt-4 inline-block rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
            >
              Find your own matches
            </a>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {shared.results.map((r, i) => (
                <div
                  key={i}
                  className="group rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md"
                >
                  {Number.isFinite(Number(r.match)) && (
                    <span className="mb-2 inline-block rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                      {Math.round(Number(r.match))}% match
                    </span>
                  )}
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="flex items-start justify-between gap-3"
                  >
                    <h2 className="text-lg font-semibold text-gray-900 group-hover:text-orange-600">
                      {r.name}
                    </h2>
                    <ExternalLink className="mt-1 h-4 w-4 flex-shrink-0 text-gray-400 group-hover:text-orange-500" />
                  </a>
                  {r.author && (
                    <div className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
                      <User className="h-3.5 w-3.5" />
                      <span>{r.author}</span>
                    </div>
                  )}
                  {r.description && (
                    <p className="mt-2 text-sm text-gray-600">{r.description}</p>
                  )}
                  {r.tag && (
                    <span className="mt-3 inline-block rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-700">
                      {r.tag}
                    </span>
                  )}
                  <div className="mt-3">
                    <a
                      href={aboutUrl(r.url)}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 px-3 py-1.5 text-xs font-medium text-orange-700 transition hover:bg-orange-50"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      Contact
                    </a>
                  </div>
                  {r.latestPosts?.length > 0 && (
                    <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-3">
                      {r.latestPosts.map((p, j) => (
                        <a
                          key={j}
                          href={p.link || r.url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="flex items-center gap-2 text-xs text-gray-500 transition hover:text-orange-600"
                        >
                          <FileText className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                          <span className="truncate">{p.title}</span>
                          {p.date && (
                            <span className="ml-auto flex-shrink-0 text-gray-400">
                              {relativeTime(p.date)}
                            </span>
                          )}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* The whole point of sharing: the reader should be able to run
                their own. */}
            <a
              href="/"
              className="group mt-10 flex items-center gap-3 rounded-2xl border border-orange-200 bg-orange-50/50 p-4 transition hover:border-orange-300 hover:bg-orange-50"
            >
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
                <Search className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 group-hover:text-orange-700">
                  Find your own collaboration matches
                </p>
                <p className="text-xs text-gray-600">
                  Paste your Substack and see who you should be working with.
                </p>
              </div>
            </a>
          </>
        )}

        <footer className="mt-16 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-orange-100 pt-6 text-xs text-gray-400">
          <a href="/terms" className="hover:text-orange-600">
            Terms
          </a>
          <span>·</span>
          <a href="/privacy" className="hover:text-orange-600">
            Privacy
          </a>
          <span>·</span>
          <span>© 2026 Stack Tools</span>
        </footer>
      </div>
    </main>
  );
}

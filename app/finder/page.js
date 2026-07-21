'use client';

import { useState, useEffect } from 'react';
import {
  Users,
  ExternalLink,
  User,
  Loader2,
  AlertCircle,
  Copy,
  Check,
  FileText,
  ArrowUpDown,
  X,
  Bookmark,
  BookmarkCheck,
  Sparkles,
  Mail,
  ArrowLeft,
  Wand2,
} from 'lucide-react';
import AuthBar from '../AuthBar';
import { supabase } from '@/lib/supabase';
import { useHubHref, useToolHref } from '@/lib/links';

// Rotating status lines shown during the (slow) live web search.
const LOADING_MESSAGES = [
  'Reading your Substack…',
  'Figuring out your niche…',
  'Scanning the web for creators…',
  'Finding your best collaboration matches…',
];

// Turn an ISO date into a short "3d ago" style label.
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

// A newsletter's About page — where writers list contact info + the follow /
// message options. Substack has no public per-writer DM link, so this is the
// reliable place to reach out from.
function aboutUrl(url) {
  try {
    return new URL(url).origin + '/about';
  } catch {
    return url;
  }
}

export default function Home() {
  const [topic, setTopic] = useState('');
  const [results, setResults] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [upgrade, setUpgrade] = useState(false);
  const [searched, setSearched] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(0);
  const [sortBy, setSortBy] = useState('relevance');
  const [user, setUser] = useState(null);
  const [isMember, setIsMember] = useState(false);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved
  const hubHref = useHubHref();
  const headlineHref = useToolHref('headline');

  // Track login + membership (members see the Save button).
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      setUser(session?.user ?? null)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setIsMember(false);
      return;
    }
    let active = true;
    supabase
      .from('profiles')
      .select('is_subscribed')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (active) setIsMember(!!data?.is_subscribed);
      });
    return () => {
      active = false;
    };
  }, [user]);

  // Calls our OWN backend (/api/search) — never api.anthropic.com directly.
  async function runSearch(searchTopic) {
    const t = (searchTopic ?? topic).trim();
    if (!t || loading) return;

    setTopic(t);
    setLoading(true);
    setError('');
    setUpgrade(false);
    setResults([]);
    setSubmissions([]);
    setSearched(true);

    // Reflect the current topic in the URL so it can be copied/shared.
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `?topic=${encodeURIComponent(t)}`);
    }

    try {
      // Include the login token so the server knows if this is a member.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      const res = await fetch('/api/search', {
        method: 'POST',
        headers,
        body: JSON.stringify({ topic: t }),
      });
      const data = await res.json();

      // Approved creator submissions come back alongside the AI results
      // (and even on some error responses), so surface them either way.
      setSubmissions(data.submissions || []);
      if (!res.ok || data.error) {
        setError(data.error || 'Something went wrong. Please try again.');
        setUpgrade(!!data.upgrade);
      } else {
        setResults(data.results || []);
      }
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // If the page is opened with ?topic=... (a shared link), run that search.
  useEffect(() => {
    const shared = new URLSearchParams(window.location.search).get('topic');
    if (shared) {
      setTopic(shared);
      runSearch(shared);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While loading, cycle through the status messages every few seconds.
  useEffect(() => {
    if (!loading) {
      setLoadingMsg(0);
      return;
    }
    const id = setInterval(() => {
      setLoadingMsg((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 4000);
    return () => clearInterval(id);
  }, [loading]);

  function handleSubmit(e) {
    e.preventDefault();
    runSearch();
  }

  // Copy a shareable link for the current topic to the clipboard.
  async function copyShareLink() {
    const url = `${window.location.origin}${window.location.pathname}?topic=${encodeURIComponent(
      topic
    )}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available — quietly ignore.
    }
  }

  // Reset everything back to a blank slate.
  function clearAll() {
    setTopic('');
    setResults([]);
    setSubmissions([]);
    setError('');
    setSearched(false);
    setCopied(false);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }

  // Save the current search (members only) so it can be revisited later.
  async function saveSearch() {
    if (!user || !isMember || results.length === 0) return;
    setSaveState('saving');
    const { error: saveErr } = await supabase.from('saved_searches').insert({
      user_id: user.id,
      topic,
      results,
    });
    setSaveState(saveErr ? 'idle' : 'saved');
    if (!saveErr) setTimeout(() => setSaveState('idle'), 2500);
  }

  // When "Most recent post" is chosen, sort a copy by newest post first.
  const displayed =
    sortBy === 'recent'
      ? [...results].sort(
          (a, b) =>
            (b.lastPostAt ? Date.parse(b.lastPostAt) : 0) -
            (a.lastPostAt ? Date.parse(a.lastPostAt) : 0)
        )
      : results;

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-white px-4 py-12">
      <div className="mx-auto max-w-2xl">
        {/* Login / sign-up bar */}
        <div className="mb-6">
          <AuthBar />
        </div>

        <a
          href={hubHref}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-orange-600"
        >
          <ArrowLeft className="h-4 w-4" />
          All Stack Tools
        </a>

        {/* Heading */}
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900">
            Substack Finder
          </h1>
          <p className="mt-3 text-gray-600">
            Paste your Substack. Find the creators you should know and collaborate with.
          </p>
        </header>

        {/* Friendly prompt above the search field */}
        <p className="mb-3 text-center text-lg font-medium text-gray-800">
          Okay… who should I connect with?
        </p>

        {/* Search box with search-icon button */}
        <form onSubmit={handleSubmit} className="mb-5">
          <div className="flex items-center gap-2 rounded-2xl border border-orange-200 bg-white p-2 shadow-sm transition focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-200">
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Paste your Substack link (e.g. yourname.substack.com)…"
              className="flex-1 bg-transparent px-3 py-2 text-gray-900 placeholder-gray-400 outline-none"
            />
            <button
              type="submit"
              disabled={loading || !topic.trim()}
              className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 font-medium text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Users className="h-5 w-5" />
              <span className="hidden sm:inline">Match</span>
            </button>
          </div>
        </form>

        <div className="mb-8" />

        {/* Loading spinner */}
        {loading && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-orange-500">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="mt-1 text-sm font-medium text-gray-700">
              {LOADING_MESSAGES[loadingMsg]}
            </p>
            <p className="text-xs text-gray-400">
              Reading the live web — this can take a minute or two.
            </p>
          </div>
        )}

        {/* Daily-limit upsell (a nudge, not an error) */}
        {error && upgrade && !loading && (
          <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
            <div className="flex items-start gap-3 text-orange-800">
              <Sparkles className="mt-0.5 h-5 w-5 flex-shrink-0 text-orange-500" />
              <p className="text-sm">{error}</p>
            </div>
            <button
              onClick={() => window.dispatchEvent(new Event('open-membership'))}
              className="mt-3 w-full rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
            >
              See what Membership includes
            </button>
          </div>
        )}

        {/* Regular error banner */}
        {error && !upgrade && !loading && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Result cards */}
        {!loading && !error && results.length > 0 && (
          <>
            {/* Toolbar: current topic, sort control, and copyable share link */}
            <div className="mb-3 space-y-2">
              <p className="truncate text-sm text-gray-500">
                Collaboration matches for “{topic}”
              </p>
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-1.5 text-sm text-gray-600">
                  <ArrowUpDown className="h-4 w-4 text-gray-400" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700 outline-none focus:border-orange-400"
                  >
                    <option value="relevance">Most relevant</option>
                    <option value="recent">Most recent post</option>
                  </select>
                </label>
                <div className="flex flex-shrink-0 items-center gap-2">
                  {isMember && (
                    <button
                      onClick={saveSearch}
                      disabled={saveState !== 'idle'}
                      className="flex items-center gap-1.5 rounded-lg border border-orange-200 px-3 py-1.5 text-sm text-orange-700 transition hover:bg-orange-50 disabled:opacity-60"
                    >
                      {saveState === 'saved' ? (
                        <BookmarkCheck className="h-4 w-4" />
                      ) : (
                        <Bookmark className="h-4 w-4" />
                      )}
                      {saveState === 'saved' ? 'Saved' : 'Save'}
                    </button>
                  )}
                  <button
                    onClick={clearAll}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-50"
                  >
                    <X className="h-4 w-4" />
                    Clear all
                  </button>
                  <button
                    onClick={copyShareLink}
                    className="flex items-center gap-1.5 rounded-lg border border-orange-200 px-3 py-1.5 text-sm text-orange-700 transition hover:bg-orange-50"
                  >
                    {copied ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    {copied ? 'Copied!' : 'Copy link'}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {displayed.map((r, i) => (
                <div
                  key={i}
                  className="group rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md"
                >
                  {/* Collaboration match score */}
                  {Number.isFinite(Number(r.match)) && (
                    <span className="mb-2 inline-block rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                      {Math.round(Number(r.match))}% match
                    </span>
                  )}
                  {/* Newsletter name links to the newsletter */}
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
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
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 px-3 py-1.5 text-xs font-medium text-orange-700 transition hover:bg-orange-50"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      Contact
                    </a>
                  </div>
                  {r.latestPosts && r.latestPosts.length > 0 && (
                    <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-3">
                      {r.latestPosts.slice(0, 2).map((p, j) => {
                        const row = (
                          <>
                            <FileText className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                            <span className="truncate">{p.title}</span>
                            {p.date && (
                              <span className="ml-auto flex-shrink-0 text-gray-400">
                                {relativeTime(p.date)}
                              </span>
                            )}
                          </>
                        );
                        return p.link ? (
                          <a
                            key={j}
                            href={p.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-xs text-gray-500 transition hover:text-orange-600"
                          >
                            {row}
                          </a>
                        ) : (
                          <div
                            key={j}
                            className="flex items-center gap-2 text-xs text-gray-500"
                          >
                            {row}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Creator-submitted newsletters that match this topic (admin-approved) */}
        {!loading && submissions.length > 0 && (
          <div className="mt-8">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-orange-500" />
              <h3 className="text-sm font-semibold text-gray-700">
                Submitted by creators
              </h3>
            </div>
            <div className="space-y-4">
              {submissions.map((s, i) => (
                <div
                  key={i}
                  className="group rounded-2xl border border-orange-200 bg-orange-50/40 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md"
                >
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start justify-between gap-3"
                  >
                    <h2 className="text-lg font-semibold text-gray-900 group-hover:text-orange-600">
                      {s.name}
                    </h2>
                    <ExternalLink className="mt-1 h-4 w-4 flex-shrink-0 text-gray-400 group-hover:text-orange-500" />
                  </a>
                  {s.description && (
                    <p className="mt-2 text-sm text-gray-600">{s.description}</p>
                  )}
                  {s.tags && (
                    <span className="mt-3 inline-block rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-700">
                      {s.tags}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state after a search returns nothing */}
        {!loading &&
          !error &&
          searched &&
          results.length === 0 &&
          submissions.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-gray-600">No matches came back that time.</p>
              {/* Never imply their newsletter is the problem. The usual cause
                  is a hiccup on our side, and a retry normally fixes it. */}
              <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
                That is almost always a temporary hiccup on our side, not
                anything about your newsletter. Try again, or check the link
                points to your publication&rsquo;s home page.
              </p>
              <button
                onClick={() => runSearch()}
                className="mt-4 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
              >
                Try again
              </button>
            </div>
          )}

        {/* Cross-tool nudge — the same membership already covers this */}
        <a
          href={headlineHref}
          className="group mt-12 flex items-center gap-3 rounded-2xl border border-orange-200 bg-orange-50/50 p-4 transition hover:border-orange-300 hover:bg-orange-50"
        >
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
            <Wand2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 group-hover:text-orange-700">
              Also try the Headline Analyzer
            </p>
            <p className="text-xs text-gray-600">
              Score your next headline and get five stronger versions.
            </p>
          </div>
        </a>

        {/* Footer */}
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

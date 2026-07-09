'use client';

import { useState, useEffect } from 'react';
import {
  Search,
  ExternalLink,
  User,
  Loader2,
  AlertCircle,
  Copy,
  Check,
} from 'lucide-react';

// The "starter topic" pill buttons shown under the search box.
const STARTER_TOPICS = [
  'Anime',
  'Retail arbitrage',
  'Reselling on eBay',
  'Personal finance',
  'AI & tech',
  'Fragrance',
];

// Rotating status lines shown during the (slow) live web search.
const LOADING_MESSAGES = [
  'Searching the web for newsletters…',
  'Reading Substack pages…',
  'Checking which ones are still active…',
  'Picking the 6 best matches…',
];

export default function Home() {
  const [topic, setTopic] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(0);

  // Calls our OWN backend (/api/search) — never api.anthropic.com directly.
  async function runSearch(searchTopic) {
    const t = (searchTopic ?? topic).trim();
    if (!t || loading) return;

    setTopic(t);
    setLoading(true);
    setError('');
    setResults([]);
    setSearched(true);

    // Reflect the current topic in the URL so it can be copied/shared.
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `?topic=${encodeURIComponent(t)}`);
    }

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: t }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || 'Something went wrong. Please try again.');
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

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-white px-4 py-12">
      <div className="mx-auto max-w-2xl">
        {/* Heading */}
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900">
            Substack Finder
          </h1>
          <p className="mt-3 text-gray-600">
            Type a topic and discover real Substack newsletters worth reading.
          </p>
        </header>

        {/* Search box with search-icon button */}
        <form onSubmit={handleSubmit} className="mb-5">
          <div className="flex items-center gap-2 rounded-2xl border border-orange-200 bg-white p-2 shadow-sm transition focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-200">
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. personal finance, anime, fragrance…"
              className="flex-1 bg-transparent px-3 py-2 text-gray-900 placeholder-gray-400 outline-none"
            />
            <button
              type="submit"
              disabled={loading || !topic.trim()}
              className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 font-medium text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Search className="h-5 w-5" />
              <span className="hidden sm:inline">Search</span>
            </button>
          </div>
        </form>

        {/* Starter topic pills */}
        <div className="mb-8 flex flex-wrap justify-center gap-2">
          {STARTER_TOPICS.map((s) => (
            <button
              key={s}
              onClick={() => runSearch(s)}
              disabled={loading}
              className="rounded-full border border-orange-200 bg-white px-4 py-1.5 text-sm text-gray-700 transition hover:border-orange-400 hover:bg-orange-50 disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>

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

        {/* Error banner */}
        {error && !loading && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Result cards */}
        {!loading && !error && results.length > 0 && (
          <>
            {/* Toolbar: current topic + copyable share link */}
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="truncate text-sm text-gray-500">
                Results for “{topic}”
              </p>
              <button
                onClick={copyShareLink}
                className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-orange-200 px-3 py-1.5 text-sm text-orange-700 transition hover:bg-orange-50"
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {copied ? 'Copied!' : 'Copy link'}
              </button>
            </div>

            <div className="space-y-4">
              {results.map((r, i) => (
                <a
                  key={i}
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-lg font-semibold text-gray-900 group-hover:text-orange-600">
                      {r.name}
                    </h2>
                    <ExternalLink className="mt-1 h-4 w-4 flex-shrink-0 text-gray-400 group-hover:text-orange-500" />
                  </div>
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
                </a>
              ))}
            </div>
          </>
        )}

        {/* Empty state after a search returns nothing */}
        {!loading && !error && searched && results.length === 0 && (
          <p className="py-12 text-center text-gray-500">
            No newsletters found. Try a different topic.
          </p>
        )}
      </div>
    </main>
  );
}

'use client';

import { useState, useEffect } from 'react';
import {
  Wand2,
  Loader2,
  AlertCircle,
  Copy,
  Check,
  Sparkles,
  ArrowLeft,
  RefreshCw,
  Bookmark,
  BookmarkCheck,
} from 'lucide-react';
import AuthBar from '../AuthBar';
import { supabase } from '@/lib/supabase';
import { useHubHref } from '@/lib/links';

const MAX_HEADLINE_LENGTH = 200;

// Most email clients cut a subject line around here, so headlines longer than
// this get truncated in the inbox. Shown live, for free, with no AI call.
const INBOX_PREVIEW_CHARS = 60;

// Colour the score by how good it is — red / amber / green.
function scoreTone(score) {
  if (score >= 75) return { text: 'text-green-700', bg: 'bg-green-100', bar: 'bg-green-500' };
  if (score >= 50) return { text: 'text-amber-700', bg: 'bg-amber-100', bar: 'bg-amber-500' };
  return { text: 'text-red-700', bg: 'bg-red-100', bar: 'bg-red-500' };
}

export default function HeadlineAnalyzer() {
  const [headline, setHeadline] = useState('');
  const [context, setContext] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [upgrade, setUpgrade] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [user, setUser] = useState(null);
  const [isMember, setIsMember] = useState(false);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved
  const hubHref = useHubHref();

  const tooLong = headline.length > MAX_HEADLINE_LENGTH;

  // Track login + membership (members can save an analysis).
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

  async function analyze(e, override) {
    e?.preventDefault();
    const h = (override?.headline ?? headline).trim();
    const c = (override?.context ?? context).trim();
    if (!h || loading || h.length > MAX_HEADLINE_LENGTH) return;

    if (override) {
      setHeadline(h);
      setContext(c);
    }
    setLoading(true);
    setError('');
    setUpgrade(false);
    setResult(null);
    setSaveState('idle');

    try {
      // Include the login token so the server knows if this is a member.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      const res = await fetch('/api/headline', {
        method: 'POST',
        headers,
        body: JSON.stringify({ headline: h, context: c }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || 'Something went wrong. Please try again.');
        setUpgrade(!!data.upgrade);
      } else {
        setResult(data);
      }
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // Opened with ?h=… (a re-run from a saved analysis)? Run it straight away.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const h = params.get('h');
    if (h) analyze(null, { headline: h, context: params.get('c') || '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save this analysis (members only) so it can be revisited from the account
  // popup. Stores the full result, so the list can show the score without
  // paying for the analysis again.
  async function saveAnalysis() {
    if (!user || !isMember || !result) return;
    setSaveState('saving');
    const { error: saveErr } = await supabase.from('saved_headlines').insert({
      user_id: user.id,
      headline: headline.trim(),
      context: context.trim() || null,
      score: result.score,
      result,
    });
    setSaveState(saveErr ? 'idle' : 'saved');
    if (!saveErr) setTimeout(() => setSaveState('idle'), 2500);
  }

  // Copy a rewrite so it can be pasted straight into Substack.
  async function copyRewrite(text, i) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(i);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      // Clipboard not available — quietly ignore.
    }
  }

  // Load a rewrite back into the input so it can be scored in turn.
  function testRewrite(text) {
    setHeadline(text);
    setResult(null);
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const tone = result ? scoreTone(result.score) : null;

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
            Headline Analyzer
          </h1>
          <p className="mt-3 text-gray-600">
            Score your Substack headline, then get five stronger ways to write it.
          </p>
        </header>

        {/* Input */}
        <form onSubmit={analyze} className="mb-8">
          <div className="rounded-2xl border border-orange-200 bg-white p-4 shadow-sm transition focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-200">
            <input
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="Paste your headline…"
              className="w-full bg-transparent text-lg text-gray-900 placeholder-gray-400 outline-none"
            />

            {/* Free, instant feedback — no AI call needed for these */}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
              <span className={tooLong ? 'font-medium text-red-600' : ''}>
                {headline.length}/{MAX_HEADLINE_LENGTH} characters
              </span>
              <span>·</span>
              <span>
                {headline.trim() ? headline.trim().split(/\s+/).length : 0} words
              </span>
              {headline.length > INBOX_PREVIEW_CHARS && !tooLong && (
                <>
                  <span>·</span>
                  <span className="text-amber-600">
                    may get cut off in the inbox
                  </span>
                </>
              )}
            </div>

            {/* Keep this input at 16px (text-base): iOS Safari auto-zooms into
                any field smaller than that on focus, forcing a pinch back out. */}
            <div className="mt-3 border-t border-gray-100 pt-3">
              <input
                type="text"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Optional: what's the post actually about?"
                className="w-full bg-transparent text-base text-gray-700 placeholder-gray-400 outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !headline.trim() || tooLong}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 font-medium text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Wand2 className="h-5 w-5" />
            )}
            {loading ? 'Analysing…' : 'Analyse headline'}
          </button>
        </form>

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

        {/* Results */}
        {result && !loading && (
          <div className="space-y-6">
            {/* Score + verdict */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-5">
                <div
                  className={`flex h-20 w-20 flex-shrink-0 flex-col items-center justify-center rounded-full ${tone.bg}`}
                >
                  <span className={`text-2xl font-bold ${tone.text}`}>
                    {result.score}
                  </span>
                  <span className={`text-[10px] font-medium ${tone.text}`}>/ 100</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-500">Your headline</p>
                  <p className="mt-0.5 font-medium text-gray-900">“{headline.trim()}”</p>
                  {result.verdict && (
                    <p className="mt-2 text-sm text-gray-600">{result.verdict}</p>
                  )}
                </div>
              </div>

              {/* Members can keep an analysis to compare against later */}
              {isMember && (
                <button
                  onClick={saveAnalysis}
                  disabled={saveState !== 'idle'}
                  className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-orange-200 px-3 py-2 text-sm text-orange-700 transition hover:bg-orange-50 disabled:opacity-60"
                >
                  {saveState === 'saved' ? (
                    <BookmarkCheck className="h-4 w-4" />
                  ) : (
                    <Bookmark className="h-4 w-4" />
                  )}
                  {saveState === 'saved' ? 'Saved to your account' : 'Save this analysis'}
                </button>
              )}

              {/* Per-axis breakdown */}
              <div className="mt-6 space-y-3 border-t border-gray-100 pt-5">
                {result.breakdown.map((b) => (
                  <div key={b.label}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium text-gray-700">{b.label}</span>
                      <span className="text-xs text-gray-400">{b.score}/10</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full ${scoreTone(b.score * 10).bar}`}
                        style={{ width: `${b.score * 10}%` }}
                      />
                    </div>
                    {b.note && <p className="mt-1 text-xs text-gray-500">{b.note}</p>}
                  </div>
                ))}
              </div>
            </div>

            {/* Rewrites — the part people actually came for */}
            {result.rewrites.length > 0 && (
              <div>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Sparkles className="h-4 w-4 text-orange-500" />
                  Stronger versions
                </h2>
                {/* The model writes [X] rather than inventing a number it has
                    no way of knowing. Explain that, but only when it appears. */}
                {result.rewrites.some((r) => r.headline.includes('[X]')) && (
                  <p className="mb-3 text-xs text-gray-500">
                    <span className="font-medium text-gray-600">[X]</span> is a
                    placeholder — swap in your real number before publishing.
                  </p>
                )}
                <div className="space-y-3">
                  {result.rewrites.map((r, i) => (
                    <div
                      key={i}
                      className="group rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-orange-300 hover:shadow-md"
                    >
                      <p className="font-medium text-gray-900">{r.headline}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {r.angle && (
                          <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-700">
                            {r.angle}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">
                          {r.headline.length} chars
                        </span>
                        <div className="ml-auto flex items-center gap-2">
                          <button
                            onClick={() => testRewrite(r.headline)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 transition hover:bg-gray-50"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Score this
                          </button>
                          <button
                            onClick={() => copyRewrite(r.headline, i)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 px-2.5 py-1.5 text-xs font-medium text-orange-700 transition hover:bg-orange-50"
                          >
                            {copiedIndex === i ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                            {copiedIndex === i ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

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

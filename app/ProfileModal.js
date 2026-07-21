'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  X,
  Sparkles,
  CreditCard,
  CheckCircle2,
  Search,
  Trash2,
  Mail,
  Wand2,
} from 'lucide-react';
import { toolUrl } from '@/lib/links';

// "Email me these" — LIVE (Resend configured + send.stacktools.site verified).
const EMAIL_FEATURE_ENABLED = true;

// The tools under the Stack Tools umbrella. One subscription unlocks all of
// them, so each live tool shows Member/Free based on the shared status.
const STACK_TOOLS = [
  {
    name: 'Substack Finder',
    blurb: 'Paste your Substack. Find the creators you should know and collaborate with.',
    tool: 'finder',
    live: true,
  },
  {
    name: 'Headline Analyzer',
    blurb: 'Score your headline, then get five stronger ways to write it.',
    tool: 'headline',
    live: true,
  },
];

export default function ProfileModal({ open, onClose, user, subscribed, onSubscribe }) {
  const [saved, setSaved] = useState([]);
  const [savedHeadlines, setSavedHeadlines] = useState([]);
  const [loadingSaved, setLoadingSaved] = useState(false);

  // Load this member's saved searches and headlines whenever the popup opens.
  useEffect(() => {
    if (!open || !subscribed || !user) {
      setSaved([]);
      setSavedHeadlines([]);
      return;
    }
    let active = true;
    setLoadingSaved(true);

    Promise.all([
      supabase
        .from('saved_searches')
        .select('id, topic, created_at, email_optin')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('saved_headlines')
        .select('id, headline, context, score, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
    ]).then(([searches, headlines]) => {
      if (!active) return;
      setSaved(searches.data || []);
      // Stays empty if saved-headlines-table.sql hasn't been run yet, rather
      // than taking the whole popup down with it.
      setSavedHeadlines(headlines.data || []);
      setLoadingSaved(false);
    });

    return () => {
      active = false;
    };
  }, [open, subscribed, user]);

  async function removeSaved(id) {
    setSaved((s) => s.filter((x) => x.id !== id));
    await supabase.from('saved_searches').delete().eq('id', id);
  }

  async function removeSavedHeadline(id) {
    setSavedHeadlines((s) => s.filter((x) => x.id !== id));
    await supabase.from('saved_headlines').delete().eq('id', id);
  }

  // Re-run a saved headline in the Headline Analyzer.
  function runSavedHeadline(h) {
    const q = `?h=${encodeURIComponent(h.headline)}${
      h.context ? `&c=${encodeURIComponent(h.context)}` : ''
    }`;
    window.location.href = toolUrl('headline', q);
  }

  // Toggle the weekly "email me these" digest for a saved search.
  async function toggleEmail(s) {
    const next = !s.email_optin;
    setSaved((list) =>
      list.map((x) => (x.id === s.id ? { ...x, email_optin: next } : x))
    );
    await supabase.from('saved_searches').update({ email_optin: next }).eq('id', s.id);
  }

  // Re-run a saved search: navigate to ?topic=… which auto-runs it on load.
  // Must be an absolute URL to the Finder — this popup also renders inside the
  // Headline Analyzer, where "/" would resolve to that tool instead.
  function runSaved(topic) {
    window.location.href = toolUrl('finder', `?topic=${encodeURIComponent(topic)}`);
  }

  if (!open || !user) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-gray-100 bg-white p-6 shadow-2xl"
      >
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Your account</h2>
            <p className="text-sm text-gray-500">{user.email}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 hover:bg-gray-100"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {/* Overall membership */}
        <div
          className={`mb-5 flex items-center justify-between rounded-xl border p-4 ${
            subscribed
              ? 'border-green-200 bg-green-50'
              : 'border-orange-200 bg-orange-50'
          }`}
        >
          <div className="flex items-center gap-2">
            {subscribed ? (
              <Sparkles className="h-5 w-5 flex-shrink-0 text-green-600" />
            ) : (
              <CreditCard className="h-5 w-5 flex-shrink-0 text-orange-500" />
            )}
            <div>
              <p className="text-sm font-medium text-gray-900">
                {subscribed ? 'Stack Tools Member' : 'Free account'}
              </p>
              <p className="text-xs text-gray-500">
                {subscribed
                  ? 'One subscription unlocks every tool.'
                  : 'Upgrade once to unlock every tool.'}
              </p>
            </div>
          </div>
          {!subscribed && (
            <button
              onClick={onSubscribe}
              className="flex-shrink-0 rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-orange-600"
            >
              Upgrade
            </button>
          )}
        </div>

        {/* Per-tool status */}
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
          Your Stack Tools
        </p>
        <div className="space-y-2">
          {STACK_TOOLS.map((t) => (
            <div
              key={t.name}
              className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3"
            >
              <a
                href={toolUrl(t.tool)}
                className="group min-w-0 flex-1"
                title={`Open ${t.name}`}
              >
                <p className="text-sm font-medium text-gray-900 group-hover:text-orange-600">
                  {t.name}
                </p>
                <p className="text-xs text-gray-500">{t.blurb}</p>
              </a>
              {subscribed ? (
                <span className="flex flex-shrink-0 items-center gap-1 rounded-lg bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Member
                </span>
              ) : (
                <div className="flex flex-shrink-0 items-center gap-2">
                  <span className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
                    Free
                  </span>
                  <button
                    onClick={onSubscribe}
                    className="rounded-lg bg-orange-500 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-orange-600"
                  >
                    Upgrade
                  </button>
                </div>
              )}
            </div>
          ))}

          <div className="rounded-xl border border-dashed border-gray-200 p-3 text-center text-xs text-gray-400">
            More Stack Tools coming soon
          </div>
        </div>

        {/* Saved searches — members only */}
        {subscribed && (
          <div className="mt-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              Saved searches
            </p>
            {loadingSaved ? (
              <p className="px-1 text-sm text-gray-400">Loading…</p>
            ) : saved.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-200 p-3 text-center text-xs text-gray-400">
                No saved searches yet. Run a search and click “Save”.
              </p>
            ) : (
              <div className="space-y-2">
                {saved.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 p-3"
                  >
                    <button
                      onClick={() => runSaved(s.topic)}
                      title="Run this search"
                      className="flex min-w-0 items-center gap-2 text-left text-sm text-gray-800 transition hover:text-orange-600"
                    >
                      <Search className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                      <span className="truncate">{s.topic}</span>
                    </button>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      {EMAIL_FEATURE_ENABLED && (
                        <button
                          onClick={() => toggleEmail(s)}
                          title={
                            s.email_optin
                              ? 'Emailing these weekly — click to turn off'
                              : 'Email me these weekly'
                          }
                          className={`rounded-md p-1 transition ${
                            s.email_optin
                              ? 'text-orange-600'
                              : 'text-gray-400 hover:text-orange-600'
                          }`}
                        >
                          <Mail className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => removeSaved(s.id)}
                        aria-label="Delete saved search"
                        className="rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Saved headlines — members only */}
        {subscribed && (
          <div className="mt-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              Saved headlines
            </p>
            {loadingSaved ? (
              <p className="px-1 text-sm text-gray-400">Loading…</p>
            ) : savedHeadlines.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-200 p-3 text-center text-xs text-gray-400">
                No saved headlines yet. Analyse one and click “Save this analysis”.
              </p>
            ) : (
              <div className="space-y-2">
                {savedHeadlines.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 p-3"
                  >
                    <button
                      onClick={() => runSavedHeadline(h)}
                      title="Analyse this headline again"
                      className="flex min-w-0 items-center gap-2 text-left text-sm text-gray-800 transition hover:text-orange-600"
                    >
                      {Number.isFinite(Number(h.score)) && (
                        <span
                          className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                            h.score >= 75
                              ? 'bg-green-100 text-green-700'
                              : h.score >= 50
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {h.score}
                        </span>
                      )}
                      <span className="truncate">{h.headline}</span>
                    </button>
                    <button
                      onClick={() => removeSavedHeadline(h.id)}
                      aria-label="Delete saved headline"
                      className="flex-shrink-0 rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

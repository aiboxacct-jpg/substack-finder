'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { detectTool } from '@/lib/links';
import { Lightbulb, X, ChevronUp, Loader2, CheckCircle2, Trash2, RotateCcw } from 'lucide-react';

// Requests are per tool: the board on the Finder shows and collects Finder
// ideas only, likewise the Headline Analyzer. The hub shows the whole board
// with a tag on each row. Detected once per open from the page's location.
const TOOL_LABELS = {
  finder: 'Finder',
  headline: 'Headline',
  general: 'All tools',
};

// The public feature-request board, available on every page as a floating
// button. Visitors suggest ideas and upvote them; the most-wanted rise to the
// top. Shipped items stay visible, crossed out with a badge, because a public
// trail of "you asked, it shipped" is the whole point of building in public.
//
// The admin (recognised server-side by ADMIN_EMAIL) additionally sees Ship,
// Reopen and Delete controls on each row.

// Votes this browser has cast, so the arrow shows as spent across visits.
// The server keeps its own per-IP guard; this is the half that survives
// deploys.
const VOTED_KEY = 'stacktools_feature_votes';

function readVoted() {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(VOTED_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function rememberVote(id) {
  try {
    const v = readVoted();
    v.add(id);
    window.localStorage.setItem(VOTED_KEY, JSON.stringify([...v]));
  } catch {}
}

export default function FeatureRequests() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [voted, setVoted] = useState(new Set());
  const [tool, setTool] = useState('general');

  const load = useCallback(async (forTool) => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const headers = {};
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const res = await fetch(`/api/features?tool=${encodeURIComponent(forTool)}`, { headers });
      const data = await res.json();
      if (res.ok) {
        setItems(data.requests || []);
        setIsAdmin(!!data.isAdmin);
      }
    } catch {
      // Board unavailable; the modal shows its empty state.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = detectTool();
    setTool(t);
    setVoted(readVoted());
    setMsg('');
    load(t);
  }, [open, load]);

  async function addRequest(e) {
    e.preventDefault();
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    setMsg('');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const res = await fetch('/api/features', {
        method: 'POST',
        headers,
        body: JSON.stringify({ title: t, tool }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setMsg(data.error || 'Could not add that. Please try again.');
      } else {
        // Suggesting counts as your vote for it.
        rememberVote(data.request.id);
        setVoted(readVoted());
        setTitle('');
        setItems((list) => [...list, data.request]);
      }
    } catch {
      setMsg('Could not add that. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function vote(item) {
    if (voted.has(item.id) || item.status !== 'open') return;
    // Optimistic: count up and lock the arrow immediately.
    rememberVote(item.id);
    setVoted(readVoted());
    setItems((list) =>
      list.map((x) => (x.id === item.id ? { ...x, votes: x.votes + 1 } : x))
    );
    try {
      await fetch('/api/features/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      });
    } catch {
      // The optimistic bump stays; the server guard squares it away.
    }
  }

  async function adminAction(item, action) {
    // Optimistic, matching what the server will do.
    setItems((list) =>
      action === 'delete'
        ? list.filter((x) => x.id !== item.id)
        : list.map((x) =>
            x.id === item.id ? { ...x, status: action === 'ship' ? 'shipped' : 'open' } : x
          )
    );
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      await fetch('/api/admin/features', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ id: item.id, action }),
      });
    } catch {
      load(); // reconcile with the server if the action failed
    }
  }

  // Open ideas first (most votes at the top), then the shipped history.
  const sorted = [...items].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    return b.votes - a.votes;
  });

  return (
    <>
      {/* The floating button, on every page */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-orange-600"
      >
        <Lightbulb className="h-4 w-4" />
        <span className="hidden sm:inline">Feature requests</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl border border-gray-100 bg-white shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between p-5 pb-3">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
                  <Lightbulb className="h-4 w-4 text-orange-500" />
                  Feature requests
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  {tool === 'general'
                    ? 'Across all Stack Tools. Vote for what you want next; the most-wanted rise to the top.'
                    : `For the ${tool === 'finder' ? 'Substack Finder' : 'Headline Analyzer'}. Vote for what you want next; the most-wanted rise to the top.`}{' '}
                  Got an idea? Add it.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-md p-1 hover:bg-gray-100"
              >
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            {/* Suggest box. 16px input: iOS zooms into anything smaller. */}
            <form onSubmit={addRequest} className="flex gap-2 px-5 pb-3">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                placeholder="Suggest a feature…"
                className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-base text-gray-900 placeholder-gray-400 outline-none focus:border-orange-400"
              />
              <button
                type="submit"
                disabled={busy || title.trim().length < 3}
                className="flex-shrink-0 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
              </button>
            </form>
            {msg && <p className="px-5 pb-2 text-xs text-red-600">{msg}</p>}

            {/* The board */}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
              {loading ? (
                <div className="flex justify-center py-8 text-orange-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : sorted.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">
                  No requests yet. Yours could be the first.
                </p>
              ) : (
                <div className="space-y-2">
                  {sorted.map((item) => {
                    const shipped = item.status === 'shipped';
                    const hasVoted = voted.has(item.id);
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 rounded-xl border border-gray-200 p-3"
                      >
                        <button
                          onClick={() => vote(item)}
                          disabled={shipped || hasVoted}
                          title={
                            shipped
                              ? 'Shipped'
                              : hasVoted
                                ? 'You voted for this'
                                : 'Vote for this'
                          }
                          className={`flex h-10 w-8 flex-shrink-0 flex-col items-center justify-center rounded-lg border text-xs font-semibold transition ${
                            shipped
                              ? 'border-gray-100 text-gray-300'
                              : hasVoted
                                ? 'border-orange-300 bg-orange-50 text-orange-600'
                                : 'border-gray-200 text-gray-600 hover:border-orange-300 hover:text-orange-600'
                          }`}
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                          {item.votes}
                        </button>

                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm ${
                              shipped ? 'text-gray-400 line-through' : 'text-gray-800'
                            }`}
                          >
                            {item.title}
                          </p>
                          {/* On the hub the whole board is visible, so say
                              which tool each idea belongs to. On a tool page
                              every row is that tool, so the tag is noise. */}
                          {tool === 'general' && item.tool && (
                            <span className="mt-0.5 inline-block rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                              {TOOL_LABELS[item.tool] || item.tool}
                            </span>
                          )}
                        </div>

                        {shipped && (
                          <span className="flex flex-shrink-0 items-center gap-1 rounded-md bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                            <CheckCircle2 className="h-3 w-3" />
                            Shipped
                          </span>
                        )}

                        {isAdmin && (
                          <div className="flex flex-shrink-0 items-center gap-1">
                            {shipped ? (
                              <button
                                onClick={() => adminAction(item, 'reopen')}
                                title="Reopen"
                                className="rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-orange-600"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </button>
                            ) : (
                              <button
                                onClick={() => adminAction(item, 'ship')}
                                title="Mark as shipped"
                                className="rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-green-600"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              onClick={() => adminAction(item, 'delete')}
                              title="Delete"
                              className="rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-red-500"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, RefreshCw, Heart, ExternalLink, Check, Undo2 } from 'lucide-react';

// Every reply people left on our live Notes and posts, newest first.

function ago(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function RepliesFeed() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(false);

  async function authHeader() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token || ''}` };
  }

  async function load() {
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/admin/replies', { headers: await authHeader() });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not load replies.');
      setData(d);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  // Save (or clear, with method DELETE) a manual mark, then patch the row in place.
  async function mark(r, method, payload = {}) {
    setErr('');
    try {
      const res = await fetch('/api/admin/replies', {
        method,
        headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment_id: r.id, ...payload }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not save.');
      setData((cur) => ({
        ...cur,
        replies: cur.replies.map((x) => {
          if (x.id !== r.id) return x;
          if (method === 'DELETE') {
            return { ...x, manual: null, answered: x.autoAnswered, replyUrl: x.autoAnswered ? x.autoReplyUrl : null };
          }
          const m = d.mark;
          return {
            ...x,
            manual: m,
            answered: m.answered,
            replyUrl: m.reply_url || (m.answered ? x.autoReplyUrl : null),
          };
        }),
      }));
      return true;
    } catch (e) {
      setErr(e.message);
      return false;
    }
  }

  const list = (data?.replies || []).filter((r) => !onlyOpen || !r.answered);
  const open = (data?.replies || []).filter((r) => !r.answered).length;

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-500">
          {data
            ? `${data.replies.length} replies across ${data.checked} live Notes and posts · ${open} not answered yet`
            : 'Checking Substack for replies…'}
        </p>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
            Not answered only
          </label>
          <button onClick={load} disabled={busy} title="Refresh" className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>}
      {data?.marksReady === false && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Manual marks are off until the reply_status table exists. Run reply-status-table.sql in Supabase.
        </p>
      )}

      {!data && busy ? (
        <div className="flex justify-center py-10 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : list.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400">
          {data ? 'No replies to show yet.' : ''}
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((r) => (
            <li key={r.id} className="rounded-xl border border-gray-200 bg-white p-3">
              <div className="flex items-start gap-3">
                {r.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.photo} alt="" className="h-8 w-8 flex-shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="h-8 w-8 flex-shrink-0 rounded-full bg-gray-100" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 text-xs">
                    <span className="font-medium text-gray-900">{r.name}</span>
                    {r.handle && <span className="text-gray-400">@{r.handle}</span>}
                    <span className="text-gray-400">{ago(r.date)}</span>
                    {r.answered ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-green-700">
                        Answered{r.manual ? ' · marked' : ''}
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700">
                        Needs reply{r.manual ? ' · marked' : ''}
                      </span>
                    )}
                    {r.likes > 0 && (
                      <span className="flex items-center gap-0.5 text-gray-400">
                        <Heart className="h-3 w-3" /> {r.likes}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-line text-sm text-gray-800">{r.body}</p>
                  <p className="mt-1.5 text-xs text-gray-400">
                    on {r.on.kind}: {r.on.title}
                    {' · '}
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-orange-600 hover:underline">
                      reply on Substack <ExternalLink className="h-3 w-3" />
                    </a>
                    {r.answered && r.replyUrl && (
                      <>
                        {' · '}
                        <a href={r.replyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-green-700 hover:underline">
                          our reply <ExternalLink className="h-3 w-3" />
                        </a>
                      </>
                    )}
                  </p>
                  <MarkControls r={r} disabled={data?.marksReady === false} onMark={mark} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Per-reply "Mark answered" (with an optional link to our reply), undo, and
// "use auto" to drop the manual mark and go back to auto-detection.
function MarkControls({ r, disabled, onMark }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);

  async function run(method, payload) {
    setSaving(true);
    const ok = await onMark(r, method, payload);
    setSaving(false);
    if (ok) {
      setOpen(false);
      setUrl('');
    }
  }

  const btn =
    'inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50';

  if (open) {
    return (
      <form
        className="mt-2 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run('POST', { answered: true, reply_url: url });
        }}
      >
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Link to our reply (optional)"
          className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1 text-xs focus:border-orange-400 focus:outline-none"
          autoFocus
        />
        <button type="submit" disabled={saving} className="inline-flex items-center gap-1 rounded-lg bg-orange-600 px-2 py-1 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-50">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
        </button>
        <button type="button" onClick={() => setOpen(false)} className={btn}>
          Cancel
        </button>
      </form>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {r.answered ? (
        <button type="button" disabled={disabled || saving} onClick={() => run('POST', { answered: false })} className={btn}>
          <Undo2 className="h-3 w-3" /> Mark not answered
        </button>
      ) : (
        <button type="button" disabled={disabled || saving} onClick={() => setOpen(true)} className={btn}>
          <Check className="h-3 w-3" /> Mark answered
        </button>
      )}
      {r.manual && (
        <button type="button" disabled={disabled || saving} onClick={() => run('DELETE')} className="text-xs text-gray-400 hover:text-gray-600 hover:underline disabled:opacity-50">
          use auto-detect
        </button>
      )}
    </div>
  );
}

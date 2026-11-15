'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, RefreshCw, Heart, ExternalLink } from 'lucide-react';

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

  async function load() {
    setBusy(true);
    setErr('');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/replies', {
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      });
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
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-green-700">Answered</span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700">Needs reply</span>
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
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

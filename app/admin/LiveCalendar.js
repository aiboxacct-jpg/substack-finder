'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, Plus, Pencil, Trash2, X, RefreshCw } from 'lucide-react';

// Live content calendar backed by the content_calendar table. Every Note,
// reply, and post gets one row; add and edit here and it's saved right away.

const STATUSES = [
  { id: 'scheduled', label: 'Scheduled', style: 'bg-blue-100 text-blue-700' },
  { id: 'approved', label: 'Approved', style: 'bg-purple-100 text-purple-700' },
  { id: 'draft', label: 'Draft', style: 'bg-amber-100 text-amber-700' },
  { id: 'idea', label: 'Idea', style: 'bg-gray-100 text-gray-500' },
  { id: 'live', label: 'Live', style: 'bg-green-100 text-green-700' },
];
const KINDS = [
  { id: 'note', label: 'Note' },
  { id: 'reply', label: 'Reply' },
  { id: 'post', label: 'Post' },
  { id: 'build', label: 'Build' },
];
const EMPTY = {
  kind: 'note',
  status: 'draft',
  title: '',
  body: '',
  link: '',
  campaign: '',
  scheduled_for: '',
  notes: '',
};

async function authed(method, body) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch('/api/admin/calendar', {
    method,
    headers: {
      Authorization: `Bearer ${session?.access_token || ''}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

function fmtDay(v) {
  if (!v) return null;
  const d = new Date(v.length === 10 ? `${v}T12:00:00` : v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function sortKey(item) {
  // Upcoming first by planned date; live items newest first.
  if (item.status === 'live') return -new Date(item.posted_at || item.created_at).getTime();
  return item.scheduled_for ? new Date(item.scheduled_for).getTime() : Number.MAX_SAFE_INTEGER;
}

function Editor({ initial, onCancel, onSaved }) {
  const [f, setF] = useState({ ...EMPTY, ...initial });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const payload = {};
      for (const k of Object.keys(EMPTY)) payload[k] = f[k] ?? '';
      const { item } = f.id
        ? await authed('PATCH', { id: f.id, ...payload })
        : await authed('POST', payload);
      onSaved(item);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  const input =
    'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400';
  return (
    <form onSubmit={save} className="space-y-2 rounded-xl border border-orange-200 bg-orange-50/40 p-4">
      <div className="flex gap-2">
        <select value={f.kind} onChange={set('kind')} className={`${input} w-28`}>
          {KINDS.map((k) => (
            <option key={k.id} value={k.id}>{k.label}</option>
          ))}
        </select>
        <select value={f.status} onChange={set('status')} className={`${input} w-32`}>
          {STATUSES.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        <input type="date" value={f.scheduled_for || ''} onChange={set('scheduled_for')} className={`${input} w-40`} title="Planned day" />
      </div>
      <input required placeholder="Title (short label)" value={f.title} onChange={set('title')} className={input} />
      <textarea placeholder="Draft text (optional)" rows={3} value={f.body || ''} onChange={set('body')} className={input} />
      <div className="flex gap-2">
        <input placeholder="Live link (https://…)" value={f.link || ''} onChange={set('link')} className={input} />
        <input placeholder="Campaign tag" value={f.campaign || ''} onChange={set('campaign')} className={`${input} w-44`} />
      </div>
      <input placeholder="Notes (approved by, results…)" value={f.notes || ''} onChange={set('notes')} className={input} />
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
          Cancel
        </button>
        <button type="submit" disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Save
        </button>
      </div>
    </form>
  );
}

function Row({ item, onEdit, onDelete }) {
  const s = STATUSES.find((x) => x.id === item.status) || STATUSES[2];
  const kind = KINDS.find((k) => k.id === item.kind)?.label || item.kind;
  const when =
    item.status === 'live' ? fmtDay(item.posted_at) : fmtDay(item.scheduled_for);
  const meta = [kind, when, item.campaign && `#${item.campaign}`, item.notes].filter(Boolean);
  return (
    <li className="group flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-3">
      <span className={`mt-0.5 flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${s.style}`}>
        {s.label}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900">{item.title}</p>
        <p className="mt-0.5 text-xs text-gray-500">
          {meta.join(' · ')}
          {item.link && (
            <>
              {' · '}
              <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">
                open →
              </a>
            </>
          )}
        </p>
        {item.body && <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-gray-400">{item.body}</p>}
      </div>
      <div className="flex flex-shrink-0 gap-1">
        <button onClick={() => onEdit(item)} title="Edit" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
          <Pencil className="h-4 w-4" />
        </button>
        <button onClick={() => onDelete(item)} title="Delete" className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

export default function LiveCalendar() {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null); // null | {} (new) | item
  const [filter, setFilter] = useState('all');

  async function load() {
    setErr('');
    try {
      const d = await authed('GET');
      setItems(d.items || []);
    } catch (e) {
      setErr(e.message);
      setItems([]);
    }
  }
  useEffect(() => {
    load();
  }, []);

  function saved(item) {
    setItems((cur) => [item, ...(cur || []).filter((x) => x.id !== item.id)]);
    setEditing(null);
  }
  async function remove(item) {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    try {
      await authed('DELETE', { id: item.id });
      setItems((cur) => cur.filter((x) => x.id !== item.id));
    } catch (e) {
      setErr(e.message);
    }
  }

  const groups = useMemo(() => {
    const list = (items || []).filter((i) => filter === 'all' || i.kind === filter);
    return STATUSES.map((s) => ({
      ...s,
      items: list.filter((i) => i.status === s.id).sort((a, b) => sortKey(a) - sortKey(b)),
    })).filter((g) => g.items.length);
  }, [items, filter]);

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {[{ id: 'all', label: 'All' }, ...KINDS].map((k) => (
            <button
              key={k.id}
              onClick={() => setFilter(k.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                filter === k.id ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={load} title="Refresh" className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 hover:bg-gray-50">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => setEditing({})}
            className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </div>

      {err && (
        <p className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {err}
          <button onClick={() => setErr('')}><X className="h-3.5 w-3.5" /></button>
        </p>
      )}

      {editing && !editing.id && <Editor initial={editing} onCancel={() => setEditing(null)} onSaved={saved} />}

      {items === null ? (
        <div className="flex justify-center py-10 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400">Nothing here yet. Add the first Note.</p>
      ) : (
        groups.map((g) => (
          <section key={g.id}>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              {g.label} · {g.items.length}
            </p>
            <ul className="space-y-2">
              {g.items.map((item) =>
                editing?.id === item.id ? (
                  <li key={item.id}>
                    <Editor initial={item} onCancel={() => setEditing(null)} onSaved={saved} />
                  </li>
                ) : (
                  <Row key={item.id} item={item} onEdit={setEditing} onDelete={remove} />
                )
              )}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

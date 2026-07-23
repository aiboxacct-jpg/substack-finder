'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Users,
  Sparkles,
  ShieldAlert,
  Loader2,
  Lock,
  LogOut,
  Search,
  RefreshCw,
} from 'lucide-react';

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// How a run turned out, at a glance. The point of this column is to spot the
// bad rows instantly instead of inferring failures from timestamps.
const OUTCOMES = {
  ok: { label: 'OK', style: 'bg-green-100 text-green-700' },
  ok_retry: { label: 'OK (retry)', style: 'bg-lime-100 text-lime-700' },
  cached: { label: 'Cached', style: 'bg-gray-100 text-gray-600' },
  failed: { label: 'No results', style: 'bg-red-100 text-red-700' },
  error: { label: 'Error', style: 'bg-red-100 text-red-700' },
};

function OutcomeBadge({ outcome, count }) {
  // Null means either "logged before this column existed" or, for a recent
  // row, a run that never finished — worth showing rather than hiding.
  if (!outcome) {
    return <span className="text-xs text-gray-300">—</span>;
  }
  const o = OUTCOMES[outcome] || { label: outcome, style: 'bg-gray-100 text-gray-600' };
  return (
    <span className="flex items-center gap-1.5">
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${o.style}`}>
        {o.label}
      </span>
      {Number.isFinite(Number(count)) && Number(count) > 0 && (
        <span className="text-xs text-gray-400">{count}</span>
      )}
    </span>
  );
}

export default function AdminPage() {
  const [status, setStatus] = useState('loading'); // loading | needlogin | denied | error | ready
  const [data, setData] = useState(null);
  const [searches, setSearches] = useState([]);
  const [searchesBusy, setSearchesBusy] = useState(false);

  // Login form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState('');

  async function load() {
    setStatus('loading');
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setStatus('needlogin');
      return;
    }
    const res = await fetch('/api/admin/users', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.status === 401) {
      setStatus('needlogin');
      return;
    }
    if (res.status === 403) {
      setStatus('denied');
      return;
    }
    if (!res.ok) {
      setStatus('error');
      return;
    }
    setData(await res.json());
    setStatus('ready');
    loadSearches();
  }

  async function loadSearches() {
    setSearchesBusy(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/admin/searches', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setSearches(d.searches || []);
      }
    } finally {
      setSearchesBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(e) {
    e.preventDefault();
    setLoginBusy(true);
    setLoginError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoginBusy(false);
    if (error) {
      setLoginError(error.message);
      return;
    }
    load();
  }

  async function logout() {
    await supabase.auth.signOut();
    setData(null);
    setStatus('needlogin');
  }

  if (status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </main>
    );
  }

  if (status === 'needlogin') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <form
          onSubmit={login}
          className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-sm"
        >
          <div className="mb-5 text-center">
            <Lock className="mx-auto mb-2 h-7 w-7 text-gray-400" />
            <h1 className="text-lg font-semibold text-gray-900">Admin login</h1>
            <p className="mt-1 text-sm text-gray-500">Stack Tools admin only.</p>
          </div>
          <input
            type="email"
            required
            placeholder="admin email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
          />
          <input
            type="password"
            required
            placeholder="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
          />
          {loginError && <p className="mb-3 text-xs text-red-600">{loginError}</p>}
          <button
            type="submit"
            disabled={loginBusy}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-orange-600 disabled:opacity-50"
          >
            {loginBusy && <Loader2 className="h-4 w-4 animate-spin" />}
            Log in
          </button>
        </form>
      </main>
    );
  }

  if (status === 'denied') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-gray-400" />
          <h1 className="text-lg font-semibold text-gray-900">Access denied</h1>
          <p className="mt-2 text-sm text-gray-500">
            You&apos;re logged in, but this account isn&apos;t the Stack Tools
            admin.
          </p>
          <button
            onClick={logout}
            className="mt-4 inline-block rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-600"
          >
            Log out &amp; use admin account
          </button>
        </div>
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-600">
        Something went wrong loading the dashboard.
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Stack Tools — Admin</h1>
            <p className="mt-1 text-sm text-gray-500">
              Signups, subscriptions &amp; match searches.
            </p>
          </div>
          <button
            onClick={logout}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>

        {/* Summary cards */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2 text-gray-500">
              <Users className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Total</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-gray-900">{data.total}</p>
          </div>
          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <div className="flex items-center gap-2 text-green-700">
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Members</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-green-700">{data.members}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Free
            </span>
            <p className="mt-1 text-2xl font-bold text-gray-900">{data.free}</p>
          </div>
        </div>

        {/* Users table */}
        <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 text-gray-900">{u.email || '—'}</td>
                  <td className="px-4 py-3">
                    {u.is_subscribed ? (
                      <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                        Member
                      </span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                        Free
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{fmtDate(u.created_at)}</td>
                </tr>
              ))}
              {data.users.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                    No signups yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Match searches */}
        <div className="mt-10">
          <div className="mb-1 flex items-center gap-2">
            <Search className="h-5 w-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900">Tool usage</h2>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
              {searches.length}
            </span>
            <button
              onClick={loadSearches}
              disabled={searchesBusy}
              title="Refresh tool usage"
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${searchesBusy ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
          <p className="mb-3 text-xs text-gray-400">
            What people are running through each tool (most recent first).
          </p>

          {searches.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-400">
              No usage yet.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Tool</th>
                    <th className="px-4 py-3 font-medium">Input</th>
                    <th className="px-4 py-3 font-medium">Result</th>
                    <th className="px-4 py-3 font-medium">By</th>
                    <th className="px-4 py-3 font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {searches.map((s, i) => (
                    <tr key={i} className="border-b border-gray-100 last:border-0">
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                          {s.tool === 'headline' ? 'Headline' : 'Finder'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-900">
                        <span className="break-all">{s.topic}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <OutcomeBadge outcome={s.outcome} count={s.result_count} />
                      </td>
                      <td className="px-4 py-3 text-gray-500">{s.email || 'anonymous'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                        {fmtDateTime(s.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

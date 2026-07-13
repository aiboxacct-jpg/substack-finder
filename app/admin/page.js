'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Users, Sparkles, ShieldAlert, Loader2, Lock, LogOut } from 'lucide-react';

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

export default function AdminPage() {
  const [status, setStatus] = useState('loading'); // loading | needlogin | denied | error | ready
  const [data, setData] = useState(null);

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
            <p className="mt-1 text-sm text-gray-500">Signups &amp; subscription status.</p>
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
      </div>
    </main>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { LogIn, LogOut, User, X, Loader2 } from 'lucide-react';

// A small login/sign-up bar. Shows the logged-in email + Log out when signed
// in; a "Log in / Sign up" button that opens an email+password form otherwise.
export default function AuthBar() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // Track the current session and keep it in sync.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signUp() {
    setBusy(true);
    setMsg('');
    const { data, error } = await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) {
      setMsg(error.message);
    } else if (!data.session) {
      // Email confirmation is on — no session until they click the email link.
      setMsg('Account created! Check your email to confirm, then log in here.');
    } else {
      // Confirmation off — signed in immediately.
      setOpen(false);
    }
  }

  async function signIn(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMsg(error.message);
    else {
      setMsg('');
      setOpen(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  // Avoid a flash of the wrong state before the session loads.
  if (!ready) return <div className="h-9" />;

  if (user) {
    return (
      <div className="flex items-center justify-end gap-3 text-sm">
        <span className="flex items-center gap-1.5 text-gray-600">
          <User className="h-4 w-4 text-gray-400" />
          {user.email}
        </span>
        <button
          onClick={signOut}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-gray-700 transition hover:bg-gray-50"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-end">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-orange-200 px-3 py-1.5 text-sm text-orange-700 transition hover:bg-orange-50"
        >
          <LogIn className="h-4 w-4" />
          Log in / Sign up
        </button>
      ) : (
        <form
          onSubmit={signIn}
          className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-800">
              Log in or sign up
            </span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close">
              <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
            </button>
          </div>
          <input
            type="email"
            required
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="password (min 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
          />
          {msg && <p className="mb-2 text-xs text-red-600">{msg}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-orange-600 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Log in
            </button>
            <button
              type="button"
              onClick={signUp}
              disabled={busy}
              className="flex-1 rounded-lg border border-orange-300 px-3 py-2 text-sm font-medium text-orange-700 transition hover:bg-orange-50 disabled:opacity-50"
            >
              Sign up
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

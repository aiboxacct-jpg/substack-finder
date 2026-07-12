'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { LogIn, LogOut, User, X, Loader2 } from 'lucide-react';

// A small login/sign-up bar. Logged in: shows email + Log out. Logged out:
// a "Log in / Sign up" button that opens a centered popup with the form.
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

  function closeModal() {
    setOpen(false);
    setMsg('');
  }

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
      closeModal();
    }
  }

  async function signIn(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMsg(error.message);
    else closeModal();
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  // Avoid a flash of the wrong state before the session loads.
  if (!ready) return <div className="h-9" />;

  return (
    <>
      {/* The bar itself */}
      {user ? (
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
      ) : (
        <div className="flex items-center justify-end">
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-orange-200 px-3 py-1.5 text-sm text-orange-700 transition hover:bg-orange-50"
          >
            <LogIn className="h-4 w-4" />
            Log in / Sign up
          </button>
        </div>
      )}

      {/* Centered popup with the form */}
      {open && !user && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeModal}
        >
          <form
            onSubmit={signIn}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">
                Log in or sign up
              </h2>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close"
                className="rounded-md p-1 hover:bg-gray-100"
              >
                <X className="h-4 w-4 text-gray-500" />
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

            {msg && <p className="mb-3 text-xs text-gray-600">{msg}</p>}

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
        </div>
      )}
    </>
  );
}

'use client';

import {
  Sparkles,
  X,
  Check,
  Search,
  Bookmark,
  Mail,
  Rocket,
  Loader2,
  LogIn,
} from 'lucide-react';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

// The "here's what you get" upsell. Opened from the Subscribe button, a
// discoverable "Membership" link, and when a free user hits their daily limit.
// One subscription unlocks paid features across every Stack Tool.
export default function MembershipModal({
  open,
  onClose,
  loggedIn,
  subscribed,
  onUpgrade,
  onLoginRequest,
}) {
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authMsg, setAuthMsg] = useState('');
  if (!open) return null;

  async function handleUpgrade() {
    setBusy(true);
    try {
      await onUpgrade();
    } finally {
      setBusy(false);
    }
  }

  function validCreds() {
    if (!email || password.length < 6) {
      setAuthMsg('Enter an email and a password (at least 6 characters).');
      return false;
    }
    return true;
  }

  // Free signup: just create the account.
  async function freeSignUp() {
    setAuthMsg('');
    if (!validCreds()) return;
    setAuthBusy(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    setAuthBusy(false);
    if (error) setAuthMsg(error.message);
    else if (!data.session)
      setAuthMsg('Account created! Check your email to confirm, then sign in.');
  }

  // Paid signup: create the account, then head to checkout. If email
  // confirmation is required, we flag the intent so checkout resumes
  // automatically once they confirm and sign in.
  async function paidSignUp() {
    setAuthMsg('');
    if (!validCreds()) return;
    setAuthBusy(true);
    // Record the paid intent ON THE ACCOUNT (user metadata) so checkout resumes
    // once they confirm their email or sign in — on any device, any time.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { wants_paid: true } },
    });
    setAuthBusy(false);
    if (error) {
      setAuthMsg(error.message);
    } else if (!data.session) {
      setAuthMsg(
        "Account created! Check your email to confirm — then you'll be taken straight to checkout."
      );
    } else {
      onUpgrade();
    }
  }

  async function signIn() {
    setAuthMsg('');
    if (!email || !password) {
      setAuthMsg('Enter your email and password.');
      return;
    }
    setAuthBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setAuthBusy(false);
    if (error) {
      setAuthMsg(error.message);
      return;
    }
    // Signed in — the modal re-renders to the logged-in "Upgrade" state, and if
    // this account intended to go paid, AuthBar resumes checkout automatically.
  }

  const perks = [
    {
      icon: Search,
      title: 'Unlimited searches',
      desc: 'No daily limit — search as much as you want.',
    },
    {
      icon: Bookmark,
      title: 'Save your searches',
      desc: 'Bookmark searches and re-run them anytime.',
    },
    {
      icon: Mail,
      title: 'Email me these (coming soon)',
      desc: 'Get fresh newsletters for your saved topics in your inbox.',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative bg-gradient-to-br from-orange-500 to-orange-400 px-6 py-5 text-white">
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 rounded-md p-1 text-white/80 transition hover:bg-white/20 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            <h2 className="text-lg font-bold">Stack Tools Membership</h2>
          </div>
          <p className="mt-1 text-sm font-semibold text-white/90">
            One subscription. Unlimited everything.
          </p>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-3xl font-extrabold">$9.99</span>
            <span className="text-sm font-semibold text-white/90">/month</span>
          </div>
        </div>

        {/* Perks */}
        <div className="px-6 py-5">
          {/* Headline perk — one membership unlocks everything */}
          <div className="mb-4 rounded-xl border-2 border-orange-300 bg-gradient-to-br from-orange-50 to-white p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-orange-500">
                <Rocket className="h-4 w-4 text-white" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-gray-900">
                    Every Stack Tool included
                  </p>
                  <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    Best value
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-gray-600">
                  One membership unlocks{' '}
                  <span className="font-semibold text-orange-700">
                    all current &amp; future Stack Tools
                  </span>{' '}
                  — pay once, get everything.
                </p>
              </div>
            </div>
          </div>

          <ul className="space-y-3">
            {perks.map((p, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-100">
                  <Check className="h-3.5 w-3.5 text-orange-600" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{p.title}</p>
                  <p className="text-xs text-gray-500">{p.desc}</p>
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-center text-xs text-gray-500">
            Free plan: 3 searches per day, no saving. Cancel anytime.
          </p>

          {/* CTA depends on where the visitor is in the funnel */}
          <div className="mt-4">
            {subscribed ? (
              <div className="flex items-center justify-center gap-1.5 rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
                <Sparkles className="h-4 w-4" />
                You&apos;re a member — thank you!
              </div>
            ) : loggedIn ? (
              <button
                onClick={handleUpgrade}
                disabled={busy}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-orange-600 disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Upgrade to Member — $9.99/mo
              </button>
            ) : (
              <div className="space-y-2">
                <input
                  type="email"
                  placeholder="you@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
                />
                <input
                  type="password"
                  placeholder="password (min 6 characters)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
                />

                {authMsg && <p className="text-xs text-gray-600">{authMsg}</p>}

                <button
                  onClick={paidSignUp}
                  disabled={authBusy}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-orange-600 disabled:opacity-60"
                >
                  {authBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Sign up to become a paid member
                </button>
                <button
                  onClick={freeSignUp}
                  disabled={authBusy}
                  className="w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-orange-600 disabled:opacity-60"
                >
                  FREE sign up!
                </button>
                <button
                  onClick={signIn}
                  disabled={authBusy}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-orange-300 px-4 py-2.5 text-sm font-medium text-orange-700 transition hover:bg-orange-50 disabled:opacity-60"
                >
                  <LogIn className="h-4 w-4" />
                  Already have an account? Sign in
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

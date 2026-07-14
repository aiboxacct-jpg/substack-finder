'use client';

import { Sparkles, X, Check, Search, Bookmark, Mail, Rocket, Loader2 } from 'lucide-react';
import { useState } from 'react';

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
  if (!open) return null;

  async function handleUpgrade() {
    setBusy(true);
    try {
      await onUpgrade();
    } finally {
      setBusy(false);
    }
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
          <p className="mt-1 text-sm text-white/90">
            One subscription. Unlimited everything.
          </p>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-3xl font-extrabold">$9.99</span>
            <span className="text-sm text-white/90">/month</span>
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
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Upgrade to Member — $9.99/mo
              </button>
            ) : (
              <button
                onClick={() => {
                  onClose();
                  onLoginRequest && onLoginRequest();
                }}
                className="w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
              >
                Sign up to become a member
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

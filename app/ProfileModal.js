'use client';

import { X, Sparkles, CreditCard, CheckCircle2 } from 'lucide-react';

// The tools under the Stack Tools umbrella. One subscription unlocks all of
// them, so each live tool shows Member/Free based on the shared status.
const STACK_TOOLS = [
  {
    name: 'Substack Finder',
    blurb: 'Discover real Substack newsletters on any topic.',
    live: true,
  },
];

export default function ProfileModal({ open, onClose, user, subscribed, onSubscribe }) {
  if (!open || !user) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-6 shadow-2xl"
      >
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Your account</h2>
            <p className="text-sm text-gray-500">{user.email}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 hover:bg-gray-100"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {/* Overall membership */}
        <div
          className={`mb-5 flex items-center justify-between rounded-xl border p-4 ${
            subscribed
              ? 'border-green-200 bg-green-50'
              : 'border-orange-200 bg-orange-50'
          }`}
        >
          <div className="flex items-center gap-2">
            {subscribed ? (
              <Sparkles className="h-5 w-5 flex-shrink-0 text-green-600" />
            ) : (
              <CreditCard className="h-5 w-5 flex-shrink-0 text-orange-500" />
            )}
            <div>
              <p className="text-sm font-medium text-gray-900">
                {subscribed ? 'Stack Tools Member' : 'Free account'}
              </p>
              <p className="text-xs text-gray-500">
                {subscribed
                  ? 'One subscription unlocks every tool.'
                  : 'Upgrade once to unlock every tool.'}
              </p>
            </div>
          </div>
          {!subscribed && (
            <button
              onClick={onSubscribe}
              className="flex-shrink-0 rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-orange-600"
            >
              Upgrade
            </button>
          )}
        </div>

        {/* Per-tool status */}
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
          Your Stack Tools
        </p>
        <div className="space-y-2">
          {STACK_TOOLS.map((t) => (
            <div
              key={t.name}
              className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{t.name}</p>
                <p className="text-xs text-gray-500">{t.blurb}</p>
              </div>
              {subscribed ? (
                <span className="flex flex-shrink-0 items-center gap-1 rounded-lg bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Member
                </span>
              ) : (
                <button
                  onClick={onSubscribe}
                  className="flex-shrink-0 rounded-lg border border-orange-300 px-2.5 py-1 text-xs font-medium text-orange-700 transition hover:bg-orange-50"
                >
                  Free · Upgrade
                </button>
              )}
            </div>
          ))}

          <div className="rounded-xl border border-dashed border-gray-200 p-3 text-center text-xs text-gray-400">
            More Stack Tools coming soon
          </div>
        </div>
      </div>
    </div>
  );
}

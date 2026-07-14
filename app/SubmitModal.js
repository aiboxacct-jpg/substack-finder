'use client';

import { useState } from 'react';
import { Plus, X, Loader2, CheckCircle2 } from 'lucide-react';

// "Submit your Substack" button + popup form. Anyone can submit; the entry is
// saved as pending and only appears in searches after the admin approves it.
export default function SubmitModal() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  function close() {
    setOpen(false);
    // Reset after the modal is gone so it's fresh next time.
    setTimeout(() => {
      setDone(false);
      setErr('');
      setName('');
      setUrl('');
      setDescription('');
      setTags('');
    }, 200);
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url, description, tags }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setErr(data.error || 'Something went wrong. Please try again.');
      } else {
        setDone(true);
      }
    } catch {
      setErr('Could not reach the server. Please try again.');
    }
    setBusy(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-white px-4 py-2 text-sm font-medium text-orange-700 transition hover:border-orange-400 hover:bg-orange-50"
      >
        <Plus className="h-4 w-4" />
        Submit your Substack
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={close}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Submit your Substack</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Get listed for people searching your topic.
                </p>
              </div>
              <button
                onClick={close}
                className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {done ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <CheckCircle2 className="h-10 w-10 text-green-500" />
                <p className="font-medium text-gray-900">Thanks — submission received!</p>
                <p className="text-sm text-gray-500">
                  We review each one before it goes live. It&apos;ll show up in searches once approved.
                </p>
                <button
                  onClick={close}
                  className="mt-2 rounded-xl bg-orange-500 px-5 py-2 text-sm font-medium text-white transition hover:bg-orange-600"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Newsletter name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. The Fragrance Files"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Substack link
                  </label>
                  <input
                    type="text"
                    required
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://yourname.substack.com"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Short description
                  </label>
                  <textarea
                    required
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="One sentence on what it's about."
                    className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Topics <span className="font-normal text-gray-400">(comma-separated)</span>
                  </label>
                  <input
                    type="text"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="e.g. fragrance, perfume, reviews"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Helps us show your newsletter for the right searches.
                  </p>
                </div>

                {err && <p className="text-sm text-red-600">{err}</p>}

                <button
                  type="submit"
                  disabled={busy}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-orange-600 disabled:opacity-50"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Submit
                </button>
                <p className="text-center text-xs text-gray-400">
                  Reviewed before it appears. No account needed.
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

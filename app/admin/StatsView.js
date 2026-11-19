'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, RefreshCw, Users, Eye, Tag } from 'lucide-react';

// Our own visit stats: who came from which campaign (utm_campaign), which site
// sent them (referrer), and by day. Filled by /api/track; admin visits are
// left out. Days are Pacific time.

const RANGES = [
  { key: 'd7', label: 'Last 7 days' },
  { key: 'd30', label: 'Last 30 days' },
  { key: 'all', label: 'All time' },
];

function fmtDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function fmtDay(day) {
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function Card({ icon: Icon, label, value, accent }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-white'}`}>
      <div className={`flex items-center gap-2 ${accent ? 'text-orange-700' : 'text-gray-500'}`}>
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className={`mt-1 text-2xl font-bold ${accent ? 'text-orange-700' : 'text-gray-900'}`}>{value ?? 0}</p>
    </div>
  );
}

function Table({ title, hint, cols, rows, empty }) {
  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      {hint && <p className="mb-3 text-xs text-gray-400">{hint}</p>}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-400">
          {empty}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                {cols.map((c) => (
                  <th key={c.label} className={`px-4 py-3 font-medium ${c.num ? 'text-right' : ''}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-0">
                  {cols.map((c) => (
                    <td
                      key={c.label}
                      className={`px-4 py-3 ${c.num ? 'text-right tabular-nums text-gray-900' : 'text-gray-700'}`}
                    >
                      {c.render ? c.render(r) : r[c.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function StatsView() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState('d7');

  async function load() {
    setBusy(true);
    setErr('');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/stats', {
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not load stats.');
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

  const s = data?.ranges?.[range];
  const t = s?.totals || {};

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                range === r.key ? 'bg-orange-500 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button
          onClick={load}
          disabled={busy}
          title="Refresh stats"
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>
      <p className="mt-2 text-xs text-gray-400">
        Our own counts from links tagged ?utm_campaign=… Visitors are unique browsers (no IPs stored). Your own
        admin browser is left out. Days are Pacific time.
      </p>

      {err && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      {!data && busy && (
        <div className="flex justify-center py-10 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      {s && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card icon={Users} label="Visitors" value={t.visitors} />
            <Card icon={Eye} label="Pageviews" value={t.pageviews} />
            <Card icon={Tag} label="From campaigns" value={t.tagged_visitors} accent />
            <Card icon={Eye} label="Campaign views" value={t.tagged_pageviews} accent />
          </div>

          <Table
            title="By campaign"
            hint="Visitors who landed on a link with a utm_campaign tag."
            empty="No tagged visits in this range yet."
            rows={s.campaigns || []}
            cols={[
              {
                label: 'Campaign',
                render: (r) => <span className="font-medium text-gray-900 break-all">{r.campaign}</span>,
              },
              { label: 'Source', key: 'sources' },
              { label: 'Visitors', key: 'visitors', num: true },
              { label: 'Views', key: 'pageviews', num: true },
              { label: 'Last visit', render: (r) => <span className="whitespace-nowrap text-gray-500">{fmtDateTime(r.last_seen)}</span> },
            ]}
          />

          <Table
            title="By referrer"
            hint="The site a visitor came from. Apps (including the Substack app) often hide this, so it shows as direct."
            empty="No visits in this range yet."
            rows={s.referrers || []}
            cols={[
              { label: 'Referrer', render: (r) => <span className="break-all">{r.referrer}</span> },
              { label: 'Visitors', key: 'visitors', num: true },
              { label: 'Views', key: 'pageviews', num: true },
            ]}
          />

          <Table
            title="By day"
            empty="No visits in this range yet."
            rows={s.days || []}
            cols={[
              { label: 'Day', render: (r) => <span className="whitespace-nowrap">{fmtDay(r.day)}</span> },
              { label: 'Visitors', key: 'visitors', num: true },
              { label: 'Views', key: 'pageviews', num: true },
              { label: 'Campaign views', key: 'tagged_pageviews', num: true },
            ]}
          />
        </>
      )}

      {data?.recent && (
        <Table
          title="Latest visits"
          hint="The 50 most recent page views, any range."
          empty="No visits recorded yet."
          rows={data.recent}
          cols={[
            { label: 'When', render: (r) => <span className="whitespace-nowrap text-gray-500">{fmtDateTime(r.created_at)}</span> },
            {
              label: 'Page',
              render: (r) => (
                <span className="break-all text-gray-900">
                  {(r.host || '').replace(/^www\./, '')}
                  {r.path}
                </span>
              ),
            },
            { label: 'Campaign', render: (r) => r.utm_campaign || <span className="text-gray-300">—</span> },
            { label: 'Referrer', render: (r) => r.referrer_host || <span className="text-gray-300">direct</span> },
          ]}
        />
      )}
    </div>
  );
}

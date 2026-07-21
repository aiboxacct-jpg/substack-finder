'use client';

import { Users, Wand2, ArrowRight, Sparkles } from 'lucide-react';
import AuthBar from './AuthBar';

// The Stack Tools hub. Every tool is a route in this one app, so they all share
// a single login and a single membership. Each tool belongs to one of the four
// pillars: Create (publish better), Grow (acquire readers), Connect (collaborate
// with other writers) and Optimize (audit and improve).
const TOOLS = [
  {
    name: 'Substack Finder',
    pillar: 'Connect',
    description:
      'Paste your Substack and find the creators you should know and collaborate with.',
    href: '/finder',
    icon: Users,
    live: true,
  },
  {
    name: 'Headline Analyzer',
    pillar: 'Create',
    description:
      'Score your headline on clarity, curiosity, specificity and length, then get five stronger versions.',
    href: '/headline',
    icon: Wand2,
    live: true,
    isNew: true,
  },
];

// Named here so the hub shows momentum. Move one up into TOOLS when it ships.
const COMING_SOON = [
  'Newsletter Score',
  'Roast My Newsletter',
  'Subscriber Goal Calculator',
  'Newsletter → Notes Converter',
];

export default function Hub() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-white px-4 py-12">
      <div className="mx-auto max-w-2xl">
        {/* Login / sign-up bar */}
        <div className="mb-6">
          <AuthBar />
        </div>

        {/* Heading */}
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900">
            Stack Tools
          </h1>
          <p className="mt-3 text-gray-600">
            Small, sharp tools for Substack writers. One login, one membership,
            every tool.
          </p>
        </header>

        {/* The tools */}
        <div className="space-y-4">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <a
                key={tool.href}
                href={tool.href}
                className="group flex items-start gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md"
              >
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-gray-900 group-hover:text-orange-600">
                      {tool.name}
                    </h2>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      {tool.pillar}
                    </span>
                    {tool.isNew && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                        New
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm text-gray-600">{tool.description}</p>
                </div>
                <ArrowRight className="mt-3 h-4 w-4 flex-shrink-0 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-orange-500" />
              </a>
            );
          })}
        </div>

        {/* Membership nudge */}
        <div className="mt-8 rounded-2xl border border-orange-200 bg-orange-50 p-5">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 flex-shrink-0 text-orange-500" />
            <div>
              <h3 className="font-semibold text-orange-900">
                One membership unlocks everything
              </h3>
              <p className="mt-1 text-sm text-orange-800">
                Every tool is free to try a few times a day. Members get
                unlimited use of every tool in the suite, including the ones
                still to come.
              </p>
            </div>
          </div>
          <button
            onClick={() => window.dispatchEvent(new Event('open-membership'))}
            className="mt-4 w-full rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
          >
            See what Membership includes
          </button>
        </div>

        {/* What's next */}
        <div className="mt-10">
          <h3 className="mb-3 text-sm font-semibold text-gray-500">
            In the works
          </h3>
          <div className="flex flex-wrap gap-2">
            {COMING_SOON.map((name) => (
              <span
                key={name}
                className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500"
              >
                {name}
              </span>
            ))}
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-16 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-orange-100 pt-6 text-xs text-gray-400">
          <a href="/terms" className="hover:text-orange-600">
            Terms
          </a>
          <span>·</span>
          <a href="/privacy" className="hover:text-orange-600">
            Privacy
          </a>
          <span>·</span>
          <span>© 2026 Stack Tools</span>
        </footer>
      </div>
    </main>
  );
}

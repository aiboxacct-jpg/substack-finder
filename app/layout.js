import './globals.css';
import { Analytics } from '@vercel/analytics/react';
import FeatureRequests from './FeatureRequests';
import VisitTracker from './VisitTracker';

// Hub-level defaults. Each tool overrides these in its own layout.js, so
// substackfinder.site still reads as "Substack Finder" to search engines.
export const metadata = {
  title: 'Stack Tools',
  description: 'Small, sharp tools for Substack writers. One login, one membership.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        {/* Floating feature-request board, on every page of every tool */}
        <FeatureRequests />
        <Analytics />
        {/* Our own page-view beacon, for per-campaign stats (admin Stats tab) */}
        <VisitTracker />
      </body>
    </html>
  );
}

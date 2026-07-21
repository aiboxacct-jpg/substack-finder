import './globals.css';
import { Analytics } from '@vercel/analytics/react';

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
        <Analytics />
      </body>
    </html>
  );
}

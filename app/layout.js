import './globals.css';
import { Analytics } from '@vercel/analytics/react';

export const metadata = {
  title: 'Substack Finder',
  description: 'Find real Substack newsletters on any topic.',
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

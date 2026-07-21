// Keeps the Substack Finder's own title/description now that it lives at
// /finder instead of the site root. substackfinder.site rewrites to this route,
// so this is the metadata that domain still serves.
export const metadata = {
  title: 'Substack Finder',
  description:
    'Paste your Substack and find the creators you should know and collaborate with.',
};

export default function FinderLayout({ children }) {
  return children;
}

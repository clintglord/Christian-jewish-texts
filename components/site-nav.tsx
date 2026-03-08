import Link from "next/link";

export function SiteNav() {
  return (
    <header className="site-header">
      <nav className="site-nav">
        <Link href="/">Home</Link>
        <Link href="/texts">Browse Texts</Link>
        <Link href="/tracker">Import Tracker</Link>
      </nav>
    </header>
  );
}


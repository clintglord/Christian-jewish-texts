import Link from "next/link";

import { getTrackerGroups } from "../lib/texts";

export default async function HomePage() {
  const groups = await getTrackerGroups();
  const likelyDbLimit = groups.every((g) => g.texts.length === 0);

  const quickStats = groups.map((g) => ({
    key: g.key,
    label: g.label,
    count: g.texts.length,
  }));

  return (
    <main>
      <div className="panel">
        <h1>Unified Jewish-Christian Text Library</h1>
        <p>
          Launch v1 publishes every catalog row with stable URLs, metadata, hierarchy, and placeholder states for
          unavailable texts.
        </p>
        <p>
          <Link href="/texts">Browse Texts</Link>
        </p>
        <p>
          <Link href="/tracker">Import Tracker</Link>
        </p>
      </div>

      <div className="panel">
        <h2>Status Snapshot</h2>
        {likelyDbLimit ? (
          <p>Live database data is temporarily unavailable (likely transfer limit reached).</p>
        ) : null}
        <ul>
          {quickStats.map((stat) => (
            <li key={stat.key}>
              {stat.label}: {stat.count}
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

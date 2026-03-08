import Link from "next/link";

import { getTrackerGroups } from "../../lib/texts";

export const revalidate = false;

function isNtOrRelated(tradition: string): boolean {
  return tradition.toLowerCase().includes("christian");
}

function buildTierGroups(
  texts: Awaited<ReturnType<typeof getTrackerGroups>>[number]["texts"],
  nt: boolean,
) {
  const filtered = texts.filter((text) => isNtOrRelated(text.tradition) === nt);
  const grouped = new Map<string, typeof filtered>();

  for (const text of filtered) {
    const key = text.tier || "Unclassified";
    const list = grouped.get(key) ?? [];
    list.push(text);
    grouped.set(key, list);
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tier, items]) => ({
      tier,
      items: [...items].sort((a, b) => a.title.localeCompare(b.title)),
    }));
}

function signalsForText(text: Awaited<ReturnType<typeof getTrackerGroups>>[number]["texts"][number]): string[] {
  const out: string[] = [];
  const status = text.ingestStatus.toUpperCase();
  if (status === "NEEDS_REVIEW") out.push("needs-review");
  if (status === "BLOCKED") out.push("blocked");
  if (text.hasBody && text.bodyLength > 0 && text.bodyLength < 1200) out.push("short");
  if (text.sourceUrl && /sacred-texts\.com|perseus\.tufts\.edu/i.test(text.sourceUrl)) out.push("source-check");
  return out;
}

export default async function TrackerPage() {
  const groups = await getTrackerGroups();
  const likelyDbLimit = groups.every((group) => group.texts.length === 0);

  return (
    <main>
      <div className="panel">
        <h1>Import Tracker</h1>
        <p>Grouped view of import status by readiness and ingestion state.</p>
        {likelyDbLimit ? (
          <p>
            Live database data is temporarily unavailable (likely transfer limit reached). Tracker entries will return
            when quota resets or plan limits are increased.
          </p>
        ) : null}
        <p>
          <Link href="/texts">Browse all texts</Link>
        </p>
      </div>

      <div className="panel tracker-jump">
        <strong>Quick Jump:</strong>{" "}
        {groups.map((group, index) => (
          <span key={group.key}>
            <a href={`#group-${group.key}`}>{group.label}</a>
            {index < groups.length - 1 ? " | " : ""}
          </span>
        ))}
      </div>

      {groups.map((group) => (
        <div className="panel" key={group.key} id={`group-${group.key}`}>
          <h2>
            {group.label} ({group.texts.length})
          </h2>
          {group.texts.length === 0 ? (
            <p>None</p>
          ) : (
            <div className="tracker-split">
              {[{ label: "OT and related", nt: false }, { label: "NT and related", nt: true }].map((side) => {
                const tierGroups = buildTierGroups(group.texts, side.nt);
                return (
                  <section key={side.label}>
                    <h3>{side.label}</h3>
                    {tierGroups.length === 0 ? (
                      <p>None</p>
                    ) : (
                      tierGroups.map((tierGroup) => (
                        <div key={tierGroup.tier} className="tracker-tier">
                          <h4>
                            {tierGroup.tier} ({tierGroup.items.length})
                          </h4>
                          <ul>
                            {tierGroup.items.map((text) => {
                              const signals = signalsForText(text);
                              return (
                                <li key={text.id}>
                                  <Link href={text.fullPath}>{text.title}</Link>
                                  {signals.length > 0 ? (
                                    <span className="tracker-signals">
                                      {signals.map((signal) => (
                                        <span key={signal} className="tag">
                                          {signal}
                                        </span>
                                      ))}
                                    </span>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ))
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </main>
  );
}

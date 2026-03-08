"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type BrowseItem = {
  id: number;
  stableTextId: string;
  title: string;
  fullPath: string;
  tradition: string;
  tier: string;
  state: string;
};

type Props = {
  items: BrowseItem[];
  traditions: string[];
  states: string[];
};

export function TextsBrowseClient({ items, traditions, states }: Props) {
  const [query, setQuery] = useState("");
  const [tradition, setTradition] = useState("all");
  const [state, setState] = useState("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchQuery =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.stableTextId.toLowerCase().includes(q);
      const matchTradition = tradition === "all" || item.tradition === tradition;
      const matchState = state === "all" || item.state === state;
      return matchQuery && matchTradition && matchState;
    });
  }, [items, query, tradition, state]);

  const grouped = useMemo(() => {
    const byTradition = new Map<string, BrowseItem[]>();
    for (const item of filtered) {
      const arr = byTradition.get(item.tradition) || [];
      arr.push(item);
      byTradition.set(item.tradition, arr);
    }
    return Array.from(byTradition.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  return (
    <>
      <div className="panel">
        <h1>Texts</h1>
        <p>{filtered.length} matching records</p>
        <div className="controls-grid">
          <div>
            <label htmlFor="quick-jump">Quick jump (title or stable ID)</label>
            <input
              id="quick-jump"
              className="control-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Genesis or JEW-SCR-Genesis"
            />
          </div>
          <div>
            <label htmlFor="tradition-filter">Tradition</label>
            <select
              id="tradition-filter"
              className="control-input"
              value={tradition}
              onChange={(e) => setTradition(e.target.value)}
            >
              <option value="all">All traditions</option>
              {traditions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="state-filter">Ingest state</label>
            <select id="state-filter" className="control-input" value={state} onChange={(e) => setState(e.target.value)}>
              <option value="all">All states</option>
              {states.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {grouped.map(([traditionName, traditionItems]) => {
        const byTier = new Map<string, BrowseItem[]>();
        for (const item of traditionItems) {
          const arr = byTier.get(item.tier) || [];
          arr.push(item);
          byTier.set(item.tier, arr);
        }
        const tiers = Array.from(byTier.entries()).sort((a, b) => a[0].localeCompare(b[0]));

        return (
          <div className="panel" key={traditionName}>
            <h2>{traditionName}</h2>
            {tiers.map(([tier, tierItems]) => (
              <details key={`${traditionName}-${tier}`} open>
                <summary>
                  {tier} ({tierItems.length})
                </summary>
                <ul>
                  {tierItems.map((item) => (
                    <li key={item.id}>
                      <Link href={item.fullPath}>{item.title}</Link> <code>{item.stableTextId}</code>{" "}
                      <span className="tag">{item.state}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        );
      })}
    </>
  );
}


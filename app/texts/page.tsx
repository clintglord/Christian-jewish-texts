import Link from "next/link";

import { TextsBrowseClient } from "../../components/texts-browse-client";
import { getAllTexts } from "../../lib/texts";
import { derivePageState } from "../../lib/page-state";

export const revalidate = false;

export default async function TextsIndexPage() {
  const texts = await getAllTexts();
  const likelyDbLimit = texts.length === 0;
  const items = texts.map((text) => ({
    id: text.id,
    stableTextId: text.stableTextId,
    title: text.title,
    fullPath: text.fullPath,
    tradition: text.tradition,
    tier: text.tier,
    state: derivePageState(text.ingestStatus, Boolean(text.bodyText)),
  }));
  const traditions = Array.from(new Set(items.map((x) => x.tradition))).sort((a, b) => a.localeCompare(b));
  const states = Array.from(new Set(items.map((x) => x.state))).sort((a, b) => a.localeCompare(b));

  return (
    <main>
      <p className="breadcrumbs">
        <Link href="/">Home</Link> / <span>Texts</span>
      </p>
      {likelyDbLimit ? (
        <div className="panel">
          <p>Live database data is temporarily unavailable (likely transfer limit reached).</p>
        </div>
      ) : null}
      <TextsBrowseClient items={items} traditions={traditions} states={states} />
    </main>
  );
}

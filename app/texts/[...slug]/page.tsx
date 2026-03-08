import Link from "next/link";
import { notFound } from "next/navigation";

import { derivePageState } from "../../../lib/page-state";
import { getAllTexts, getTextByPath } from "../../../lib/texts";

export const revalidate = false;

type PageProps = {
  params: { slug: string[] };
};

export async function generateStaticParams() {
  const texts = await getAllTexts();
  return texts.map((t) => ({
    slug: t.fullPath.replace(/^\/texts\//, "").split("/"),
  }));
}

export default async function TextPage({ params }: PageProps) {
  const fullPath = `/texts/${params.slug.join("/")}`;
  const [text, allTexts] = await Promise.all([getTextByPath(fullPath), getAllTexts()]);

  if (!text && allTexts.length === 0) {
    return (
      <main>
        <p className="breadcrumbs">
          <Link href="/">Home</Link> / <Link href="/texts">Texts</Link>
        </p>
        <div className="panel">
          <h1>Text Temporarily Unavailable</h1>
          <p>Live database data is temporarily unavailable (likely transfer limit reached).</p>
        </div>
      </main>
    );
  }

  if (!text) {
    notFound();
  }

  const state = derivePageState(text.ingestStatus, Boolean(text.bodyText));
  const currentIndex = allTexts.findIndex((t) => t.fullPath === text.fullPath);
  const prevText = currentIndex > 0 ? allTexts[currentIndex - 1] : null;
  const nextText = currentIndex >= 0 && currentIndex < allTexts.length - 1 ? allTexts[currentIndex + 1] : null;

  return (
    <main>
      <p className="breadcrumbs">
        <Link href="/">Home</Link> / <Link href="/texts">Texts</Link> / <span>{text.title}</span>
      </p>

      <div className="panel">
        <h1>{text.title}</h1>
        <p>
          <span className="tag">{text.tradition}</span>
          <span className="tag">{text.tier}</span>
          <span className="tag">{state}</span>
        </p>
        <div className="meta">
          <strong>Stable ID</strong>
          <span>{text.stableTextId}</span>
          <strong>Path</strong>
          <span>{text.fullPath}</span>
          <strong>Ingest Status</strong>
          <span>{text.ingestStatus}</span>
          {text.parent ? (
            <>
              <strong>Parent</strong>
              <span>
                <Link href={text.parent.fullPath}>{text.parent.title}</Link>
              </span>
            </>
          ) : null}
        </div>
      </div>

      <div className="panel nav-row">
        <div>{prevText ? <Link href={prevText.fullPath}>Previous: {prevText.title}</Link> : <span />}</div>
        <div>{nextText ? <Link href={nextText.fullPath}>Next: {nextText.title}</Link> : <span />}</div>
      </div>

      {text.bodyHtml ? (
        <article className="panel" dangerouslySetInnerHTML={{ __html: text.bodyHtml }} />
      ) : (
        <div className="panel">
          {state === "review_needed" ? (
            <p>Source exists but is under review before local hosting.</p>
          ) : state === "blocked" ? (
            <p>This text is not currently available for local hosting.</p>
          ) : (
            <p>Text not yet locally available. Metadata is published for this record.</p>
          )}
        </div>
      )}

      {text.children.length > 0 ? (
        <div className="panel">
          <h2>Child Texts</h2>
          <ul>
            {text.children.map((child) => (
              <li key={child.id}>
                <Link href={child.fullPath}>{child.title}</Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </main>
  );
}

export type PageState = "full_text" | "metadata_only" | "review_needed" | "blocked";

export function derivePageState(ingestStatus: string, hasBody: boolean): PageState {
  if (hasBody) return "full_text";

  const normalized = ingestStatus.trim().toUpperCase();
  if (normalized === "NEEDS_REVIEW") return "review_needed";
  if (normalized === "BLOCKED" || normalized === "PLANNED_EXPANSION") return "blocked";

  return "metadata_only";
}

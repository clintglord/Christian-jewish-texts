export const REQUIRED_COLUMNS = [
  "Stable_Text_ID",
  "Canonical_Display_Title",
  "Site_Slug",
  "Suggested_Hierarchical_Path",
  "Tradition",
  "Unified_Tier_Label",
  "Hierarchy_Level",
  "Ingest_Readiness",
] as const;

export type RequiredColumn = (typeof REQUIRED_COLUMNS)[number];

export type SheetRow = {
  Stable_Text_ID: string;
  Canonical_Display_Title: string;
  Site_Slug: string;
  Suggested_Hierarchical_Path: string;
  Tradition: string;
  Unified_Tier_Label: string;
  Hierarchy_Level: string;
  Ingest_Readiness: string;
  Rights_Status?: string;
  Direct_Full_Text_URL?: string;
  Parent_Slug?: string;
  Genre?: string;
  Alternate_Titles?: string;
  Estimated_Date?: string;
  Citation_Unit?: string;
  Citation_Example?: string;
  Summary?: string;
};

export type ImportSummary = {
  totalRows: number;
  upserts: number;
  parentStubs: number;
  fullTextSuccesses: number;
  fullTextFailures: number;
  fetchesSkipped: number;
  metadataOnlyPages: number;
};

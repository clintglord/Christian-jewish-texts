# Appendix A: Spreadsheet Field Definitions (v2)
## Unified Jewish–Christian Text Library

This appendix defines the fields used in the Google Sheet that drives the digital corpus website.

The Google Sheet is the editorial source of truth. All ingestion scripts and database records are derived from these fields. The importer must not invent new data structures unless a field is missing.

---

## 1. Core Identity Fields

### Record_ID
- Type: String (e.g. EX0001, EXP0661)
- Purpose: Internal row identifier for tracking edits and dataset integrity. Not used in URLs.
- Rules: Must remain stable once assigned. Never reused.

### Stable_Text_ID
- Type: String (e.g. CHR-ECC-1-Clement)
- Purpose: Permanent identifier for a text. Used internally by the database and search.
- Structure: TRADITION-TIER-TITLE
- Examples: JEW-SCR-Genesis, CHR-ECC-1-Clement, CHR-ECA-Gospel-of-Thomas, JEW-STJ-Community-Rule-1QS
- Rules: Must be unique. Must remain stable permanently. Never changed after publication.

---

## 2. Display Fields

### Canonical_Display_Title
- Type: String (e.g. "Shepherd of Hermas — Visions", "1 Clement", "Genesis")
- Purpose: Human-readable title displayed on the page. Used in page headings and search results.
- Rules: Title Case preferred. Should reflect the most widely recognised scholarly name.

### Alternate_Titles
- Type: String, comma-separated (e.g. "First Epistle of Clement, 1 Clem., Epistula Clementis")
- Purpose: Helps search discover texts under alternate naming traditions.

---

## 3. URL Fields

### Site_Slug
- Type: String (e.g. shepherd-of-hermas-visions, genesis, mishnah-berakhot)
- Purpose: Used in page URLs. Example: /texts/shepherd-of-hermas-visions
- Rules: Lowercase, hyphen-separated, no parentheses, no punctuation, SEO-friendly. Must be unique across the entire catalogue.

### Suggested_Hierarchical_Path
- Type: String (e.g. /texts/shepherd-of-hermas/visions, /texts/mishnah/berakhot)
- Purpose: Defines the full nested URL structure for the page.
- Rules: Uses forward slashes. Derived from parent and child slugs.

---

## 4. Hierarchy Fields

### Parent_Work_Title
- Type: String (e.g. "Shepherd of Hermas", "Mishnah", "Antiquities of the Jews")
- Purpose: Defines the parent container for child texts. For standalone texts, this equals the display title.

### Parent_Slug
- Type: String (e.g. shepherd-of-hermas, mishnah, antiquities)
- Purpose: Used to generate the parent page URL (e.g. /texts/shepherd-of-hermas).

### Child_Label
- Type: String, nullable (e.g. "Visions", "Berakhot", "Book I")
- Purpose: The label for this child within its parent. Null for standalone/parent texts.

### Child_Slug
- Type: String, nullable (e.g. visions, berakhot, book-i)
- Purpose: The URL segment for this child under its parent.

### Hierarchy_Level
- Type: Integer (1 or 2)
- Purpose: 1 = standalone or parent text. 2 = child of a parent work.

---

## 5. Classification Fields

### Tradition
- Type: Enum
- Possible values: Jewish, Christian, Shared, Greco-Roman / Jewish witness, Manichaean / Christian-adjacent
- Purpose: Defines the broad religious tradition. Texts belonging to both Jewish and Christian traditions are marked "Shared" and appear once in the catalogue.

### Unified_Tier_Label
- Type: String
- Possible values:
  1. Scriptural Foundations
  2. Deuterocanonical / Apocryphal Scriptures
  3. Second Temple Jewish Literature
  4. Jewish Diaspora Philosophy & Historiography
  5. Early Christian Core Literature (Apostolic Period)
  6. Early Christian Apocrypha
  7. Jewish Pseudepigrapha
  8. Early Rabbinic Literature
  9. Early Patristic Theology (Pre-Nicene)
  10. Late Antique Interpretive Traditions
- Purpose: Allows browsing by historical genre.

---

## 6. Source Fields

### Source_Site
- Example: Early Christian Writings, Early Jewish Writings, Sacred Texts, CCEL
- Purpose: Identifies the originating catalogue or site.

### Source_Page_URL
- Example: https://www.earlychristianwritings.com/text/1clement.html
- Purpose: Reference page describing the text.

### Direct_Full_Text_URL
- Purpose: Direct link to the actual full text content. Must link to the text itself, not a landing page.

---

## 7. Ingestion Fields

### Ingest_Readiness
- Type: Enum
- Values: READY, NEEDS_REVIEW, BLOCKED, PLANNED_EXPANSION
- READY: safe to ingest, importer should fetch text.
- NEEDS_REVIEW: possible source, manual verification required.
- BLOCKED: cannot host locally, page should still exist.
- PLANNED_EXPANSION: placeholder for future text.

---

## 8. Rights Fields

### Rights_Status
- Values: Public Domain, Likely Public Domain, Unknown, Restricted
- Purpose: Determines whether text may be rehosted. Importer only auto-ingests when "Public Domain".

### Rights_Notes
- Example: "Translated by Robert Henry Charles (1913) — public domain"
- Purpose: Human explanation of the rights decision.

---

## 9. Database-Generated Fields (not in the sheet)

### bodyHtml
Clean HTML version of the text, created by the importer.

### bodyText
Plain text version used for search indexing, created by the importer.

### searchVector
PostgreSQL tsvector, generated from title, tradition, tier, and bodyText.

---

## 10. Optional Enrichment Fields

### Language
- Example: Greek, Hebrew, Latin, Aramaic, English

### Estimated_Date
- Example: c. 90–120 CE, c. 200 BCE

### Genre
- Example: Gospel, Epistle, Apocalypse, Rabbinic Law, Historical Narrative, Wisdom Literature

### Citation_Unit
- Example: chapter.section, chapter.verse, folio.line

### Citation_Example
- Example: 1 Clem. 42.1–5, Gen. 1:1, m. Ber. 2:3

---

## 11. Importer Field Mapping

| Sheet Column | Database Field |
|---|---|
| Stable_Text_ID | texts.stableTextId |
| Canonical_Display_Title | texts.title |
| Site_Slug | texts.slug |
| Suggested_Hierarchical_Path | texts.fullPath |
| Direct_Full_Text_URL | texts.sourceUrl |
| Tradition | texts.tradition |
| Unified_Tier_Label | texts.tier |
| Genre | texts.genre |
| Ingest_Readiness | texts.ingestStatus |
| Rights_Status | texts.rightsStatus |
| Rights_Notes | (stored in rightsStatus or a notes field) |
| Alternate_Titles | texts.alternateTitles |
| Estimated_Date | texts.estimatedDate |
| Citation_Unit | texts.citationUnit |
| Citation_Example | texts.citationExample |
| Hierarchy_Level | texts.hierarchyLevel |
| Parent_Work_Title + Parent_Slug | used to resolve texts.parentId |

---

## 12. Critical Rules

1. The Google Sheet is the editorial source of truth.
2. Stable IDs must never change.
3. Slugs must remain stable once public. Must be unique.
4. Every row must produce a website page.
5. Full text ingestion must respect rights status.
6. Cross-tradition texts use Tradition = "Shared" with no duplicate rows.

---

## 13. Minimum Fields Required for Launch

The importer requires these fields to function:

Stable_Text_ID, Canonical_Display_Title, Site_Slug, Suggested_Hierarchical_Path, Tradition, Unified_Tier_Label, Hierarchy_Level, Ingest_Readiness

Everything else is enrichment.

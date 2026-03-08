import { prisma } from "./prisma";

export async function getAllTexts() {
  try {
    return await prisma.text.findMany({
      orderBy: [{ title: "asc" }],
      select: {
        id: true,
        stableTextId: true,
        title: true,
        fullPath: true,
        tradition: true,
        tier: true,
        ingestStatus: true,
        bodyText: true,
        parentId: true,
      },
    });
  } catch (error) {
    console.error("getAllTexts failed:", error);
    return [];
  }
}

export async function getTextByPath(fullPath: string) {
  try {
    return await prisma.text.findUnique({
      where: { fullPath },
      include: {
        parent: {
          select: { title: true, fullPath: true },
        },
        children: {
          select: { id: true, title: true, fullPath: true, ingestStatus: true, bodyText: true },
          orderBy: { title: "asc" },
        },
      },
    });
  } catch (error) {
    console.error("getTextByPath failed:", error);
    return null;
  }
}

export type TrackerGroup = {
  key: string;
  label: string;
  texts: Array<{
    id: number;
    title: string;
    fullPath: string;
    tradition: string;
    tier: string;
    sourceUrl: string | null;
    ingestStatus: string;
    hasBody: boolean;
    bodyLength: number;
  }>;
};

export async function getTrackerGroups(): Promise<TrackerGroup[]> {
  const groups: Record<string, TrackerGroup> = {
    imported: { key: "imported", label: "Imported (full text)", texts: [] },
    ready: { key: "ready", label: "Ready but not yet imported", texts: [] },
    needs_review: { key: "needs_review", label: "Needs review", texts: [] },
    blocked: { key: "blocked", label: "Blocked", texts: [] },
    planned: { key: "planned", label: "Planned expansion", texts: [] },
    other: { key: "other", label: "Other", texts: [] },
  };

  try {
    const rows = await prisma.text.findMany({
      orderBy: [{ title: "asc" }],
      select: {
      id: true,
      title: true,
      fullPath: true,
      tradition: true,
      tier: true,
      sourceUrl: true,
      ingestStatus: true,
      bodyText: true,
    },
  });

    for (const row of rows) {
      const hasBody = Boolean(row.bodyText);
      const status = row.ingestStatus.trim().toUpperCase();

      if (hasBody) {
        groups.imported.texts.push({ ...row, hasBody, bodyLength: row.bodyText?.length ?? 0 });
        continue;
      }

      if (status === "READY") {
        groups.ready.texts.push({ ...row, hasBody, bodyLength: row.bodyText?.length ?? 0 });
        continue;
      }

      if (status === "NEEDS_REVIEW") {
        groups.needs_review.texts.push({ ...row, hasBody, bodyLength: row.bodyText?.length ?? 0 });
        continue;
      }

      if (status === "BLOCKED") {
        groups.blocked.texts.push({ ...row, hasBody, bodyLength: row.bodyText?.length ?? 0 });
        continue;
      }

      if (status === "PLANNED_EXPANSION") {
        groups.planned.texts.push({ ...row, hasBody, bodyLength: row.bodyText?.length ?? 0 });
        continue;
      }

      groups.other.texts.push({ ...row, hasBody, bodyLength: row.bodyText?.length ?? 0 });
    }
  } catch (error) {
    console.error("getTrackerGroups failed:", error);
  }

  return [
    groups.imported,
    groups.ready,
    groups.needs_review,
    groups.blocked,
    groups.planned,
    groups.other,
  ];
}

import type { Db } from "../db/client";

export type Region = {
  id: string;
  parentId: string | null;
  name: string;
  regionCode: string;
  level: "sido" | "sigungu" | "eupmyeondong";
  boundary: { type: "Polygon"; coordinates: number[][][] } | null;
  isDemoData: boolean;
};

type Row = {
  id: string;
  parent_id: string | null;
  name: string;
  region_code: string;
  level: Region["level"];
  boundary_geojson: Region["boundary"];
  is_demo_data: boolean;
};

const map = (r: Row): Region => ({
  id: r.id,
  parentId: r.parent_id,
  name: r.name,
  regionCode: r.region_code,
  level: r.level,
  boundary: r.boundary_geojson,
  isDemoData: r.is_demo_data,
});

export async function listRegions(db: Db): Promise<Region[]> {
  return (await db.query<Row>(`SELECT * FROM regions ORDER BY region_code`)).map(map);
}

/** The region and all of its descendants. Empty if the region does not exist. */
export async function expandRegion(db: Db, regionId: string): Promise<string[]> {
  const rows = await db.query<{ id: string }>(
    `WITH RECURSIVE tree AS (
       SELECT id FROM regions WHERE id = $1
       UNION ALL SELECT r.id FROM regions r JOIN tree t ON r.parent_id = t.id
     ) SELECT id FROM tree`,
    [regionId],
  );
  return rows.map((r) => r.id);
}

/** The region and its ancestors (used for service coverage matching). */
export async function regionLineage(db: Db, regionId: string): Promise<string[]> {
  const rows = await db.query<{ id: string }>(
    `WITH RECURSIVE up AS (
       SELECT id, parent_id FROM regions WHERE id = $1
       UNION ALL SELECT r.id, r.parent_id FROM regions r JOIN up u ON r.id = u.parent_id
     ) SELECT id FROM up`,
    [regionId],
  );
  return rows.map((r) => r.id);
}

/** Display label like "해솔구 · 은빛동". */
export function regionLabel(regions: Region[], id: string): string {
  const r = regions.find((x) => x.id === id);
  if (!r) return id;
  const parent = r.parentId ? regions.find((x) => x.id === r.parentId) : null;
  return parent && parent.level !== "sido" ? `${parent.name} · ${r.name}` : r.name;
}

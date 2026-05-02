import type {
  CreateRouteRequest,
  RouteProfilePreset,
  SavedRoute,
  UpdateRouteRequest,
} from "@routax/shared";
import type { Pool } from "pg";

interface ListOptions {
  limit?: number;
  cursor?: string;
}

interface ListResult {
  items: SavedRoute[];
  nextCursor?: string;
}

interface RouteRow {
  id: string;
  user_id: string;
  name: string;
  preset: RouteProfilePreset;
  geometry_json: string;
  profile: unknown;
  distance_m: number;
  duration_s: number;
  ascent_m: number;
  descent_m: number;
  elevation_profile: unknown;
  surface_profile: unknown;
  created_at: Date;
  updated_at: Date;
}

interface CursorValue {
  createdAt: string;
  id: string;
}

function encodeCursor(value: CursorValue): string {
  return Buffer.from(`${value.createdAt}:${value.id}`, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): CursorValue {
  const decoded = Buffer.from(cursor, "base64url").toString("utf8");
  const separatorIndex = decoded.lastIndexOf(":");
  if (separatorIndex === -1) {
    throw new Error("Invalid cursor");
  }
  const createdAt = decoded.slice(0, separatorIndex);
  const id = decoded.slice(separatorIndex + 1);
  if (!createdAt || !id) {
    throw new Error("Invalid cursor");
  }
  return { createdAt, id };
}

function toSavedRoute(row: RouteRow): SavedRoute {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    preset: row.preset,
    geometry: JSON.parse(row.geometry_json) as SavedRoute["geometry"],
    profile: row.profile as SavedRoute["profile"],
    distance: row.distance_m,
    duration: row.duration_s,
    ascent: row.ascent_m,
    descent: row.descent_m,
    elevationProfile: row.elevation_profile as SavedRoute["elevationProfile"],
    surfaceProfile: row.surface_profile as SavedRoute["surfaceProfile"],
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class RouteRepository {
  constructor(private readonly pool: Pool) {}

  async create(userId: string, payload: CreateRouteRequest): Promise<SavedRoute> {
    const result = await this.pool.query<RouteRow>(
      `INSERT INTO routes (
        user_id, name, preset, geometry, profile, distance_m, duration_s, ascent_m, descent_m, elevation_profile, surface_profile
      ) VALUES (
        $1, $2, $3, ST_GeomFromGeoJSON($4)::geography, $5::jsonb, $6, $7, $8, $9, $10::jsonb, $11::jsonb
      )
      RETURNING
        id,
        user_id,
        name,
        preset,
        ST_AsGeoJSON(geometry::geometry) AS geometry_json,
        profile,
        distance_m,
        duration_s,
        ascent_m,
        descent_m,
        elevation_profile,
        surface_profile,
        created_at,
        updated_at`,
      [
        userId,
        payload.name,
        payload.preset,
        JSON.stringify(payload.geometry),
        JSON.stringify(payload.profile),
        payload.distance,
        payload.duration,
        payload.ascent,
        payload.descent,
        JSON.stringify(payload.elevationProfile),
        JSON.stringify(payload.surfaceProfile ?? []),
      ],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to insert route");
    }
    return toSavedRoute(row);
  }

  async listByUser(userId: string, options: ListOptions = {}): Promise<ListResult> {
    const requestedLimit = options.limit ?? 20;
    const limit = Math.min(Math.max(requestedLimit, 1), 100);
    const cursor = options.cursor;
    const values: unknown[] = [userId];
    let cursorSql = "";

    if (cursor) {
      const decoded = decodeCursor(cursor);
      values.push(decoded.createdAt, decoded.id);
      cursorSql = "AND (created_at, id) < ($2::timestamptz, $3::uuid)";
    }

    values.push(limit + 1);
    const limitParam = `$${values.length}`;
    const result = await this.pool.query<RouteRow>(
      `SELECT
        id,
        user_id,
        name,
        preset,
        ST_AsGeoJSON(geometry::geometry) AS geometry_json,
        profile,
        distance_m,
        duration_s,
        ascent_m,
        descent_m,
        elevation_profile,
        surface_profile,
        created_at,
        updated_at
      FROM routes
      WHERE user_id = $1
      ${cursorSql}
      ORDER BY created_at DESC, id DESC
      LIMIT ${limitParam}`,
      values,
    );

    const rows = result.rows.slice(0, limit);
    const items = rows.map(toSavedRoute);
    const hasMore = result.rows.length > limit;
    const last = rows.at(-1);
    return {
      items,
      nextCursor:
        hasMore && last
          ? encodeCursor({ createdAt: last.created_at.toISOString(), id: last.id })
          : undefined,
    };
  }

  async get(userId: string, id: string): Promise<SavedRoute | null> {
    const result = await this.pool.query<RouteRow>(
      `SELECT
        id,
        user_id,
        name,
        preset,
        ST_AsGeoJSON(geometry::geometry) AS geometry_json,
        profile,
        distance_m,
        duration_s,
        ascent_m,
        descent_m,
        elevation_profile,
        surface_profile,
        created_at,
        updated_at
      FROM routes
      WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    const row = result.rows[0];
    return row ? toSavedRoute(row) : null;
  }

  async rename(
    userId: string,
    id: string,
    payload: UpdateRouteRequest,
  ): Promise<SavedRoute | null> {
    const result = await this.pool.query<RouteRow>(
      `UPDATE routes
      SET name = $3,
          updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING
        id,
        user_id,
        name,
        preset,
        ST_AsGeoJSON(geometry::geometry) AS geometry_json,
        profile,
        distance_m,
        duration_s,
        ascent_m,
        descent_m,
        elevation_profile,
        surface_profile,
        created_at,
        updated_at`,
      [id, userId, payload.name],
    );
    const row = result.rows[0];
    return row ? toSavedRoute(row) : null;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const result = await this.pool.query("DELETE FROM routes WHERE id = $1 AND user_id = $2", [
      id,
      userId,
    ]);
    return result.rowCount === 1;
  }
}

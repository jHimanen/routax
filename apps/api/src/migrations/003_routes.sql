CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS routes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  geometry GEOGRAPHY(LineString, 4326) NOT NULL,
  profile JSONB NOT NULL,
  distance_m INTEGER NOT NULL,
  duration_s INTEGER NOT NULL,
  ascent_m INTEGER NOT NULL,
  descent_m INTEGER NOT NULL,
  elevation_profile JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS routes_user_id_created_at_idx
  ON routes (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS routes_geometry_gix
  ON routes USING gist (geometry);

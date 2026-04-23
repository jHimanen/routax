CREATE TABLE IF NOT EXISTS job_queue (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       TEXT NOT NULL,
  payload    JSONB NOT NULL DEFAULT '{}',
  status     TEXT NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending', 'claimed', 'done', 'failed')),
  worker_id  TEXT,
  error      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ,
  done_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS job_queue_status_created
  ON job_queue (status, created_at)
  WHERE status = 'pending';

CREATE UNLOGGED TABLE IF NOT EXISTS cache_entries (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS cache_entries_expires_at
  ON cache_entries (expires_at);

CREATE TABLE IF NOT EXISTS analytics_events (
  id         UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id    TEXT,
  event      TEXT NOT NULL,
  ts         TIMESTAMPTZ NOT NULL DEFAULT now(),
  properties JSONB NOT NULL DEFAULT '{}'
) PARTITION BY RANGE (ts);

CREATE INDEX IF NOT EXISTS analytics_events_user_ts
  ON analytics_events (user_id, ts);

CREATE INDEX IF NOT EXISTS analytics_events_event_ts
  ON analytics_events (event, ts);

CREATE TABLE IF NOT EXISTS analytics_events_2026_04
  PARTITION OF analytics_events
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE IF NOT EXISTS analytics_events_2026_05
  PARTITION OF analytics_events
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE IF NOT EXISTS analytics_events_2026_06
  PARTITION OF analytics_events
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE TABLE IF NOT EXISTS analytics_identities (
  user_id    TEXT PRIMARY KEY,
  traits     JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

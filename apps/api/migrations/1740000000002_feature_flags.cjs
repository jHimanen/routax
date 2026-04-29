/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS flags (
      key         TEXT PRIMARY KEY,
      rules       JSONB NOT NULL,
      description TEXT,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    INSERT INTO flags (key, rules, description) VALUES
      ('saved_routes_ui',       '{"default": true, "environments": {"local": true}}', 'Gates save/load route UI (tasks 06-07)'),
      ('gpx_export',            '{"default": true, "environments": {"local": true}}', 'Gates GPX download (task 08)'),
      ('elevation_profile_viz', '{"default": true, "environments": {"local": true}}', 'Gates elevation chart (task 09)')
    ON CONFLICT (key) DO NOTHING;
  `);
};

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.down = (pgm) => {
  // WARNING: drops all flag data including any flags added after initial seed.
  pgm.sql("DROP TABLE IF EXISTS flags;");
};

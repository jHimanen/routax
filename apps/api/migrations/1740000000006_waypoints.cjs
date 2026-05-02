/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE routes ADD COLUMN waypoints_json JSONB NOT NULL DEFAULT '[]'::jsonb;`);
};

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.down = (pgm) => {
  pgm.sql("ALTER TABLE routes DROP COLUMN IF EXISTS waypoints_json;");
};

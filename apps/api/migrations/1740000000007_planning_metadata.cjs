/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE routes ADD COLUMN planning_metadata_json JSONB DEFAULT NULL;`);
};

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.down = (pgm) => {
  pgm.sql("ALTER TABLE routes DROP COLUMN IF EXISTS planning_metadata_json;");
};

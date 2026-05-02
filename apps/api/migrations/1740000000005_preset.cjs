/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.sql(
    `ALTER TABLE routes ADD COLUMN preset TEXT NOT NULL DEFAULT 'fastest_direct';`,
  );
};

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.down = (pgm) => {
  pgm.sql("ALTER TABLE routes DROP COLUMN IF EXISTS preset;");
};

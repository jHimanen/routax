// Make the preset column nullable so new routes saved without a preset are valid.
// Old rows keep their string value; new saves write null.
/** @param {import("node-pg-migrate").MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql("ALTER TABLE routes ALTER COLUMN preset DROP NOT NULL;");
};

/** @param {import("node-pg-migrate").MigrationBuilder} pgm */
exports.down = (pgm) => {
  // Re-add NOT NULL — rows with null preset get the old default.
  pgm.sql("UPDATE routes SET preset = 'fastest_direct' WHERE preset IS NULL;");
  pgm.sql("ALTER TABLE routes ALTER COLUMN preset SET NOT NULL;");
};

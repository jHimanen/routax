/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.addColumn("routes", {
    cue_sheet: {
      type: "jsonb",
      notNull: true,
      default: "[]",
    },
  });
};

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.down = (pgm) => {
  pgm.dropColumn("routes", "cue_sheet");
};

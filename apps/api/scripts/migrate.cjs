const path = require("node:path");
const { spawnSync } = require("node:child_process");

require("dotenv").config({ path: path.resolve(__dirname, "../../../.env.local") });

const result = spawnSync("node-pg-migrate", process.argv.slice(2), {
  stdio: "inherit",
  env: process.env,
  shell: true,
});
process.exit(result.status ?? 1);

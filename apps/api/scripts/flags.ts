import * as path from "node:path";
import dotenv from "dotenv";
import { FlagRuleSchema } from "@routax/shared";
import { Pool } from "pg";

for (const p of [
  path.join(process.cwd(), ".env.local"),
  path.join(process.cwd(), ".env"),
  path.join(process.cwd(), "..", "..", ".env.local"),
  path.join(process.cwd(), "..", "..", ".env"),
]) {
  dotenv.config({ path: p });
}

const pool = new Pool({
  host: process.env.POSTGRES_HOST ?? "localhost",
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER ?? "routax",
  password: process.env.POSTGRES_PASSWORD ?? "routax_dev_password",
  database: process.env.POSTGRES_DB ?? "routax",
});

const [, , command, key, rulesArg] = process.argv;

async function set(): Promise<void> {
  if (!key || !rulesArg) {
    console.error("Usage: flags:set <key> '<json>'");
    process.exit(1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rulesArg);
  } catch {
    console.error("Invalid JSON:", rulesArg);
    process.exit(1);
  }

  const result = FlagRuleSchema.safeParse(parsed);
  if (!result.success) {
    console.error("Invalid flag rules:", result.error.flatten().fieldErrors);
    process.exit(1);
  }

  await pool.query(
    `INSERT INTO flags (key, rules, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET rules = EXCLUDED.rules, updated_at = now()`,
    [key, JSON.stringify(result.data)],
  );

  console.log(`flags.${key} set`);
}

async function list(): Promise<void> {
  const { rows } = await pool.query<{
    key: string;
    rules: unknown;
    description: string | null;
  }>("SELECT key, rules, description FROM flags ORDER BY key");

  if (rows.length === 0) {
    console.log("(no flags)");
    return;
  }

  const keyWidth = Math.max(3, ...rows.map((r) => r.key.length));
  console.log(`${"KEY".padEnd(keyWidth)}  RULES`);
  console.log(`${"-".repeat(keyWidth)}  -----`);
  for (const row of rows) {
    const rulesStr = JSON.stringify(row.rules);
    const desc = row.description ? `  # ${row.description}` : "";
    console.log(`${row.key.padEnd(keyWidth)}  ${rulesStr}${desc}`);
  }
}

async function main(): Promise<void> {
  try {
    if (command === "set") {
      await set();
    } else if (command === "list") {
      await list();
    } else {
      console.error("Usage: flags:set <key> '<json>' | flags:list");
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

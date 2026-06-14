// Standalone migrator for platforms (Render free tier) where drizzle-kit (a
// devDependency, excluded by `pnpm install --prod`) is unavailable in the
// runtime image. Uses drizzle-orm's programmatic migrator + postgres.js, both
// of which ARE production dependencies of @oneglanse/db. Run before the server:
//   node packages/db/migrate-standalone.mjs && node apps/web/server.js
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] DATABASE_URL is not set");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(here, "drizzle");

const sql = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(sql);

try {
  console.log("[migrate] applying migrations from", migrationsFolder);
  await migrate(db, { migrationsFolder });
  console.log("[migrate] done");
} catch (e) {
  console.error("[migrate] failed:", e && e.message ? e.message : e);
  await sql.end({ timeout: 5 }).catch(() => {});
  process.exit(1);
}
await sql.end({ timeout: 5 }).catch(() => {});

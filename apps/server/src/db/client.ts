import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { env } from "../env";
import { log } from "../log";
import * as schema from "./schema";

const here = path.dirname(fileURLToPath(import.meta.url));
/** Works from src/db (tsx) and dist (bundled build). */
const migrationsFolder = [path.resolve(here, "../../drizzle"), path.resolve(here, "../drizzle")].find((p) =>
  p.endsWith("drizzle"),
)!;

type Database = NodePgDatabase<typeof schema>;

let pglite: PGlite | null = null;
let pool: pg.Pool | null = null;

function connect(): Database {
  if (env.DATABASE_URL) {
    pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });
    return drizzlePg(pool, { schema });
  }
  pglite = new PGlite(path.join(env.dataDir, "pglite"));
  // PGlite and node-postgres expose the same query builder surface.
  return drizzlePglite(pglite, { schema }) as unknown as Database;
}

export const db = connect();
export { schema };

export async function runMigrations(): Promise<void> {
  const folder = (await import("node:fs")).existsSync(path.resolve(here, "../../drizzle"))
    ? path.resolve(here, "../../drizzle")
    : path.resolve(here, "../drizzle");
  if (pglite) {
    await migratePglite(drizzlePglite(pglite), { migrationsFolder: folder });
  } else {
    await migratePg(db, { migrationsFolder: folder });
  }
  log.info(`database ready (${env.DATABASE_URL ? "postgres" : "embedded pglite"})`);
  void migrationsFolder;
}

export async function closeDb(): Promise<void> {
  await pglite?.close();
  await pool?.end();
}

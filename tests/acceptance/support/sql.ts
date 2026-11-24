import { execFileSync } from "node:child_process";

/**
 * Runs SQL in the LOCAL database container of THIS project (`supabase_db_roadmap2yes`) to move
 * timestamps (the plan tests DB time by shifting rows, never by waiting). Local stack only: the
 * container name is fixed on purpose so it can never touch another project's database.
 */
const DB_CONTAINER = "supabase_db_roadmap2yes";

export function sql(statement: string): string {
  return execFileSync(
    "docker",
    [
      "exec",
      DB_CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
      "-c",
      statement,
    ],
    { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" },
  ).trim();
}

/** `\x…` bytea literal of the PostgREST wire format -> a SQL literal. */
export function byteaLiteral(wire: string): string {
  const hex = wire.replace(/^\\x/, "");
  if (!/^[0-9a-f]+$/i.test(hex)) throw new Error("not a hex key");
  return `decode('${hex}','hex')`;
}

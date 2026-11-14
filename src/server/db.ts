import postgres from "postgres"

export class ConfigError extends Error {}

/**
 * How many database connections this process may hold. The API also lets only this
 * many requests run at once (see `route` in http.ts), and each request runs its
 * queries one after another, so a query never has to wait for a free connection.
 * That matters: through Supabase's transaction pooler, queries the driver had to
 * queue behind busy connections were seen to hang.
 */
export const DB_CONNECTIONS = 10

type Sql = ReturnType<typeof postgres>
// Reuse one client across hot reloads in development.
const globalForDb = globalThis as unknown as { __mutuariSql?: Sql }

export function db(): Sql {
  if (!globalForDb.__mutuariSql) {
    const url = process.env.DATABASE_URL
    if (!url) throw new ConfigError("DATABASE_URL is not set")
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url)
    globalForDb.__mutuariSql = postgres(url, {
      ssl: local ? false : "require",
      // Hosted poolers (Neon pooled, Supabase transaction mode) don't support prepared statements.
      prepare: false,
      max: DB_CONNECTIONS,
      idle_timeout: 20,
      connect_timeout: 10,
    })
  }
  return globalForDb.__mutuariSql
}

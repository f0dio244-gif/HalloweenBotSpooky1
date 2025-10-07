import { PostgresStore } from "@mastra/pg";
import pg from "pg";

// Create a single shared PostgreSQL storage instance only if DATABASE_URL is available
// If not available, workflows that require storage will fail but the Discord bot will work
const connectionString = process.env.DATABASE_URL 
  || (process.env.PGDATABASE 
    ? `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`
    : undefined);

export const sharedPostgresStorage = connectionString
  ? new PostgresStore({ connectionString })
  : undefined;

// Shared PostgreSQL connection pool for Discord bot
export const sharedPgPool = connectionString
  ? new pg.Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })
  : undefined;

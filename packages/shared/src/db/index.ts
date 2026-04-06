import knex from 'knex';
import dotenv from 'dotenv';
import path from 'path';
import { types as pgTypes } from 'pg';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

// Prevent timezone-related date shifts: return Postgres DATE (OID 1082) as "YYYY-MM-DD" string.
// This keeps API payloads stable across environments/timezones.
pgTypes.setTypeParser(1082, (value) => value);

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL,
  pool: { min: 2, max: 10 },
  searchPath: ['public'],
});

export default db;

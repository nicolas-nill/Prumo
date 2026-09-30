import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import pg from 'pg'

const ADMIN_URL = process.env.PRUMO_TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/postgres'
const ROOT = join(__dirname, '..', '..')

export interface TestDb {
  client: pg.Client
  close(): Promise<void>
}

/** Creates a fresh database, applies the Supabase stub, every migration and the dev seed. */
export async function createTestDatabase(name: string, options: { seed?: boolean } = {}): Promise<TestDb> {
  const admin = new pg.Client({ connectionString: ADMIN_URL })
  await admin.connect()
  await admin.query(`drop database if exists ${name} with (force)`)
  await admin.query(`create database ${name}`)
  await admin.end()

  const url = new URL(ADMIN_URL)
  url.pathname = `/${name}`
  const client = new pg.Client({ connectionString: url.toString() })
  await client.connect()

  await client.query(readFileSync(join(ROOT, 'tests/db/supabase-stub.sql'), 'utf8'))
  const migrationsDir = join(ROOT, 'supabase/migrations')
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    await client.query(readFileSync(join(migrationsDir, file), 'utf8'))
  }
  if (options.seed) await client.query(readFileSync(join(ROOT, 'supabase/seed.sql'), 'utf8'))

  return { client, close: () => client.end() }
}

export async function createUser(client: pg.Client, email: string, fullName: string): Promise<string> {
  const id = randomUUID()
  await client.query(
    `insert into auth.users (id, email, aud, role, raw_user_meta_data, created_at, updated_at)
     values ($1, $2, 'authenticated', 'authenticated', $3, now(), now())`,
    [id, email, JSON.stringify({ full_name: fullName })],
  )
  return id
}

/**
 * Runs `fn` as an authenticated user (role + JWT claims), exactly how PostgREST executes
 * requests in Supabase. Everything is rolled back unless `commit` is set.
 */
export async function asUser<T>(
  client: pg.Client,
  userId: string | null,
  fn: (q: (sql: string, params?: unknown[]) => Promise<pg.QueryResult>) => Promise<T>,
  options: { commit?: boolean; role?: 'authenticated' | 'anon' | 'service_role' } = {},
): Promise<T> {
  const email = userId ? (await client.query('select email from auth.users where id = $1', [userId])).rows[0]?.email : null
  await client.query('begin')
  try {
    await client.query(`set local role ${options.role ?? (userId ? 'authenticated' : 'anon')}`)
    if (userId) {
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: userId, role: 'authenticated', email }),
      ])
    }
    const result = await fn((sql, params) => client.query(sql, params))
    await client.query(options.commit ? 'commit' : 'rollback')
    return result
  } catch (error) {
    await client.query('rollback')
    throw error
  }
}

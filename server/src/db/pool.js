import pg from 'pg'
import { env, isTest } from '../config/env.js'

const { Pool } = pg
const databaseUrl = normalizeDatabaseUrl(env.databaseUrl)

function normalizeDatabaseUrl(value) {
  if (!value) return value
  try {
    const url = new URL(value)
    const sslMode = url.searchParams.get('sslmode')
    if (['prefer', 'require', 'verify-ca'].includes(sslMode)) {
      url.searchParams.set('sslmode', 'verify-full')
    }
    return url.toString()
  } catch {
    return value
  }
}

export const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1') ? false : undefined,
      max: 12,
      idleTimeoutMillis: 30_000,
    })
  : null

export async function query(text, params = []) {
  if (!pool) {
    throw new Error('DATABASE_URL is required for database operations')
  }
  return pool.query(text, params)
}

export async function transaction(callback) {
  if (!pool) {
    throw new Error('DATABASE_URL is required for database operations')
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export function assertDatabaseConfigured() {
  if (!pool && !isTest) {
    throw new Error('DATABASE_URL is not configured')
  }
}

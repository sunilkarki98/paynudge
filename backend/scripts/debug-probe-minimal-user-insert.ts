/**
 * Debug: simulate the Supabase handle_new_user() INSERT (id + email only).
 * Run: cd backend && npx tsx scripts/debug-probe-minimal-user-insert.ts
 */
import 'dotenv/config'
import { randomUUID } from 'crypto'
import { prisma } from '../src/lib/prisma'

const INGEST = 'http://127.0.0.1:7359/ingest/3b0c2916-fdb5-45b8-9836-ac0638fd59ae'

async function agentLog(payload: Record<string, unknown>) {
  await fetch(INGEST, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '964b3b' },
    body: JSON.stringify({
      sessionId: '964b3b',
      timestamp: Date.now(),
      runId: 'probe-minimal-user-insert',
      ...payload,
    }),
  }).catch(() => {})
}

async function main() {
  if (!process.env.DATABASE_URL) {
    await agentLog({
      location: 'debug-probe-minimal-user-insert.ts',
      message: 'DATABASE_URL missing',
      hypothesisId: 'H-env',
      data: { hasUrl: false },
    })
    console.error('DATABASE_URL is not set')
    process.exit(1)
    return
  }

  const id = randomUUID()
  const email = `probe_${Date.now()}@example.invalid`.replace(/'/g, "''")

  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO public."User" (id, email, "createdAt", "updatedAt") VALUES ('${id}'::uuid, '${email}', now(), now())`,
    )
    await prisma.$executeRawUnsafe(`DELETE FROM public."User" WHERE id = '${id}'::uuid`)
    await agentLog({
      location: 'debug-probe-minimal-user-insert.ts',
      message: 'minimal User insert succeeded (cleaned up)',
      hypothesisId: 'H1-H4',
      data: { outcome: 'ok' },
    })
    console.log('Probe OK: User row insert with timestamps works on this database.')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await agentLog({
      location: 'debug-probe-minimal-user-insert.ts',
      message: 'minimal User insert failed',
      hypothesisId: 'H1-H4',
      data: { outcome: 'fail', pgError: msg },
    })
    console.error('Probe FAILED:', msg)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

main()

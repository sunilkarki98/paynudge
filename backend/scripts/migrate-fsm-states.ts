import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

function createPrismaClient(): PrismaClient {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({
    adapter: adapter as unknown as undefined,
  } as any)
}

const prisma = createPrismaClient()

async function migrate() {
  console.log('🚀 Starting FSM Data Migration...')

  const invoices = await prisma.invoice.findMany()
  console.log(`Found ${invoices.length} invoices to migrate.`)

  let count = 0
  for (const invoice of invoices) {
    let newState: any = 'PENDING'
    let newBalance = invoice.amount

    if (invoice.status === 'PAID') {
      newState = 'PAID'
      newBalance = 0 as any
    } else {
      // Map reminderStage to new States
      switch (invoice.reminderStage) {
        case 0:
          newState = 'PENDING'
          break
        case 1:
          newState = 'DUE'
          break
        case 2:
          newState = 'OVERDUE_L1'
          break
        case 3:
          newState = 'OVERDUE_L2'
          break
        case 4:
          newState = 'OVERDUE_L3'
          break
        default:
          newState = invoice.reminderStage > 4 ? 'RECURRING_CHASE' : 'PENDING'
      }
    }

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        state: newState,
        balance: newBalance,
        lastStateChangeAt: new Date(),
        stateMetadata: {
          migrationNote: 'Auto-migrated from legacy status/stage logic',
          originalStatus: invoice.status,
          originalStage: invoice.reminderStage
        }
      }
    })
    count++
  }

  console.log(`✅ Migration complete! ${count} invoices updated.`)
}

migrate()
  .catch((e) => {
    console.error('❌ Migration failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

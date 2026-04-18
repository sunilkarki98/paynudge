import 'dotenv/config'
import { Prisma } from '@prisma/client'
import { prisma } from '../src/lib/prisma'

async function main() {
  console.log('🌱 Seeding database...')

  // Clean existing data
  await prisma.reminderLog.deleteMany()
  await prisma.invoice.deleteMany()
  await prisma.client.deleteMany()
  await prisma.user.deleteMany()

  // Create demo user mapping (Note: To log in, you must register this email via Supabase on the frontend first)
  const user = await prisma.user.create({
    data: {
      id: '00000000-0000-4000-8000-000000000000',
      email: 'demo@invoicechaser.com',
      name: 'Alex Johnson',
    },
  })

  // Create clients sequentially (Supabase pooler compatibility)
  const client1 = await prisma.client.create({
    data: { userId: user.id, name: 'Acme Corporation', email: 'billing@acme.com' },
  })
  const client2 = await prisma.client.create({
    data: { userId: user.id, name: 'Globex Industries', email: 'accounts@globex.com' },
  })
  const client3 = await prisma.client.create({
    data: { userId: user.id, name: 'Wayne Enterprises', email: 'finance@wayne.com' },
  })
  const client4 = await prisma.client.create({
    data: { userId: user.id, name: 'Stark Industries', email: 'ap@stark.com' },
  })
  const client5 = await prisma.client.create({
    data: { userId: user.id, name: 'Umbrella Corp', email: 'payments@umbrella.com' },
  })

  const now = new Date()
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  const daysFromNow = (days: number) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

  // Create invoices sequentially
  // Paid invoices
  await prisma.invoice.create({
    data: {
      userId: user.id, clientId: client1.id,
      clientName: 'Acme Corporation', clientEmail: 'billing@acme.com',
      amount: new Prisma.Decimal('3500.00'), dueDate: daysAgo(30),
      description: 'Website redesign - Phase 1', status: 'PAID', reminderStage: 1,
    },
  })
  await prisma.invoice.create({
    data: {
      userId: user.id, clientId: client2.id,
      clientName: 'Globex Industries', clientEmail: 'accounts@globex.com',
      amount: new Prisma.Decimal('7200.00'), dueDate: daysAgo(15),
      description: 'Mobile app development', status: 'PAID', reminderStage: 0,
    },
  })
  await prisma.invoice.create({
    data: {
      userId: user.id, clientId: client3.id,
      clientName: 'Wayne Enterprises', clientEmail: 'finance@wayne.com',
      amount: new Prisma.Decimal('1800.00'), dueDate: daysAgo(45),
      description: 'Brand identity package', status: 'PAID', reminderStage: 2,
    },
  })

  // Pending invoices (not yet due)
  await prisma.invoice.create({
    data: {
      userId: user.id, clientId: client1.id,
      clientName: 'Acme Corporation', clientEmail: 'billing@acme.com',
      amount: new Prisma.Decimal('4500.00'), dueDate: daysFromNow(10),
      description: 'Website redesign - Phase 2', status: 'UNPAID', reminderStage: 0,
    },
  })
  await prisma.invoice.create({
    data: {
      userId: user.id, clientId: client4.id,
      clientName: 'Stark Industries', clientEmail: 'ap@stark.com',
      amount: new Prisma.Decimal('12000.00'), dueDate: daysFromNow(5),
      description: 'Enterprise dashboard development', status: 'UNPAID', reminderStage: 0,
    },
  })

  // Overdue invoices
  await prisma.invoice.create({
    data: {
      userId: user.id, clientId: client5.id,
      clientName: 'Umbrella Corp', clientEmail: 'payments@umbrella.com',
      amount: new Prisma.Decimal('2800.00'), dueDate: daysAgo(5),
      description: 'Security audit report', status: 'UNPAID', reminderStage: 2,
      lastReminderSentAt: daysAgo(2),
    },
  })
  await prisma.invoice.create({
    data: {
      userId: user.id, clientId: client2.id,
      clientName: 'Globex Industries', clientEmail: 'accounts@globex.com',
      amount: new Prisma.Decimal('5500.00'), dueDate: daysAgo(10),
      description: 'API integration project', status: 'UNPAID', reminderStage: 3,
      lastReminderSentAt: daysAgo(3),
    },
  })
  await prisma.invoice.create({
    data: {
      userId: user.id, clientId: client3.id,
      clientName: 'Wayne Enterprises', clientEmail: 'finance@wayne.com',
      amount: new Prisma.Decimal('9000.00'), dueDate: daysAgo(16),
      description: 'Full-stack web application', status: 'UNPAID', reminderStage: 4,
      lastReminderSentAt: daysAgo(2),
    },
  })

  console.log('✅ Seeding complete!')
  console.log('⚠️ Warning: Because authentication is now handled entirely by Supabase,')
  console.log('   you must manually create an account matching demo@invoicechaser.com')
  console.log('   on your frontend UI if you want to log into this seeded profile!')
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

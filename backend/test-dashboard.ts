import { prisma } from './src/lib/prisma'

async function run() {
  try {
    const invoices = await prisma.invoice.findMany({ take: 1 })
    console.log("Invoices:", invoices.length)
  } catch (err) {
    console.error("Prisma error:", err)
  }
}
run()

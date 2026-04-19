import { prisma } from './src/lib/prisma'

async function run() {
  try {
    const clients = await prisma.client.findMany({ take: 1 })
    console.log("Clients:", clients)
  } catch (err: any) {
    console.error("Prisma error message:", err.message)
    console.error("Prisma error code:", err.code)
  }
}
run()

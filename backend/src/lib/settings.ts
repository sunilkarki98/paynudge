import { prisma } from './prisma'

// Simple in-memory cache for fast, repetitive reads (like during worker jobs)
const cache = new Map<string, { value: string; expiresAt: number }>()
const CACHE_TTL_MS = 60 * 1000 // 1 minute

export async function getSetting(key: string, defaultValue = ''): Promise<string> {
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  const setting = await prisma.systemSetting.findUnique({
    where: { key }
  })

  // Fallback cascade: DB -> process.env -> defaultValue
  const valueToUse = setting?.value || process.env[key] || defaultValue

  cache.set(key, {
    value: valueToUse,
    expiresAt: Date.now() + CACHE_TTL_MS
  })

  return valueToUse
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value }
  })
  
  // Invalidate cache
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
}

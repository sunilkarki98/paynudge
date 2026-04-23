import { z } from 'zod'

// ─── Auth Schemas ────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email('Invalid email address').max(255),
  password: z.string().min(1, 'Password is required').max(128),
})

export const registerSchema = z.object({
  email: z.string().email('Invalid email address').max(255),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  name: z.string().max(100).optional().nullable(),
})

// ─── Client Schemas ──────────────────────────────────────

export const createClientSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  email: z.string().email('Invalid email address').max(255),
  whatsappNumber: z.string().max(20).optional().nullable(),
  smsNumber: z.string().max(20).optional().nullable(),
  chasingProfile: z.enum(['STRICT', 'NORMAL', 'RELAXED']).optional(),
  contactChannel: z.enum(['EMAIL', 'WHATSAPP', 'SMS', 'BOTH', 'EMAIL_AND_SMS', 'ALL']).optional(),
  behaviorType: z.string().max(50).optional().nullable(), // Added for intelligence
  behaviorScore: z.number().int().optional().nullable(),
})

export const updateClientSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email('Invalid email').max(255).optional(),
  whatsappNumber: z.string().max(20).optional().nullable(),
  smsNumber: z.string().max(20).optional().nullable(),
  chasingProfile: z.enum(['STRICT', 'NORMAL', 'RELAXED']).optional(),
  contactChannel: z.enum(['EMAIL', 'WHATSAPP', 'SMS', 'BOTH', 'EMAIL_AND_SMS', 'ALL']).optional(),
  behaviorType: z.string().max(50).optional().nullable(),
  behaviorScore: z.number().int().optional().nullable(),
}).refine(data => Object.values(data).some(v => v !== undefined), {
  message: 'At least one field must be provided',
})

// ─── Invoice Schemas ─────────────────────────────────────

export const createInvoiceSchema = z.object({
  clientName: z.string().min(1, 'Client name is required').max(200),
  clientEmail: z.string().email('Invalid client email').max(255),
  amount: z.union([z.string(), z.number()])
    .transform((val) => {
      const num = typeof val === 'string' ? parseFloat(val) : val
      if (isNaN(num)) throw new Error('Invalid amount')
      return num
    })
    .pipe(z.number().positive('Amount must be positive').max(999999999.99, 'Amount too large')),
  dueDate: z.string().refine((val) => {
    const date = new Date(val)
    return !isNaN(date.getTime())
  }, 'Invalid date format'),
  description: z.string().max(2000).optional().nullable(),
  clientId: z.string().optional().nullable(),
  whatsappNumber: z.string().max(20).optional().nullable(),
  smsNumber: z.string().max(20).optional().nullable(),
  chasingProfile: z.enum(['STRICT', 'NORMAL', 'RELAXED']).optional(),
  contactChannel: z.enum(['EMAIL', 'WHATSAPP', 'SMS', 'BOTH', 'EMAIL_AND_SMS', 'ALL']).optional(),
  behaviorType: z.string().optional().nullable(), // Propagate behavior type from invoice create
})

export const updateInvoiceSchema = z.object({
  clientName: z.string().min(1).max(200).optional(),
  clientEmail: z.string().email('Invalid email').max(255).optional(),
  amount: z.union([z.string(), z.number()])
    .transform((val) => {
      const num = typeof val === 'string' ? parseFloat(val) : val
      if (isNaN(num)) throw new Error('Invalid amount')
      return num
    })
    .pipe(z.number().positive().max(999999999.99))
    .optional(),
  dueDate: z.string().refine((val) => {
    const date = new Date(val)
    return !isNaN(date.getTime())
  }, 'Invalid date').optional(),
  description: z.string().max(2000).optional().nullable(),
  status: z.enum(['PAID', 'UNPAID']).optional(),
  state: z.string().optional(), // Allow manual state override
}).refine(data => Object.values(data).some(v => v !== undefined), {
  message: 'At least one field must be provided',
})

// ─── Pagination Schema ───────────────────────────────────

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

// ─── Helpers ─────────────────────────────────────────────

export function validateBody<T>(schema: z.ZodSchema<T>, data: unknown): {
  success: true; data: T
} | {
  success: false; error: string
} {
  const result = schema.safeParse(data)
  if (result.success) {
    return { success: true, data: result.data }
  }

  const firstError = result.error.issues[0]
  const field = firstError?.path?.join('.') || 'input'
  const message = firstError?.message || 'Validation failed'

  return { success: false, error: `${field}: ${message}` }
}

export function validateQuery<T>(schema: z.ZodSchema<T>, params: URLSearchParams): {
  success: true; data: T
} | {
  success: false; error: string
} {
  const obj: Record<string, string> = {}
  params.forEach((value, key) => { obj[key] = value })
  return validateBody(schema, obj)
}

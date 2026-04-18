import { describe, it, expect } from 'vitest'
import { loginSchema, validateBody } from './validation'

describe('Validation Helpers', () => {
  describe('loginSchema', () => {
    it('should validate correct credentials', () => {
      const data = { email: 'test@example.com', password: 'password123' }
      const result = validateBody(loginSchema, data)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.email).toBe('test@example.com')
      }
    })

    it('should fail on invalid email', () => {
      const data = { email: 'not-an-email', password: 'password123' }
      const result = validateBody(loginSchema, data)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('email: Invalid email address')
      }
    })
  })
})

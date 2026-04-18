import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import { logger } from './logger'

const log = logger.child({ module: 'encryption' })

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const TAG_LENGTH = 16
const SALT_LENGTH = 32

/**
 * Get encryption key from environment.
 * Must be a 64-character hex string (32 bytes).
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key || key.length < 64) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY must be a 64-character hex string in production')
    }
    log.warn('Using weak ENCRYPTION_KEY — set a strong key before deploying')
    // Derive a deterministic dev key from a passphrase
    return scryptSync('dev-only-insecure-encryption-key', 'salt', 32)
  }
  return Buffer.from(key, 'hex')
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a base64 string containing: IV + encrypted data + auth tag
 * 
 * Format: base64(IV[16] + ciphertext[...] + authTag[16])
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  
  const authTag = cipher.getAuthTag()
  
  // Concatenate IV + ciphertext + authTag
  const combined = Buffer.concat([iv, encrypted, authTag])
  return combined.toString('base64')
}

/**
 * Decrypt a base64 encrypted string produced by encrypt().
 * Returns the original plaintext string.
 */
export function decrypt(encryptedBase64: string): string {
  const key = getEncryptionKey()
  const combined = Buffer.from(encryptedBase64, 'base64')
  
  // Extract components
  const iv = combined.subarray(0, IV_LENGTH)
  const authTag = combined.subarray(combined.length - TAG_LENGTH)
  const encrypted = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH)
  
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ])
  
  return decrypted.toString('utf8')
}

/**
 * Encrypt a JSON-serializable object.
 */
export function encryptJson<T>(data: T): string {
  return encrypt(JSON.stringify(data))
}

/**
 * Decrypt a string back into a JSON object.
 */
export function decryptJson<T>(encryptedBase64: string): T {
  return JSON.parse(decrypt(encryptedBase64))
}

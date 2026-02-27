// Crockford base32 alphabet (excludes I, L, O, U to avoid ambiguity)
const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/**
 * Generate a ULID (Universally Unique Lexicographically Sortable Identifier).
 *
 * Format: 26-character Crockford base32 string
 *   - 10 chars: 48-bit millisecond timestamp
 *   - 16 chars: 80-bit cryptographic random
 *
 * Uses crypto.getRandomValues — safe in Cloudflare Workers runtime.
 */
export function generateULID(): string {
  const now = Date.now()

  // --- Timestamp component (48 bits → 10 Crockford base32 chars) ---
  // We encode the 48-bit timestamp into 10 characters (each char = 5 bits,
  // 10 * 5 = 50 bits, so the top 2 bits of the first char are always 0).
  const timeChars = new Array<string>(10)
  let t = now
  for (let i = 9; i >= 0; i--) {
    timeChars[i] = ENCODING[t & 0x1f]
    t = Math.floor(t / 32)
  }

  // --- Random component (80 bits → 16 Crockford base32 chars) ---
  // 10 random bytes = 80 bits. We read 5 bits at a time across the byte
  // boundary using a simple bit-buffer approach.
  const randomBytes = new Uint8Array(10)
  crypto.getRandomValues(randomBytes)

  const randChars = new Array<string>(16)
  let bitBuffer = 0
  let bitsInBuffer = 0
  let byteIndex = 0
  for (let i = 0; i < 16; i++) {
    // Fill buffer until we have at least 5 bits
    while (bitsInBuffer < 5) {
      bitBuffer = (bitBuffer << 8) | randomBytes[byteIndex++]
      bitsInBuffer += 8
    }
    bitsInBuffer -= 5
    randChars[i] = ENCODING[(bitBuffer >> bitsInBuffer) & 0x1f]
  }

  return timeChars.join('') + randChars.join('')
}

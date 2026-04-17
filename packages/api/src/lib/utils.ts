export function nowIso(): string {
  return new Date().toISOString()
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function isValidPhoneNumber(phone: string): boolean {
  const normalized = phone.trim()
  return /^(\+66|0)[0-9]{9}$/.test(normalized) || /^\+[1-9][0-9]{6,14}$/.test(normalized)
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function randomHex(bytes = 32): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return bytesToHex(arr)
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return bytesToHex(new Uint8Array(digest))
}

export function isValidOrderId(id: string): boolean {
  return /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(id)
}

export function isValidProductSlug(slug: string): boolean {
  return /^[a-z0-9-]{3,100}$/.test(slug)
}

export function isValidProductImageUrl(value: string): boolean {
  if (value.length > 2048 || /\s/.test(value)) {
    return false
  }

  if (value.startsWith('/')) {
    return true
  }

  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

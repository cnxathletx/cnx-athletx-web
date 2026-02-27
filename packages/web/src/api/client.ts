// In dev, Vite proxy handles /api → localhost:8787
// In production, VITE_API_BASE_URL points to the Workers domain
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export function apiUrl(path: string): string {
  return `${BASE_URL}${path}`
}

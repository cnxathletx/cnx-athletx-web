// In dev, Vite proxy handles /api → localhost:8787
// In production, VITE_API_BASE_URL points to the Workers domain
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export function apiUrl(path: string): string {
  return `${BASE_URL}${path}`
}

export interface ApiErrorDetails {
  field: string
  message: string
}

export interface ApiErrorPayload {
  error?: string
  details?: ApiErrorDetails[]
  current_status?: string
  [key: string]: unknown
}

export class ApiClientError extends Error {
  status: number
  details?: ApiErrorDetails[]
  currentStatus?: string
  payload: ApiErrorPayload

  constructor(
    message: string,
    status: number,
    details?: ApiErrorDetails[],
    currentStatus?: string,
    payload: ApiErrorPayload = {},
  ) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.details = details
    this.currentStatus = currentStatus
    this.payload = payload
  }
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: BodyInit | Record<string, unknown> | unknown[] | null
  parseError?: (payload: ApiErrorPayload, response: Response) => Error
}

function parseJsonText<T>(text: string): T | null {
  if (text.trim() === '') return null
  return JSON.parse(text) as T
}

function isBodyInit(body: unknown): body is BodyInit {
  return (
    typeof body === 'string'
    || body instanceof ArrayBuffer
    || body instanceof Blob
    || body instanceof FormData
    || body instanceof URLSearchParams
    || body instanceof ReadableStream
  )
}

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {}
  if (headers instanceof Headers) {
    const record: Record<string, string> = {}
    headers.forEach((value, key) => {
      record[key] = value
    })
    return record
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers)
  }
  return { ...headers }
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { body, parseError, headers, credentials = 'include', ...init } = options
  const fetchInit: RequestInit = {
    ...init,
    credentials,
  }

  if (body !== undefined && body !== null) {
    if (isBodyInit(body)) {
      fetchInit.body = body
      if (headers) fetchInit.headers = headers
    } else {
      fetchInit.body = JSON.stringify(body)
      fetchInit.headers = {
        ...headersToRecord(headers),
        'Content-Type': 'application/json',
      }
    }
  } else if (headers) {
    fetchInit.headers = headers
  }

  const response = await fetch(apiUrl(path), fetchInit)
  const text = await response.text()
  const parsedPayload = parseJsonText<ApiErrorPayload>(text)
  const payload = parsedPayload ?? {}

  if (!response.ok) {
    if (parseError) throw parseError(payload, response)
    throw new ApiClientError(
      payload.error || `Request failed (${response.status})`,
      response.status,
      payload.details,
      typeof payload.current_status === 'string' ? payload.current_status : undefined,
      payload,
    )
  }

  return parsedPayload as T
}

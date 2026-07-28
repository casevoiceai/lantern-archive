export const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787'

export type Account = {
  id: number
  email: string
  tier: 'free' | 'paid'
  schoolName: string | null
  generationsUsedThisPeriod: number
  periodResetAt: string
  remainingGenerations: number | null
}

export type EntityResult = {
  id: number | null
  entity: {
    name: string
    subtitle: string
    symbolism: string
    historicalTie: string
    manifestations: string[]
    reformChain: {
      gentle: { dc: string; action: string }
      intermediate: { dc: string; action: string }
      advanced: { dc: string; action: string }
    }
    researchPointers: string[]
    districts?: Array<{
      district: string
      dominantEntity: string
      influenceRises: string
      reformSucceeds: string
    }>
  }
  saved: boolean
  usage: { used: number; remaining: number | null; resetAt: string }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(body.error || 'Request failed') as Error & { code?: string; paidInfoUrl?: string }
    error.code = body.code
    error.paidInfoUrl = body.paidInfoUrl
    throw error
  }
  return body as T
}

export const api = {
  me: () => request<{ account: Account }>('/api/auth/me'),
  register: (email: string, password: string, schoolName?: string) =>
    request<{ account: Account }>('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password, schoolName }) }),
  login: (email: string, password: string) =>
    request<{ account: Account }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  forgotPassword: (email: string) => request<{ message: string }>('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  generate: (payload: Record<string, unknown>) => request<EntityResult>('/api/entities/generate', { method: 'POST', body: JSON.stringify(payload) }),
  listEntities: () => request<{ entities: Array<{ id: number; town_name: string; generated_content: string; shared_to_community: number; created_at: string }> }>('/api/entities'),
  share: (id: number, shared: boolean) => request<{ ok: true }>(`/api/entities/${id}/share`, { method: 'PATCH', body: JSON.stringify({ shared }) }),
}

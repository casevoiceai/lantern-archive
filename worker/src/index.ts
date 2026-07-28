import bcrypt from 'bcryptjs'

interface Env {
  DB: D1Database
  ANTHROPIC_API_KEY: string
  JWT_SECRET: string
  APP_ORIGIN: string
  PAID_INFO_URL: string
  ANTHROPIC_MODEL: string
  COOKIE_DOMAIN?: string
}

type AccountRow = {
  id: number; email: string; password_hash: string; tier: 'free' | 'paid'; school_name: string | null
  generations_used_this_period: number; period_reset_at: string
}

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const THIRTY_DAYS = 60 * 60 * 24 * 30
const FREE_LIMIT = 3
const DEFAULT_ERA = '1850s coal-era Carbondale-style setting'
const SYSTEM_PROMPT = `You are generating a Civic Entity for the tabletop roleplaying game Time-Crawl Chronicles. A Civic Entity represents a real historical injustice or systemic tension from a specific town, personified in the same idiom as existing Entities like the Architect, the Iron Wolf, and the Coal Widow. Given a town name, historical era or industry, and one or more known historical details, generate one complete Civic Entity with these exact sections: a one or two word Entity name plus a short subtitle describing the injustice it represents, Symbolism (2-3 sentences), Historical Tie (2-3 sentences connecting the Entity to the real historical detail provided), Manifestations (3 concrete examples of how the Entity shows up in daily town life), and a Reform Chain with three stages: Gentle (DC 10), Intermediate (DC 12-14), and Advanced (DC 15-17), each stage a specific, concrete civic action. Also generate 3 to 5 research pointers: real categories of local archives, historical societies, or records relevant to this specific town and era. Never use any Wizards of the Coast proprietary terms, monster names, spell names, or campaign-setting names, even generically. Stay entirely within the original Time-Crawl Chronicles idiom.`

function cors(env: Env) {
  return {
    'Access-Control-Allow-Origin': env.APP_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
}
function json(env: Env, body: unknown, status = 200, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(env), 'Content-Type': 'application/json', ...extra } })
}
function normalizeEmail(value: unknown) { return String(value || '').trim().toLowerCase() }
function nextPeriod() { const d = new Date(); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString() }
function base64url(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_') }
function decode64url(value: string) { const s = value.replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(s + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0)) }
async function hmac(secret: string, data: string) { const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))) }
async function signJwt(account: AccountRow, env: Env) {
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const payload = base64url(new TextEncoder().encode(JSON.stringify({ sub: account.id, email: account.email, tier: account.tier, exp: Math.floor(Date.now() / 1000) + THIRTY_DAYS })))
  return `${header}.${payload}.${base64url(await hmac(env.JWT_SECRET, `${header}.${payload}`))}`
}
async function verifyJwt(token: string, env: Env) {
  const [header, payload, signature] = token.split('.'); if (!header || !payload || !signature) return null
  const expected = await hmac(env.JWT_SECRET, `${header}.${payload}`); const actual = decode64url(signature)
  let diff = expected.length ^ actual.length
  for (let i = 0; i < Math.min(expected.length, actual.length); i++) diff |= expected[i] ^ actual[i]
  if (diff) return null
  const decoded = JSON.parse(new TextDecoder().decode(decode64url(payload))) as { sub: number; exp: number }
  return decoded.exp > Date.now() / 1000 ? decoded : null
}
function cookie(token: string, env: Env, clear = false) {
  const domain = env.COOKIE_DOMAIN ? `; Domain=${env.COOKIE_DOMAIN}` : ''
  return `lantern_session=${clear ? '' : token}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${clear ? 0 : THIRTY_DAYS}${domain}`
}
function parseCookies(request: Request) { return Object.fromEntries((request.headers.get('Cookie') || '').split(';').map(x => x.trim().split('=').map(decodeURIComponent)).filter(x => x.length === 2)) }
async function getAccount(request: Request, env: Env) {
  const token = parseCookies(request).lantern_session; if (!token) return null
  const session = await verifyJwt(token, env); if (!session) return null
  return env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(session.sub).first<AccountRow>()
}
async function resetPeriodIfNeeded(account: AccountRow, env: Env) {
  if (new Date(account.period_reset_at) <= new Date()) {
    const reset = nextPeriod(); await env.DB.prepare('UPDATE accounts SET generations_used_this_period = 0, period_reset_at = ? WHERE id = ?').bind(reset, account.id).run()
    account.generations_used_this_period = 0; account.period_reset_at = reset
  }
  return account
}
function publicAccount(account: AccountRow) { return { id: account.id, email: account.email, tier: account.tier, schoolName: account.school_name, generationsUsedThisPeriod: account.generations_used_this_period, periodResetAt: account.period_reset_at, remainingGenerations: account.tier === 'free' ? Math.max(0, FREE_LIMIT - account.generations_used_this_period) : null } }
async function readBody(request: Request) { try { return await request.json<Record<string, unknown>>() } catch { return null } }
function validPassword(value: string) { return value.length >= 12 && value.length <= 128 }

function userPrompt(input: Record<string, unknown>, paid: boolean) {
  return `Town name: ${input.townName}\nHistorical era or industry: ${input.eraOrIndustry || DEFAULT_ERA}\nKnown historical detail 1: ${input.knownDetail1}\nKnown historical detail 2: ${input.knownDetail2 || 'None provided'}\nLocal legend or folklore: ${input.localLegend || 'None provided'}\nInjustice or tension to center: ${input.injusticeFocus || 'Choose the strongest evidence-based systemic tension from the details provided.'}\nAccount tier: ${paid ? 'paid' : 'free'}\n\nReturn only valid JSON with this schema: {"name":"","subtitle":"","symbolism":"","historicalTie":"","manifestations":["","",""],"reformChain":{"gentle":{"dc":"DC 10","action":""},"intermediate":{"dc":"DC 12-14","action":""},"advanced":{"dc":"DC 15-17","action":""}},"researchPointers":["3 to 5 specific pointers"]${paid ? ',"districts":[{"district":"","dominantEntity":"","influenceRises":"","reformSucceeds":""}]' : ''}}. ${paid ? 'Include 1 to 3 distinct town districts and deeper, more specific research pointers.' : 'Do not include districts.'}`
}
async function callAnthropic(env: Env, prompt: string) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('Worker is missing ANTHROPIC_API_KEY')
  const response = await fetch(ANTHROPIC_MESSAGES_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': ANTHROPIC_VERSION }, body: JSON.stringify({ model: env.ANTHROPIC_MODEL, max_tokens: 3000, temperature: 0.5, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: prompt }] }) })
  const body = await response.json<any>(); if (!response.ok) throw new Error(body?.error?.message || 'Anthropic generation failed')
  const text = body.content?.filter((x: any) => x.type === 'text').map((x: any) => x.text).join('\n') || ''
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim(); return { raw: text, parsed: JSON.parse(cleaned) }
}
async function blockedTerms(env: Env) { const rows = await env.DB.prepare('SELECT term FROM blocked_terms WHERE active = 1').all<{ term: string }>(); return rows.results.map(r => r.term) }
function scan(raw: string, terms: string[]) { const lower = raw.toLocaleLowerCase(); return terms.filter(term => lower.includes(term.toLocaleLowerCase())) }
function snippet(raw: string, term: string) { const i = raw.toLowerCase().indexOf(term.toLowerCase()); return raw.slice(Math.max(0, i - 100), Math.min(raw.length, i + term.length + 100)) }

async function generateEntity(request: Request, env: Env, account: AccountRow) {
  const input = await readBody(request); if (!input) return json(env, { error: 'Invalid JSON body' }, 400)
  if (!String(input.townName || '').trim() || !String(input.knownDetail1 || '').trim()) return json(env, { error: 'Town name and one known historical detail are required.' }, 400)
  account = await resetPeriodIfNeeded(account, env)
  if (account.tier === 'free' && account.generations_used_this_period >= FREE_LIMIT) return json(env, { error: 'You have used all three free town builds for this month.', code: 'FREE_LIMIT_REACHED', paidInfoUrl: env.PAID_INFO_URL }, 429)
  const terms = await blockedTerms(env); const flagged: Array<{ term: string; snippet: string }> = []; let generated: any
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await callAnthropic(env, userPrompt(input, account.tier === 'paid'))
    const hits = scan(result.raw, terms)
    if (!hits.length) { generated = result.parsed; break }
    hits.forEach(term => flagged.push({ term, snippet: snippet(result.raw, term) }))
  }
  if (!generated) {
    for (const f of flagged) await env.DB.prepare('INSERT INTO flagged_outputs (entity_id, flagged_term, raw_output_snippet) VALUES (NULL, ?, ?)').bind(f.term, f.snippet).run()
    return json(env, { error: 'The generator could not produce a compliant result. No generation was charged. Please try again.' }, 502)
  }
  const shouldSave = account.tier === 'paid'
  let entityId: number | null = null
  if (shouldSave) {
    const write = await env.DB.prepare(`INSERT INTO entities (account_id,town_name,era_or_industry,known_detail_1,known_detail_2,local_legend,injustice_focus,generated_content,tier_at_generation,semester_id,shared_to_community) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(account.id, String(input.townName), String(input.eraOrIndustry || DEFAULT_ERA), String(input.knownDetail1), input.knownDetail2 || null, input.localLegend || null, input.injusticeFocus || null, JSON.stringify(generated), account.tier, input.semesterId || null, input.shareToCommunity ? 1 : 0).run()
    entityId = Number(write.meta.last_row_id)
  }
  for (const f of flagged) await env.DB.prepare('INSERT INTO flagged_outputs (entity_id, flagged_term, raw_output_snippet) VALUES (?, ?, ?)').bind(entityId, f.term, f.snippet).run()
  const used = account.generations_used_this_period + 1; await env.DB.prepare('UPDATE accounts SET generations_used_this_period = ? WHERE id = ?').bind(used, account.id).run()
  return json(env, { id: entityId, entity: generated, saved: shouldSave, usage: { used, remaining: account.tier === 'free' ? Math.max(0, FREE_LIMIT - used) : null, resetAt: account.period_reset_at } })
}

export default {
  async fetch(request: Request, env: Env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) })
    if (request.headers.get('Origin') && request.headers.get('Origin') !== env.APP_ORIGIN) return json(env, { error: 'Origin not allowed' }, 403)
    const url = new URL(request.url); const path = url.pathname
    try {
      if (path === '/api/health') return json(env, { ok: true })
      if (path === '/api/auth/register' && request.method === 'POST') {
        const body = await readBody(request); if (!body) return json(env, { error: 'Invalid JSON body' }, 400)
        const email = normalizeEmail(body.email), password = String(body.password || ''), schoolName = String(body.schoolName || '').trim() || null
        if (!/^\S+@\S+\.\S+$/.test(email) || !validPassword(password)) return json(env, { error: 'Use a valid email and a password between 12 and 128 characters.' }, 400)
        const existing = await env.DB.prepare('SELECT id FROM accounts WHERE email = ?').bind(email).first(); if (existing) return json(env, { error: 'An account already exists for this email.' }, 409)
        const hash = await bcrypt.hash(password, 12); const reset = nextPeriod(); const inserted = await env.DB.prepare('INSERT INTO accounts (email,password_hash,school_name,period_reset_at) VALUES (?,?,?,?)').bind(email, hash, schoolName, reset).run()
        const account = await env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(inserted.meta.last_row_id).first<AccountRow>(); if (!account) throw new Error('Account creation failed')
        return json(env, { account: publicAccount(account) }, 201, { 'Set-Cookie': cookie(await signJwt(account, env), env) })
      }
      if (path === '/api/auth/login' && request.method === 'POST') {
        const body = await readBody(request); if (!body) return json(env, { error: 'Invalid JSON body' }, 400)
        const account = await env.DB.prepare('SELECT * FROM accounts WHERE email = ?').bind(normalizeEmail(body.email)).first<AccountRow>()
        if (!account || !await bcrypt.compare(String(body.password || ''), account.password_hash)) return json(env, { error: 'Email or password is incorrect.' }, 401)
        await resetPeriodIfNeeded(account, env); return json(env, { account: publicAccount(account) }, 200, { 'Set-Cookie': cookie(await signJwt(account, env), env) })
      }
      if (path === '/api/auth/logout' && request.method === 'POST') return json(env, { ok: true }, 200, { 'Set-Cookie': cookie('', env, true) })
      if (path === '/api/auth/forgot-password' && request.method === 'POST') return json(env, { message: 'Password reset email delivery is not configured yet. Contact support to reset access.' }, 202)
      const account = await getAccount(request, env); if (!account) return json(env, { error: 'Authentication required.' }, 401)
      if (path === '/api/auth/me' && request.method === 'GET') { await resetPeriodIfNeeded(account, env); return json(env, { account: publicAccount(account) }) }
      if (path === '/api/entities/generate' && request.method === 'POST') return generateEntity(request, env, account)
      if (path === '/api/entities' && request.method === 'GET') {
        if (account.tier !== 'paid') return json(env, { error: 'Saved semester archives require a paid account.' }, 403)
        const rows = await env.DB.prepare('SELECT id,town_name,generated_content,shared_to_community,created_at FROM entities WHERE account_id = ? ORDER BY created_at DESC').bind(account.id).all(); return json(env, { entities: rows.results })
      }
      const shareMatch = path.match(/^\/api\/entities\/(\d+)\/share$/)
      if (shareMatch && request.method === 'PATCH') {
        if (account.tier !== 'paid') return json(env, { error: 'Community sharing requires a paid account.' }, 403)
        const body = await readBody(request); await env.DB.prepare('UPDATE entities SET shared_to_community = ? WHERE id = ? AND account_id = ?').bind(body?.shared ? 1 : 0, Number(shareMatch[1]), account.id).run(); return json(env, { ok: true })
      }
      return json(env, { error: 'Not found' }, 404)
    } catch (error) { console.error(error); return json(env, { error: 'Internal server error', detail: error instanceof Error ? error.message : 'Unknown error' }, 500) }
  },
}

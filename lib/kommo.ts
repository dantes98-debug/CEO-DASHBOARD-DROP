import { createClient } from '@supabase/supabase-js'

const CLIENT_ID = '1d25ca37-8ed7-43d5-8ee8-d87473007b31'
const REDIRECT_URI = 'https://ceo-dashboard-drop.vercel.app/api/kommo/callback'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function subdomain() {
  return process.env.KOMMO_SUBDOMAIN || ''
}

export function getAuthUrl() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    state: 'drop-dashboard',
    mode: 'post_message',
  })
  return `https://www.kommo.com/oauth/?${params}`
}

export async function exchangeCode(code: string) {
  const res = await fetch(`https://${subdomain()}.kommo.com/oauth2/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: process.env.KOMMO_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    }),
  })
  return res.json()
}

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch(`https://${subdomain()}.kommo.com/oauth2/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: process.env.KOMMO_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      redirect_uri: REDIRECT_URI,
    }),
  })
  return res.json()
}

export async function saveTokens(accessToken: string, refreshToken: string, expiresIn: number) {
  const supabase = getServiceClient()
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn
  await supabase.from('config').upsert([
    { clave: 'kommo_access_token',   valor: accessToken },
    { clave: 'kommo_refresh_token',  valor: refreshToken },
    { clave: 'kommo_expires_at',     valor: String(expiresAt) },
  ], { onConflict: 'clave' })
}

export async function getAccessToken(): Promise<string | null> {
  const supabase = getServiceClient()
  const { data } = await supabase.from('config').select('clave, valor')
    .in('clave', ['kommo_access_token', 'kommo_refresh_token', 'kommo_expires_at'])
  if (!data || data.length < 3) return null

  const byKey = Object.fromEntries(data.map(r => [r.clave, r.valor]))
  const expiresAt = Number(byKey.kommo_expires_at || 0)
  const now = Math.floor(Date.now() / 1000)

  if (now < expiresAt - 300) return byKey.kommo_access_token

  // Refresh
  const refreshed = await refreshAccessToken(byKey.kommo_refresh_token)
  if (!refreshed.access_token) return null
  await saveTokens(refreshed.access_token, refreshed.refresh_token, refreshed.expires_in)
  return refreshed.access_token
}

export async function kommoGet(path: string) {
  const token = await getAccessToken()
  if (!token) throw new Error('Kommo no autorizado')
  const res = await fetch(`https://${subdomain()}.kommo.com/api/v4${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Kommo API error ${res.status}`)
  return res.json()
}

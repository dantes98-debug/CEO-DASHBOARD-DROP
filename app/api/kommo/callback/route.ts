import { NextRequest, NextResponse } from 'next/server'
import { exchangeCode, saveTokens } from '@/lib/kommo'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) {
    return NextResponse.redirect(new URL('/dashboard/crm?error=no_code', req.url))
  }

  const tokens = await exchangeCode(code)
  if (!tokens.access_token) {
    return NextResponse.redirect(new URL('/dashboard/crm?error=token_failed', req.url))
  }

  await saveTokens(tokens.access_token, tokens.refresh_token, tokens.expires_in)
  return NextResponse.redirect(new URL('/dashboard/crm?connected=1', req.url))
}

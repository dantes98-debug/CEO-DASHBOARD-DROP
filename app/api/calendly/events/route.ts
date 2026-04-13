import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface CalendlyEvent {
  uri: string
  name: string
  start_time: string
  end_time: string
  location?: { type: string; location?: string; join_url?: string }
  status: string
}

interface CalendlyInvitee {
  name: string
  email: string
}

export async function GET(request: Request) {
  const token = process.env.CALENDLY_API_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'Token no configurado' }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') // YYYY-MM-DD in ART (UTC-3)

  // Calculate day range in ART (UTC-3): day starts at 03:00 UTC, ends at next day 02:59:59 UTC
  const targetDate = date || new Date().toISOString().split('T')[0]
  const minStart = `${targetDate}T03:00:00Z`
  // next day
  const d = new Date(`${targetDate}T00:00:00-03:00`)
  d.setDate(d.getDate() + 1)
  const nextDate = d.toISOString().split('T')[0]
  const maxStart = `${nextDate}T03:00:00Z`

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  // 1. Get user URI
  const meRes = await fetch('https://api.calendly.com/users/me', { headers })
  if (!meRes.ok) {
    return NextResponse.json({ error: 'Error al conectar con Calendly' }, { status: meRes.status })
  }
  const meData = await meRes.json()
  const userUri = meData.resource?.uri as string

  // 2. Get scheduled events for the day
  const params = new URLSearchParams({
    user: userUri,
    min_start_time: minStart,
    max_start_time: maxStart,
    status: 'active',
    count: '100',
    sort: 'start_time:asc',
  })
  const eventsRes = await fetch(`https://api.calendly.com/scheduled_events?${params}`, { headers })
  if (!eventsRes.ok) {
    return NextResponse.json({ error: 'Error al obtener eventos' }, { status: eventsRes.status })
  }
  const eventsData = await eventsRes.json()
  const events: CalendlyEvent[] = eventsData.collection || []

  // 3. Fetch invitees for each event (parallel)
  const enriched = await Promise.all(
    events.map(async (ev) => {
      const uuid = ev.uri.split('/').pop()
      try {
        const invRes = await fetch(
          `https://api.calendly.com/scheduled_events/${uuid}/invitees?count=10`,
          { headers }
        )
        const invData = invRes.ok ? await invRes.json() : { collection: [] }
        const invitees: CalendlyInvitee[] = (invData.collection || []).map((i: CalendlyInvitee) => ({
          name: i.name,
          email: i.email,
        }))
        return {
          uuid,
          name: ev.name,
          start_time: ev.start_time,
          end_time: ev.end_time,
          location: ev.location?.join_url || ev.location?.location || ev.location?.type || null,
          invitees,
        }
      } catch {
        return {
          uuid,
          name: ev.name,
          start_time: ev.start_time,
          end_time: ev.end_time,
          location: null,
          invitees: [],
        }
      }
    })
  )

  return NextResponse.json({ events: enriched, date: targetDate })
}

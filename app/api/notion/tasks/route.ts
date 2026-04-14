import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const NOTION_TOKEN = process.env.NOTION_API_TOKEN
const DATABASE_ID = '30c92612f49380218a7fd0d9f0528d58'

export async function GET(request: Request) {
  if (!NOTION_TOKEN) return NextResponse.json({ error: 'Token no configurado' }, { status: 500 })

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') // YYYY-MM-DD

  const targetDate = date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })

  const body: Record<string, unknown> = {
    filter: {
      property: 'Fecha',
      date: { equals: targetDate },
    },
    sorts: [{ property: 'Fecha', direction: 'ascending' }],
    page_size: 50,
  }

  const res = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json()
    return NextResponse.json({ error: err.message || 'Error Notion' }, { status: res.status })
  }

  const data = await res.json()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tasks = data.results.map((page: any) => {
    const props = page.properties
    return {
      id: page.id,
      url: page.url,
      titulo: props.Tarea?.title?.[0]?.plain_text || 'Sin título',
      fecha_start: props.Fecha?.date?.start || null,
      fecha_end: props.Fecha?.date?.end || null,
      estado: props.Estado?.status?.name || props.Estado?.select?.name || null,
      prioridad: props.Prioridad?.select?.name || null,
      area: props.Área?.select?.name || null,
      notas: props.Notas?.rich_text?.[0]?.plain_text || null,
    }
  })

  return NextResponse.json({ tasks, date: targetDate })
}

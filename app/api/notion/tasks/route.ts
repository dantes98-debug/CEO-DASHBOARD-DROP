import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { z } from 'zod'

interface NotionProp { type: string; title?: { plain_text: string }[]; date?: { start: string; end: string | null }; status?: { name: string }; select?: { name: string }; rich_text?: { plain_text: string }[] }
type NotionProps = Record<string, NotionProp>

export const dynamic = 'force-dynamic'

const NOTION_TOKEN = process.env.NOTION_API_TOKEN
const DATABASE_ID = process.env.NOTION_DATABASE_ID || '30c92612f49380218a7fd0d9f0528d58'

const PatchSchema = z.object({
  pageId: z.string().min(1),
  done:   z.boolean(),
})

async function requireAuth() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET(request: Request) {
  if (!await requireAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

  const tasks = data.results.map((page: { id: string; url: string; properties: NotionProps }) => {
    const props = page.properties

    const titleProp = Object.values(props).find(p => p.type === 'title')
    const titulo = titleProp?.title?.[0]?.plain_text || '(sin título)'

    const fechaProp = props.Fecha || props.Date || props.fecha
    const estadoProp = props.Estado || props.Status || props.estado
    const estado = estadoProp?.status?.name || estadoProp?.select?.name || null

    return {
      id: page.id,
      url: page.url,
      titulo,
      fecha_start: fechaProp?.date?.start || null,
      fecha_end: fechaProp?.date?.end || null,
      estado,
      prioridad: props.Prioridad?.select?.name || null,
      area: props.Área?.select?.name || null,
      notas: props.Notas?.rich_text?.[0]?.plain_text || null,
    }
  })

  return NextResponse.json({ tasks, date: targetDate })
}

export async function PATCH(request: Request) {
  if (!await requireAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!NOTION_TOKEN) return NextResponse.json({ error: 'Token no configurado' }, { status: 500 })

  const body = await request.json()
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { pageId, done } = parsed.data

  // Fetch page first to find the status property name and its done option
  const pageRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
    },
  })
  const pageData = await pageRes.json()
  const props = pageData.properties || {}

  interface StatusGroup { name: string; color: string; option_ids: string[] }
  interface StatusOption { id: string; name: string }

  const statusEntry = Object.entries(props as NotionProps).find(([, v]) => v.type === 'status')
  if (!statusEntry) return NextResponse.json({ ok: true })

  const [statusPropName, statusProp] = statusEntry

  const dbRes = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}`, {
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
    },
  })
  const dbData = await dbRes.json()
  const dbStatusProp = dbData.properties?.[statusPropName]
  const groups: StatusGroup[] = dbStatusProp?.status?.groups || []
  const allOptions: StatusOption[] = dbStatusProp?.status?.options || []

  let targetName: string | null = null
  if (done) {
    const completeGroup = groups.find(g => g.name === 'Complete' || g.color === 'green')
    const optionId = completeGroup?.option_ids?.[0]
    targetName = allOptions.find(o => o.id === optionId)?.name || '✅ Hecha'
  } else {
    const notStartedGroup = groups.find(g => g.name === 'Not started' || g.color === 'gray' || g.color === 'default')
    const optionId = notStartedGroup?.option_ids?.[0]
    targetName = allOptions.find(o => o.id === optionId)?.name || statusProp?.status?.name || null
  }

  if (!targetName) return NextResponse.json({ ok: true })

  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({
      properties: {
        [statusPropName]: { status: { name: targetName } },
      },
    }),
  })

  return NextResponse.json({ ok: res.ok })
}

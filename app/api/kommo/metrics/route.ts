import { NextRequest, NextResponse } from 'next/server'
import { kommoGet } from '@/lib/kommo'
import { createClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const now = Math.floor(Date.now() / 1000)
    const mesStart = new Date(); mesStart.setDate(1); mesStart.setHours(0, 0, 0, 0)
    const mesStartTs = Math.floor(mesStart.getTime() / 1000)

    const [leadsRes, pipelinesRes, contactsRes] = await Promise.all([
      kommoGet('/leads?limit=250&filter[created_at][from]=' + mesStartTs),
      kommoGet('/leads/pipelines'),
      kommoGet('/contacts?limit=1&filter[created_at][from]=' + mesStartTs),
    ])

    const leads: any[] = leadsRes?._embedded?.leads || []
    const pipelines: any[] = pipelinesRes?._embedded?.pipelines || []
    const totalContactosMes: number = contactsRes?._page_count || 0

    // Pipeline stages map
    const stageMap = new Map<number, { name: string; pipelineName: string; type: number }>()
    for (const pipeline of pipelines) {
      for (const stage of pipeline._embedded?.statuses || []) {
        stageMap.set(stage.id, {
          name: stage.name,
          pipelineName: pipeline.name,
          type: stage.type, // 142 = won, 143 = lost
        })
      }
    }

    // KPIs
    const totalLeads = leads.length
    const ganados = leads.filter(l => stageMap.get(l.status_id)?.type === 142).length
    const perdidos = leads.filter(l => stageMap.get(l.status_id)?.type === 143).length
    const enProceso = totalLeads - ganados - perdidos
    const conversionPct = totalLeads > 0 ? Math.round((ganados / totalLeads) * 100) : 0

    // Por etapa
    const porEtapa = new Map<string, number>()
    for (const lead of leads) {
      const stage = stageMap.get(lead.status_id)
      if (!stage) continue
      const key = stage.name
      porEtapa.set(key, (porEtapa.get(key) || 0) + 1)
    }

    // Por fuente (utm_source custom field o tag)
    const porFuente = new Map<string, number>()
    for (const lead of leads) {
      const tags: any[] = lead._embedded?.tags || []
      const fuente = tags[0]?.name || 'Sin fuente'
      porFuente.set(fuente, (porFuente.get(fuente) || 0) + 1)
    }

    // Valor total ganado
    const valorGanado = leads
      .filter(l => stageMap.get(l.status_id)?.type === 142)
      .reduce((s, l) => s + (l.price || 0), 0)

    return NextResponse.json({
      totalLeads,
      ganados,
      perdidos,
      enProceso,
      conversionPct,
      valorGanado,
      totalContactosMes,
      porEtapa: Array.from(porEtapa.entries()).map(([etapa, count]) => ({ etapa, count })).sort((a, b) => b.count - a.count),
      porFuente: Array.from(porFuente.entries()).map(([fuente, count]) => ({ fuente, count })).sort((a, b) => b.count - a.count),
      pipelines: pipelines.map(p => ({ id: p.id, name: p.name })),
    })
  } catch (err: any) {
    if (err.message?.includes('no autorizado') || err.message?.includes('No autorizado')) {
      return NextResponse.json({ error: 'not_connected' }, { status: 401 })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

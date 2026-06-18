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
    const mesAnteriorStart = new Date(mesStart); mesAnteriorStart.setMonth(mesAnteriorStart.getMonth() - 1)
    const mesAnteriorStartTs = Math.floor(mesAnteriorStart.getTime() / 1000)

    const [leadsRes, leadsAnteriorRes, pipelinesRes, usersRes] = await Promise.all([
      kommoGet('/leads?limit=250&with=contacts&filter[created_at][from]=' + mesStartTs),
      kommoGet('/leads?limit=250&filter[created_at][from]=' + mesAnteriorStartTs + '&filter[created_at][to]=' + mesStartTs),
      kommoGet('/leads/pipelines'),
      kommoGet('/users?limit=50'),
    ])

    const leads: any[] = leadsRes?._embedded?.leads || []
    const leadsAnterior: any[] = leadsAnteriorRes?._embedded?.leads || []
    const pipelines: any[] = pipelinesRes?._embedded?.pipelines || []
    const users: any[] = usersRes?._embedded?.users || []

    const userMap = new Map<number, string>()
    for (const u of users) userMap.set(u.id, u.name)

    // Stage map
    const stageMap = new Map<number, { name: string; pipelineName: string; type: number; order: number }>()
    for (const pipeline of pipelines) {
      const statuses: any[] = pipeline._embedded?.statuses || []
      statuses.forEach((stage, idx) => {
        stageMap.set(stage.id, { name: stage.name, pipelineName: pipeline.name, type: stage.type ?? 0, order: idx })
      })
    }

    const isGanado = (lead: any) => {
      const stage = stageMap.get(lead.status_id)
      if (!stage) return false
      return stage.type === 142 || /ganado|won|^ganados$/i.test(stage.name)
    }
    const isPerdido = (lead: any) => {
      const stage = stageMap.get(lead.status_id)
      if (!stage) return false
      return stage.type === 143 || /perdido|lost|descartado|^perdidos$/i.test(stage.name)
    }

    const ganados = leads.filter(isGanado)
    const perdidos = leads.filter(isPerdido)
    const enProceso = leads.filter(l => !isGanado(l) && !isPerdido(l))

    // Mes anterior
    const ganadosAnterior = leadsAnterior.filter(isGanado)
    const perdidosAnterior = leadsAnterior.filter(isPerdido)

    const totalLeads = leads.length
    const conversionPct = totalLeads > 0 ? Math.round((ganados.length / totalLeads) * 100) : 0
    const conversionPctAnterior = leadsAnterior.length > 0 ? Math.round((ganadosAnterior.length / leadsAnterior.length) * 100) : 0

    const valorPipeline = enProceso.reduce((s, l) => s + (l.price || 0), 0)
    const valorGanado = ganados.reduce((s, l) => s + (l.price || 0), 0)
    const valorGanadoAnterior = ganadosAnterior.reduce((s, l) => s + (l.price || 0), 0)
    const ticketPromedio = ganados.length > 0 ? Math.round(valorGanado / ganados.length) : 0

    // Leads calientes: etapas de cierre
    const ETAPAS_CALIENTES = /listo.*cerrar|negociaci|pago.*pend|coordinar|cerrar|cotizar|propuesta|presupuest/i
    const leadsCalientes = enProceso
      .filter(l => {
        const stage = stageMap.get(l.status_id)
        return stage && ETAPAS_CALIENTES.test(stage.name)
      })
      .sort((a, b) => (b.price || 0) - (a.price || 0))
      .slice(0, 15)
      .map(l => ({
        id: l.id,
        nombre: l.name,
        valor: l.price || 0,
        etapa: stageMap.get(l.status_id)?.name || '',
        responsable: userMap.get(l.responsible_user_id) || '',
        diasAbierto: Math.round((now - l.created_at) / 86400),
        ultimaActividad: l.updated_at ? Math.round((now - l.updated_at) / 86400) : null,
      }))

    // Leads fríos: sin actividad en +14 días y no ganados/perdidos
    const leadsFrios = enProceso
      .filter(l => l.updated_at && (now - l.updated_at) > 14 * 86400)
      .sort((a, b) => (a.updated_at || 0) - (b.updated_at || 0))
      .slice(0, 10)
      .map(l => ({
        id: l.id,
        nombre: l.name,
        valor: l.price || 0,
        etapa: stageMap.get(l.status_id)?.name || '',
        responsable: userMap.get(l.responsible_user_id) || '',
        diasSinActividad: Math.round((now - (l.updated_at || l.created_at)) / 86400),
      }))

    // Velocidad de cierre (días promedio)
    const velocidad = ganados.length > 0
      ? Math.round(ganados.reduce((s, l) => s + (now - l.created_at) / 86400, 0) / ganados.length)
      : null

    // Embudo por etapa con valor ARS
    const embudoMap = new Map<string, { count: number; valor: number; order: number; pipeline: string }>()
    for (const lead of leads) {
      const stage = stageMap.get(lead.status_id)
      if (!stage) continue
      const prev = embudoMap.get(stage.name) || { count: 0, valor: 0, order: stage.order, pipeline: stage.pipelineName }
      embudoMap.set(stage.name, { count: prev.count + 1, valor: prev.valor + (lead.price || 0), order: prev.order, pipeline: prev.pipeline })
    }
    const embudo = Array.from(embudoMap.entries())
      .map(([etapa, d]) => ({ etapa, ...d }))
      .sort((a, b) => b.count - a.count)

    // Por responsable
    const porResponsable = new Map<string, { leads: number; valor: number; ganados: number }>()
    for (const lead of leads) {
      const nombre = userMap.get(lead.responsible_user_id) || 'Sin asignar'
      const prev = porResponsable.get(nombre) || { leads: 0, valor: 0, ganados: 0 }
      porResponsable.set(nombre, {
        leads: prev.leads + 1,
        valor: prev.valor + (lead.price || 0),
        ganados: prev.ganados + (isGanado(lead) ? 1 : 0),
      })
    }
    const ranking = Array.from(porResponsable.entries())
      .map(([nombre, d]) => ({ nombre, ...d }))
      .sort((a, b) => b.valor - a.valor)

    return NextResponse.json({
      // KPIs mes actual
      totalLeads,
      ganados: ganados.length,
      perdidos: perdidos.length,
      enProceso: enProceso.length,
      conversionPct,
      valorGanado,
      valorPipeline,
      ticketPromedio,
      calientes: leadsCalientes.length,
      velocidad,
      // Comparativa mes anterior
      totalLeadsAnterior: leadsAnterior.length,
      ganadosAnterior: ganadosAnterior.length,
      perdidosAnterior: perdidosAnterior.length,
      conversionPctAnterior,
      valorGanadoAnterior,
      // Listas
      leadsCalientes,
      leadsFrios,
      embudo,
      ranking,
    })
  } catch (err: any) {
    if (err.message?.includes('no autorizado') || err.message?.includes('No autorizado')) {
      return NextResponse.json({ error: 'not_connected' }, { status: 401 })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

'use client'

import * as XLSX from 'xlsx'
import { createClient } from './supabase'

const TABLAS: string[] = [
  'ventas',
  'clientes',
  'estudios',
  'gastos',
  'gastos_plantillas',
  'reuniones',
  'productos',
  'kpi_objetivos',
  'config',
  'cotizaciones',
  'cajas',
  'movimientos_caja',
  'comisiones',
  'envios',
  'inversiones',
  'stock',
  'objetivos',
  'estudios_mercado',
  'importaciones',
]

function flattenRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) out[k] = ''
    else if (typeof v === 'object') out[k] = JSON.stringify(v)
    else out[k] = v
  }
  return out
}

export async function descargarBackup(
  onProgress?: (msg: string) => void
): Promise<void> {
  const supabase = createClient()
  const wb = XLSX.utils.book_new()
  const resumen: { Tabla: string; Registros: number; Estado: string }[] = []

  for (const tabla of TABLAS) {
    onProgress?.(`Exportando ${tabla}...`)
    const { data, error } = await supabase.from(tabla).select('*')
    if (error || !data) {
      resumen.push({ Tabla: tabla, Registros: 0, Estado: error?.message || 'vacía' })
      continue
    }
    const rows = data.map(flattenRow)
    const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{}])
    XLSX.utils.book_append_sheet(wb, ws, tabla.slice(0, 31))
    resumen.push({ Tabla: tabla, Registros: data.length, Estado: 'OK' })
  }

  const fechaStr = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
  const wsMeta = XLSX.utils.json_to_sheet([
    { Campo: 'Fecha de backup', Valor: fechaStr },
    { Campo: 'Tablas incluidas', Valor: TABLAS.length },
    { Campo: 'Total registros', Valor: resumen.reduce((s, r) => s + r.Registros, 0) },
    { Campo: '', Valor: '' },
    { Campo: '--- Detalle por tabla ---', Valor: '' },
    ...resumen.map(r => ({ Campo: r.Tabla, Valor: r.Registros, Estado: r.Estado })),
  ])
  XLSX.utils.book_append_sheet(wb, wsMeta, '_resumen')

  const dateTag = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `backup-drop-${dateTag}.xlsx`)
}

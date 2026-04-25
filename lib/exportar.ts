import * as XLSX from 'xlsx'

export function exportarExcel(datos: Record<string, unknown>[], nombreArchivo: string) {
  const ws = XLSX.utils.json_to_sheet(datos)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Datos')
  XLSX.writeFile(wb, `${nombreArchivo}.xlsx`)
}

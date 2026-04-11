'use client'

import { useRef, useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'

export interface ItemFactura {
  sku: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  total: number
}

export interface FacturaParseada {
  numero_factura: string
  fecha: string
  razon_social: string
  tipo: 'blanco_a' | 'blanco_b' | 'negro'
  subtotal: number
  iva_monto: number
  total: number
  items: ItemFactura[]
  pdfFile: File
  rawText: string
}

interface Props {
  onParsed: (data: FacturaParseada) => void
}

// Detecta si un string es un número argentino o US y lo convierte
function parseNum(s: string): number {
  if (!s) return 0
  const cleaned = s.trim()
  // Argentine format: 1.064.649,60 (comma = decimal)
  if (cleaned.includes(',')) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0
  }
  // US format with dot as decimal: 529660.00
  // Multiple dots = thousands separator: 1.064.649
  const dots = (cleaned.match(/\./g) || []).length
  if (dots === 0) return parseFloat(cleaned) || 0
  if (dots === 1) {
    // Single dot — check if last part is 2 digits (decimal) or not
    const parts = cleaned.split('.')
    if (parts[1].length <= 2) return parseFloat(cleaned) || 0
    // Otherwise all dots are thousands separators
    return parseFloat(cleaned.replace(/\./g, '')) || 0
  }
  // Multiple dots = all are thousands separators
  return parseFloat(cleaned.replace(/\./g, '')) || 0
}

// Group PDF text tokens by row (similar Y coordinate)
interface Token { str: string; x: number; y: number }

function groupByRows(tokens: Token[], tolerance = 3): Token[][] {
  const sorted = [...tokens].sort((a, b) => b.y - a.y) // top to bottom
  const rows: Token[][] = []
  let current: Token[] = []
  let lastY = Infinity

  for (const t of sorted) {
    if (Math.abs(t.y - lastY) > tolerance && current.length > 0) {
      rows.push(current.sort((a, b) => a.x - b.x))
      current = []
    }
    current.push(t)
    lastY = t.y
  }
  if (current.length > 0) rows.push(current.sort((a, b) => a.x - b.x))
  return rows
}

function rowText(row: Token[]) {
  return row.map(t => t.str).join(' ').replace(/\s+/g, ' ').trim()
}

// Check if string looks like a price (number > 0)
function isPrice(s: string): boolean {
  const n = parseNum(s)
  return n > 100 && /^[\d.,]+$/.test(s.trim())
}

// Check if string looks like a SKU (7-9 digit code OR alphanumeric like CB1601)
function isSku(s: string): boolean {
  return /^\d{6,9}$/.test(s) || /^[A-Z]{2,6}\d{3,6}(-[A-Z]{2,4})?$/.test(s)
}

export default function FacturaUploader({ onParsed }: Props) {
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const parsePDF = async (file: File) => {
    setParsing(true)
    setError(null)
    try {
      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`

      const buffer = await file.arrayBuffer()
      const pdf = await pdfjs.getDocument({ data: buffer }).promise

      let allTokens: Token[] = []
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p)
        const content = await page.getTextContent()
        for (const item of content.items) {
          if ('str' in item && item.str.trim()) {
            allTokens.push({ str: item.str.trim(), x: item.transform[4], y: item.transform[5] })
          }
        }
      }

      const fullText = allTokens.map(t => t.str).join(' ')
      const rows = groupByRows(allTokens)

      // ── Tipo de factura ──
      let tipo: 'blanco_a' | 'blanco_b' | 'negro' = 'blanco_a'
      if (/Cod\.?\s*N[°º]?\s*0*6\b/i.test(fullText)) tipo = 'blanco_b'
      else if (/Cod\.?\s*N[°º]?\s*0*1\b/i.test(fullText)) tipo = 'blanco_a'

      // ── Número de factura ──
      const nroMatch = fullText.match(/N[°º]\s*(\d{4}-\d{8})/)
      const numero_factura = nroMatch ? nroMatch[1] : ''

      // ── Fecha ──
      const fechaMatch = fullText.match(/(\d{2})\/(\d{2})\/(\d{4})/)
      let fecha = new Date().toISOString().split('T')[0]
      if (fechaMatch) fecha = `${fechaMatch[3]}-${fechaMatch[2]}-${fechaMatch[1]}`

      // ── Razón social cliente ──
      const rsMatch = fullText.match(/R\.?\s*Social[:\s]+(.+?)(?:\s+Cliente\s*:|$)/i)
      const razon_social = rsMatch ? rsMatch[1].trim() : ''

      // ── Items: parse row by row ──
      const items: ItemFactura[] = []

      for (const row of rows) {
        const text = rowText(row)
        const tokens = row.map(t => t.str)

        // A product row starts with a quantity (1-99) followed by a SKU
        if (tokens.length < 4) continue
        const cantStr = tokens[0]
        const cant = parseInt(cantStr)
        if (isNaN(cant) || cant < 1 || cant > 99) continue
        if (!isSku(tokens[1])) continue

        const sku = tokens[1]

        // Find the last two price-like tokens (P.Unitario and P.Final)
        const priceTokens = tokens.filter(t => isPrice(t))
        if (priceTokens.length < 1) continue

        let precioUnit: number
        let precioTotal: number

        if (priceTokens.length >= 2) {
          precioUnit = parseNum(priceTokens[priceTokens.length - 2])
          precioTotal = parseNum(priceTokens[priceTokens.length - 1])
        } else {
          precioUnit = parseNum(priceTokens[0])
          precioTotal = precioUnit * cant
        }

        if (precioTotal < 100) continue

        // Description = everything between SKU and first price
        const firstPriceIdx = tokens.findIndex(t => isPrice(t))
        const descTokens = tokens.slice(2, firstPriceIdx > 2 ? firstPriceIdx : tokens.length - 1)
        const descripcion = descTokens.join(' ').replace(/\s+/g, ' ').trim()

        items.push({ sku, descripcion, cantidad: cant, precio_unitario: precioUnit, total: precioTotal })
      }

      // ── Totales: buscar filas específicas ──
      let subtotal = 0, iva_monto = 0, total = 0

      for (const row of rows) {
        const text = rowText(row)
        const nums = row.map(t => t.str).filter(t => isPrice(t))

        if (/\bSUBTOTAL\b/i.test(text) && nums.length > 0) {
          subtotal = parseNum(nums[nums.length - 1])
        }
        if (/IVA\s+INSCR\s+21%/i.test(text) && nums.length > 0) {
          iva_monto += parseNum(nums[nums.length - 1])
        }
        if (/IVA\s+INSCR\s+10[,.]?5%/i.test(text) && nums.length > 0) {
          iva_monto += parseNum(nums[nums.length - 1])
        }
        // TOTAL row: last big number
        if (/\bTOTAL\b/i.test(text) && !/SUBTOTAL/i.test(text) && nums.length > 0) {
          const candidate = parseNum(nums[nums.length - 1])
          if (candidate > total) total = candidate
        }
      }

      // Fallback: total = subtotal + iva si no se encontró
      if (total === 0 && subtotal > 0) total = subtotal + iva_monto
      if (subtotal === 0 && items.length > 0) subtotal = items.reduce((s, i) => s + i.total, 0)

      onParsed({
        numero_factura, fecha, razon_social, tipo,
        subtotal, iva_monto, total,
        items, pdfFile: file,
        rawText: fullText.slice(0, 3000),
      })
    } catch (err) {
      console.error('PDF parse error:', err)
      setError('No se pudo leer el PDF. Completá los datos manualmente.')
      onParsed({
        numero_factura: '', fecha: new Date().toISOString().split('T')[0],
        razon_social: '', tipo: 'blanco_a', subtotal: 0, iva_monto: 0, total: 0,
        items: [], pdfFile: file, rawText: '',
      })
    }
    setParsing(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div>
      <input ref={fileRef} type="file" accept=".pdf" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) parsePDF(f) }} />
      <button type="button" onClick={() => fileRef.current?.click()} disabled={parsing}
        className="flex items-center gap-2 bg-card hover:bg-card-hover border border-border text-text-primary px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
        {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
        {parsing ? 'Leyendo PDF...' : 'Cargar Factura PDF'}
      </button>
      {error && <p className="text-xs text-yellow-600 mt-1">{error}</p>}
    </div>
  )
}

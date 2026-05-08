'use client'

import { useRef, useState } from 'react'
import { FileText, Loader2, X } from 'lucide-react'

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

type TipoFactura = 'blanco_a' | 'blanco_b' | 'negro'

const TIPO_OPTS: { value: TipoFactura; label: string; style: string }[] = [
  { value: 'blanco_a', label: 'Factura A', style: 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100' },
  { value: 'blanco_b', label: 'Factura B', style: 'border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100' },
  { value: 'negro',    label: 'Negro / Prueba', style: 'border-yellow-300 bg-yellow-50 text-yellow-700 hover:bg-yellow-100' },
]

function parseNum(s: string): number {
  if (!s) return 0
  const cleaned = s.trim()
  if (cleaned.includes(',')) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0
  }
  const dots = (cleaned.match(/\./g) || []).length
  if (dots === 0) return parseFloat(cleaned) || 0
  if (dots === 1) {
    const parts = cleaned.split('.')
    if (parts[1].length <= 2) return parseFloat(cleaned) || 0
    return parseFloat(cleaned.replace(/\./g, '')) || 0
  }
  return parseFloat(cleaned.replace(/\./g, '')) || 0
}

interface Token { str: string; x: number; y: number }

function groupByRows(tokens: Token[], tolerance = 3): Token[][] {
  const sorted = [...tokens].sort((a, b) => b.y - a.y)
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

function isPrice(s: string): boolean {
  const n = parseNum(s)
  return n > 100 && /^[\d.,]+$/.test(s.trim())
}

export default function FacturaUploader({ onParsed }: Props) {
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectingType, setSelectingType] = useState(false)
  const [tipoSeleccionado, setTipoSeleccionado] = useState<TipoFactura | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleTipoClick = (tipo: TipoFactura) => {
    setTipoSeleccionado(tipo)
    setSelectingType(false)
    setTimeout(() => fileRef.current?.click(), 50)
  }

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

      // ── Tipo: usa el seleccionado por el usuario; solo auto-detecta si no hay selección ──
      let tipo: TipoFactura = tipoSeleccionado || 'blanco_a'
      if (!tipoSeleccionado) {
        if (/Cod\.?\s*N[°º]?\s*0*6\b/i.test(fullText)) tipo = 'blanco_b'
        else if (/Cod\.?\s*N[°º]?\s*0*1\b/i.test(fullText)) tipo = 'blanco_a'
      }

      // ── Número de factura ──
      const nroMatch = fullText.match(/N[°º]\s*(\d{4}-\d{8})/)
      const numero_factura = nroMatch ? nroMatch[1] : ''

      // ── Fecha ──
      const fechaMatch = fullText.match(/(\d{2})\/(\d{2})\/(\d{4})/)
      let fecha = new Date().toISOString().split('T')[0]
      if (fechaMatch) fecha = `${fechaMatch[3]}-${fechaMatch[2]}-${fechaMatch[1]}`

      // ── Razón social ──
      const rsMatch = fullText.match(/R\.?\s*Social[:\s]+(.+?)(?:\s+Cliente\s*:|$)/i)
      const razon_social = rsMatch ? rsMatch[1].trim() : ''

      // ── Items ──
      const items: ItemFactura[] = []
      const flat = [...allTokens]
        .sort((a, b) => Math.abs(b.y - a.y) > 3 ? b.y - a.y : a.x - b.x)
        .flatMap(t => t.str.trim().split(/\s+/))
        .filter(s => s !== '')

      for (let i = 0; i < flat.length; i++) {
        const skuMatch = flat[i].match(/^([A-Za-z]{1,6}\d{2,6})(-[A-Za-z].+)?$/)
        if (!skuMatch) continue
        const sku = skuMatch[1].toUpperCase()
        const descPrefix = skuMatch[2] ? skuMatch[2].replace(/^-/, '') : ''

        let cant = 1
        for (let back = i - 1; back >= Math.max(0, i - 3); back--) {
          const tok = flat[back]
          if (isPrice(tok) || /^\d{6,}$/.test(tok)) break
          const n = parseInt(tok)
          if (!isNaN(n) && n >= 1 && n <= 999 && /^\d+$/.test(tok)) { cant = n; break }
        }

        const descTokens: string[] = descPrefix ? [descPrefix] : []
        let j = i + 1
        while (j < flat.length) {
          const tok = flat[j]
          if (isPrice(tok)) break
          if (tok !== '-' && !/^remito/i.test(tok)) descTokens.push(tok)
          j++
        }

        const prices: number[] = []
        while (j < flat.length && isPrice(flat[j])) {
          prices.push(parseNum(flat[j]))
          j++
        }

        const precioTotal = prices.length > 0 ? prices[prices.length - 1] : 0
        const precioUnit = prices.length >= 2 ? prices[prices.length - 2] : precioTotal / (cant || 1)
        const descripcion = descTokens.join(' ').replace(/\s+/g, ' ').trim()
        items.push({ sku, descripcion, cantidad: cant, precio_unitario: precioUnit, total: precioTotal })
        i = j - 1
      }

      // ── Totales ──
      let subtotal = 0, iva_monto = 0, total = 0

      // Negro/Prueba: no tiene IVA por definición
      if (tipo === 'negro') {
        for (let i = 0; i < rows.length; i++) {
          const text = rowText(rows[i])
          const nums = rows[i].map(t => t.str).filter(t => isPrice(t))
          const nextNums = i + 1 < rows.length ? rows[i + 1].map(t => t.str).filter(t => isPrice(t)) : []
          const effectiveNums = nums.length > 0 ? nums : nextNums
          if (/\bTOTAL\b/i.test(text) && !/SUBTOTAL/i.test(text) && effectiveNums.length > 0) {
            const candidate = parseNum(effectiveNums[effectiveNums.length - 1])
            if (candidate > total) total = candidate
          }
        }
        if (total === 0 && items.length > 0) total = items.reduce((s, i) => s + i.total, 0)
        if (total === 0) {
          const allPrices = allTokens.map(t => t.str).filter(t => isPrice(t)).map(t => parseNum(t))
          if (allPrices.length > 0) total = Math.max(...allPrices)
        }
        subtotal = total
        iva_monto = 0
      } else {
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i]
          const text = rowText(row)
          const nums = row.map(t => t.str).filter(t => isPrice(t))
          const nextNums = i + 1 < rows.length ? rows[i + 1].map(t => t.str).filter(t => isPrice(t)) : []
          const effectiveNums = nums.length > 0 ? nums : nextNums

          if (/\bSUBTOTAL\b/i.test(text) && effectiveNums.length > 0)
            subtotal = parseNum(effectiveNums[effectiveNums.length - 1])
          if (/IVA\s+INSCR\s+21%/i.test(text) && effectiveNums.length > 0)
            iva_monto += parseNum(effectiveNums[effectiveNums.length - 1])
          if (/IVA\s+INSCR\s+10[,.]?5%/i.test(text) && effectiveNums.length > 0)
            iva_monto += parseNum(effectiveNums[effectiveNums.length - 1])
          if (/\bTOTAL\b/i.test(text) && !/SUBTOTAL/i.test(text) && effectiveNums.length > 0) {
            const candidate = parseNum(effectiveNums[effectiveNums.length - 1])
            if (candidate > total) total = candidate
          }
        }
        if (total === 0 && subtotal > 0) total = subtotal + iva_monto
        if (subtotal === 0 && total > 0 && iva_monto > 0) subtotal = total - iva_monto
        if (subtotal === 0 && items.length > 0) subtotal = items.reduce((s, i) => s + i.total, 0)
        if (total === 0) {
          const allPrices = allTokens.map(t => t.str).filter(t => isPrice(t)).map(t => parseNum(t))
          if (allPrices.length > 0) total = Math.max(...allPrices)
        }
      }

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
        razon_social: '', tipo: tipoSeleccionado || 'blanco_a',
        subtotal: 0, iva_monto: 0, total: 0,
        items: [], pdfFile: file, rawText: '',
      })
    }
    setParsing(false)
    setTipoSeleccionado(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) parsePDF(f) }}
      />

      {parsing ? (
        <button type="button" disabled
          className="flex items-center gap-2 bg-card border border-border text-text-muted px-4 py-2 rounded-lg text-sm font-medium opacity-50">
          <Loader2 className="w-4 h-4 animate-spin" />
          Leyendo PDF...
        </button>
      ) : selectingType ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-text-muted font-medium whitespace-nowrap">¿Qué tipo de comprobante?</span>
          {TIPO_OPTS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleTipoClick(opt.value)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${opt.style}`}
            >
              {opt.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSelectingType(false)}
            className="text-text-muted hover:text-text-primary transition-colors p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setSelectingType(true)}
          className="flex items-center gap-2 bg-card hover:bg-card-hover border border-border text-text-primary px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <FileText className="w-4 h-4" />
          Cargar Factura PDF
        </button>
      )}

      {error && <p className="text-xs text-yellow-600 mt-1">{error}</p>}
    </div>
  )
}

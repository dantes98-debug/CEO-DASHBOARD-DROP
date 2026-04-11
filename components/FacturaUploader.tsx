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

function parseNum(s: string): number {
  if (!s) return 0
  // Handle Argentine number format: 1.064.649,60 or 1064649.60
  const cleaned = s.replace(/\./g, '').replace(',', '.')
  return parseFloat(cleaned) || 0
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
      pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`

      const buffer = await file.arrayBuffer()
      const pdf = await pdfjs.getDocument({ data: buffer }).promise

      // Get all text items with positions for better parsing
      let allItems: Array<{ str: string; x: number; y: number; page: number }> = []
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p)
        const content = await page.getTextContent()
        for (const item of content.items) {
          if ('str' in item && item.str.trim()) {
            const tx = item.transform
            allItems.push({ str: item.str.trim(), x: tx[4], y: tx[5], page: p })
          }
        }
      }

      const fullText = allItems.map(i => i.str).join(' ')

      // ── Tipo de factura ──
      let tipo: 'blanco_a' | 'blanco_b' | 'negro' = 'blanco_a'
      if (/Cod\.\s*N[°º]?\s*0*6\b|Factura\s+B\b/i.test(fullText)) tipo = 'blanco_b'
      else if (/Cod\.\s*N[°º]?\s*0*1\b|Factura\s+A\b/i.test(fullText)) tipo = 'blanco_a'

      // ── Número de factura ──
      // Pattern: N° 0002-00000237
      const nroMatch = fullText.match(/N[°º]\s*(\d{4}-\d{8})/)
      const numero_factura = nroMatch ? nroMatch[1] : ''

      // ── Fecha ── (first dd/mm/yyyy found)
      const fechaMatch = fullText.match(/(\d{2})\/(\d{2})\/(\d{4})/)
      let fecha = new Date().toISOString().split('T')[0]
      if (fechaMatch) {
        fecha = `${fechaMatch[3]}-${fechaMatch[2]}-${fechaMatch[1]}`
      }

      // ── Razón social cliente ──
      // "R. Social: NOMBRE LARGO Cliente: 3570"
      const rsMatch = fullText.match(/R\.\s*Social[:\s]+(.+?)(?:\s+Cliente\s*:|$)/i)
      const razon_social = rsMatch ? rsMatch[1].trim() : ''

      // ── Items ──
      // Format per line: CANTIDAD  SKU_CODE  DESCRIPTION  PRECIO_UNITARIO  P_FINAL
      // Example: "1 7020100 CO905 - COCINA - COCINA GOURMET - 529660.00 529660.00"
      // SKU codes are 7+ digit numbers or alphanumeric codes
      // We detect lines with: number + SKU + description + two monetary values
      const items: ItemFactura[] = []

      // Strategy: find sequences like: integer, then code, then description, then two big numbers
      // The pattern for a line item in these invoices:
      // ^(\d+)\s+(\S+)\s+(.*?)\s+([\d.,]+)\s+([\d.,]+)$
      // But since PDF text is space-separated, we use a different approach

      // Split text by looking for item patterns
      // Items start with a quantity (1, 2, 3) followed by a code (7+ chars alphanumeric)
      const itemRegex = /\b(\d{1,2})\s+(\d{7,9}|[A-Z]{2,6}\d{3,6}(?:-[A-Z]{2,4})?)\s+([\w\s\-]+?)\s+([\d]{2,}(?:[.,]\d{2})?)\s+([\d]{2,}(?:[.,]\d{2})?)/g

      let m
      const seen = new Set<string>()
      while ((m = itemRegex.exec(fullText)) !== null) {
        const cant = parseInt(m[1])
        const sku = m[2]
        const desc = m[3].trim().replace(/\s+/g, ' ').replace(/[-\s]+$/, '')
        const precioUnit = parseNum(m[4])
        const precioTotal = parseNum(m[5])

        // Validate: reasonable values, not duplicates
        const key = `${sku}-${precioTotal}`
        if (cant >= 1 && cant <= 99 && precioUnit > 1000 && precioTotal > 1000 && !seen.has(key)) {
          seen.add(key)
          items.push({ sku, descripcion: desc, cantidad: cant, precio_unitario: precioUnit, total: precioTotal })
        }
      }

      // ── Totales ──
      // SUBTOTAL  5069760.00
      // IVA INSCR 21%  1064649.60
      // TOTAL  6134409.60
      const subtotalMatch = fullText.match(/SUBTOTAL\s+([\d.,]+)/i)
      const iva21Match = fullText.match(/IVA\s+INSCR\s+21%\s+([\d.,]+)/i)
      const iva105Match = fullText.match(/IVA\s+INSCR\s+10[,.]?5%\s+([\d.,]+)/i)
      // TOTAL is the last big number after "TOTAL"
      const totalMatch = fullText.match(/\bTOTAL\b[^0-9]*([\d.,]{6,})/i)

      const subtotal = subtotalMatch ? parseNum(subtotalMatch[1]) : items.reduce((s, i) => s + i.total, 0)
      const iva21 = iva21Match ? parseNum(iva21Match[1]) : 0
      const iva105 = iva105Match ? parseNum(iva105Match[1]) : 0
      const iva_monto = iva21 + iva105
      const total = totalMatch ? parseNum(totalMatch[1]) : subtotal + iva_monto

      onParsed({ numero_factura, fecha, razon_social, tipo, subtotal, iva_monto, total, items, pdfFile: file, rawText: fullText.slice(0, 2000) })
    } catch (err) {
      console.error(err)
      setError('No se pudo leer el PDF automáticamente. Completá los datos manualmente.')
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

'use client'

import { useRef, useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'

interface ItemFactura {
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
}

interface Props {
  onParsed: (data: FacturaParseada) => void
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
      let fullText = ''
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        fullText += content.items.map((item) => ('str' in item ? item.str : '')).join(' ') + '\n'
      }

      // --- Parse tipo ---
      let tipo: 'blanco_a' | 'blanco_b' | 'negro' = 'blanco_a'
      if (/Cod\.\s*N[°º]\s*0*6|Factura\s+B\b/i.test(fullText)) tipo = 'blanco_b'
      else if (/Cod\.\s*N[°º]\s*0*1|Factura\s+A\b/i.test(fullText)) tipo = 'blanco_a'

      // --- Parse número de factura ---
      const nroMatch = fullText.match(/N[°º]\s*([\d]{4}-[\d]{8})/i)
      const numero_factura = nroMatch ? nroMatch[1] : ''

      // --- Parse fecha ---
      const fechaMatch = fullText.match(/(\d{2})\/(\d{2})\/(\d{4})/)
      let fecha = new Date().toISOString().split('T')[0]
      if (fechaMatch) {
        fecha = `${fechaMatch[3]}-${fechaMatch[2]}-${fechaMatch[1]}`
      }

      // --- Parse razón social cliente ---
      const rsMatch = fullText.match(/R\.\s*Social[:\s]+([^\n\r]+?)(?:\s+Cliente|\s+Direcci)/i)
      const razon_social = rsMatch ? rsMatch[1].trim() : ''

      // --- Parse items: buscar patrones de SKU + descripción + precios ---
      const items: ItemFactura[] = []
      // Pattern: cantidad (number) followed by SKU code (alphanumeric) and description, then two numbers (unit price, total)
      const itemPattern = /(\d+)\s+([\w]{6,12})\s+([A-Z][^\d]{5,60?}?)\s+([\d]{2,}(?:[.,]\d{2})?)\s+([\d]{2,}(?:[.,]\d{2})?)/g
      let match
      while ((match = itemPattern.exec(fullText)) !== null) {
        const cant = parseInt(match[1])
        const sku = match[2]
        const desc = match[3].trim().replace(/\s+/g, ' ')
        const precioUnit = parseFloat(match[4].replace(/\./g, '').replace(',', '.'))
        const precioTotal = parseFloat(match[5].replace(/\./g, '').replace(',', '.'))
        if (cant > 0 && precioUnit > 100 && precioTotal > 100) {
          items.push({ sku, descripcion: desc, cantidad: cant, precio_unitario: precioUnit, total: precioTotal })
        }
      }

      // --- Parse totales ---
      const subtotalMatch = fullText.match(/SUBTOTAL\s+([\d.,]+)/i)
      const ivaMatch = fullText.match(/IVA\s+INSCR\s+21%\s+([\d.,]+)/i)
      const totalMatch = fullText.match(/TOTAL\s+([\d.,]+)(?:\s|$)/i)

      const parseNum = (s: string) => parseFloat(s.replace(/\./g, '').replace(',', '.'))
      const subtotal = subtotalMatch ? parseNum(subtotalMatch[1]) : 0
      const iva_monto = ivaMatch ? parseNum(ivaMatch[1]) : 0
      const total = totalMatch ? parseNum(totalMatch[1]) : subtotal + iva_monto

      onParsed({ numero_factura, fecha, razon_social, tipo, subtotal, iva_monto, total, items, pdfFile: file })
    } catch (err) {
      console.error(err)
      setError('No se pudo leer el PDF. Podés cargarlo manualmente.')
      // Still open modal with empty data
      onParsed({
        numero_factura: '', fecha: new Date().toISOString().split('T')[0],
        razon_social: '', tipo: 'blanco_a', subtotal: 0, iva_monto: 0, total: 0, items: [], pdfFile: file,
      })
    }
    setParsing(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div>
      <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) parsePDF(f) }} />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={parsing}
        className="flex items-center gap-2 bg-card hover:bg-card-hover border border-border text-text-primary px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
      >
        {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
        {parsing ? 'Leyendo PDF...' : 'Cargar Factura PDF'}
      </button>
      {error && <p className="text-xs text-yellow-600 mt-1">{error}</p>}
    </div>
  )
}

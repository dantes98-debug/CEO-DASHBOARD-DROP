'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

interface Props {
  value: string           // "YYYY-MM"
  onChange: (value: string) => void
}

export default function MonthPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [año, setAño] = useState(() => parseInt(value.split('-')[0]))
  const ref = useRef<HTMLDivElement>(null)

  const [selY, selM] = value.split('-').map(Number)
  const label = `${MESES[selM - 1]} ${selY}`

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (open) setAño(selY)
  }, [open, selY])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="px-3 py-1.5 rounded-lg border border-border hover:bg-card-hover text-sm font-semibold text-text-primary transition-colors min-w-[110px] text-center"
      >
        {label}
      </button>

      {open && (
        <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 bg-card border border-border rounded-xl shadow-xl p-3 w-64">
          {/* Selector de año */}
          <div className="flex items-center justify-between mb-3 px-1">
            <button
              onClick={() => setAño(a => a - 1)}
              className="p-1 rounded hover:bg-card-hover transition-colors text-text-secondary"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-text-primary">{año}</span>
            <button
              onClick={() => setAño(a => a + 1)}
              className="p-1 rounded hover:bg-card-hover transition-colors text-text-secondary"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Grid de meses */}
          <div className="grid grid-cols-4 gap-1">
            {MESES.map((mes, i) => {
              const isSelected = año === selY && i + 1 === selM
              return (
                <button
                  key={mes}
                  onClick={() => {
                    onChange(`${año}-${String(i + 1).padStart(2, '0')}`)
                    setOpen(false)
                  }}
                  className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-accent text-white'
                      : 'text-text-secondary hover:bg-card-hover hover:text-text-primary'
                  }`}
                >
                  {mes}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useRef } from 'react'
import { MoreVertical } from 'lucide-react'

export interface RowAction {
  label: string
  onClick: () => void
  variant?: 'default' | 'danger'
}

export default function RowMenu({ actions }: { actions: RowAction[] }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + window.scrollY + 4, left: rect.right + window.scrollX - 160 })
    }
    setOpen(v => !v)
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="p-1.5 rounded hover:bg-card-hover transition-colors text-text-muted hover:text-text-primary"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open && (
        <>
          {/* Backdrop — cierra al hacer click afuera */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Dropdown — z-50 siempre encima del backdrop */}
          <div
            className="fixed z-50 bg-card border border-border rounded-lg shadow-xl py-1 w-40"
            style={{ top: pos.top, left: pos.left }}
          >
            {actions.map((action, i) => (
              <button
                key={i}
                onClick={() => { setOpen(false); action.onClick() }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  action.variant === 'danger'
                    ? 'text-red-400 hover:bg-red-500/10'
                    : 'text-text-secondary hover:bg-card-hover hover:text-text-primary'
                }`}
              >
                {action.label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}

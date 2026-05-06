'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Envíos] Error de render:', error.message, '\n', error.stack)
  }, [error])

  return (
    <div className="p-8 max-w-lg">
      <h2 className="text-red-400 font-bold text-lg mb-2">Error en la página de Envíos</h2>
      <p className="text-text-secondary text-sm mb-1 font-mono bg-card border border-border rounded p-3 break-all">
        {error.message || 'Error desconocido'}
      </p>
      {error.digest && (
        <p className="text-xs text-muted mt-1">Digest: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="mt-4 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm transition-colors"
      >
        Reintentar
      </button>
    </div>
  )
}

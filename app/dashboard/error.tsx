'use client'

import { useEffect } from 'react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Dashboard Error]', error)
  }, [error])

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h2 className="text-lg font-bold text-red-400 mb-2">Error en el dashboard</h2>
      <p className="text-sm text-text-secondary mb-4">{error.message}</p>
      <pre className="text-xs bg-card border border-border rounded-lg p-4 overflow-auto max-h-64 text-text-muted whitespace-pre-wrap mb-4">
        {error.stack}
      </pre>
      {error.digest && (
        <p className="text-xs text-text-muted mb-4">Digest: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent-hover transition-colors"
      >
        Reintentar
      </button>
    </div>
  )
}

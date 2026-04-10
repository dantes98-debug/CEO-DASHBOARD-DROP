import { cn } from '@/lib/utils'

interface Column<T> {
  key: keyof T | string
  label: string
  render?: (value: unknown, row: T) => React.ReactNode
  className?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  loading?: boolean
  emptyMessage?: string
  onRowClick?: (row: T) => void
}

export default function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  loading = false,
  emptyMessage = 'No hay datos para mostrar',
  onRowClick,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="animate-pulse">
          <div className="bg-card-hover px-6 py-3 grid gap-4" style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}>
            {columns.map((col) => (
              <div key={col.key as string} className="h-4 bg-border rounded" />
            ))}
          </div>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="px-6 py-4 border-t border-border grid gap-4" style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}>
              {columns.map((col) => (
                <div key={col.key as string} className="h-4 bg-border/50 rounded" />
              ))}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-card-hover border-b border-border">
              {columns.map((col) => (
                <th
                  key={col.key as string}
                  className={cn(
                    "text-left text-xs font-semibold text-text-secondary uppercase tracking-wider px-6 py-3",
                    col.className
                  )}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center text-text-secondary">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr
                  key={i}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    "hover:bg-card-hover/50 transition-colors",
                    onRowClick && "cursor-pointer"
                  )}
                >
                  {columns.map((col) => {
                    const value = col.key.toString().includes('.')
                      ? col.key.toString().split('.').reduce((obj: unknown, key) => (obj as Record<string, unknown>)?.[key], row)
                      : row[col.key as keyof T]

                    return (
                      <td
                        key={col.key as string}
                        className={cn("px-6 py-4 text-sm text-text-primary", col.className)}
                      >
                        {col.render ? col.render(value, row) : String(value ?? '-')}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

interface MetricCardProps {
  title: string
  value: string
  subtitle?: string
  icon: LucideIcon
  trend?: { value: number; label: string }
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'cyan'
  loading?: boolean
}

const colorMap = {
  blue: 'bg-blue-500/10 text-blue-400',
  green: 'bg-green-500/10 text-green-400',
  yellow: 'bg-yellow-500/10 text-yellow-400',
  red: 'bg-red-500/10 text-red-400',
  purple: 'bg-purple-500/10 text-purple-400',
  cyan: 'bg-cyan-500/10 text-cyan-400',
}

export default function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  color = 'blue',
  loading = false,
}: MetricCardProps) {
  if (loading) {
    return (
      <div className="bg-card rounded-xl p-5 border border-border animate-pulse">
        <div className="flex items-start justify-between mb-4">
          <div className="w-10 h-10 rounded-lg bg-border" />
        </div>
        <div className="h-7 w-24 bg-border rounded mb-2" />
        <div className="h-4 w-32 bg-border rounded" />
      </div>
    )
  }

  return (
    <div className="bg-card rounded-xl p-5 border border-border hover:border-accent/30 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", colorMap[color])}>
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <span className={cn(
            "text-xs font-medium px-2 py-1 rounded-full",
            trend.value >= 0
              ? "text-green-400 bg-green-500/10"
              : "text-red-400 bg-red-500/10"
          )}>
            {trend.value >= 0 ? '+' : ''}{trend.value}% {trend.label}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-text-primary mb-1" data-private>{value}</p>
      <p className="text-sm text-text-secondary">{title}</p>
      {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
    </div>
  )
}

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

export function formatPorcentaje(value: number | null | undefined): string {
  if (value === null || value === undefined || !isFinite(value) || isNaN(value)) return '—'
  return `${value.toFixed(1)}%`
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const clean = dateStr.length > 10 ? dateStr.slice(0, 10) : dateStr
  const date = new Date(clean + 'T00:00:00')
  if (isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

export function getCurrentMonthRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  }
}

export function getMonthName(month: number): string {
  const months = [
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
  ]
  return months[month - 1] || ''
}

export const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

export function parseN(s: string | number | undefined | null): number {
  const str = String(s ?? '').trim()
  if (!str) return 0
  if (str.includes(',')) return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0
  return parseFloat(str) || 0
}

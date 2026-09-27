import type { Range } from '@/lib/data/types'

export function compact(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e6) return `${trim(n / 1e6)}M`
  if (a >= 1e3) return `${trim(n / 1e3)}K`
  if (a >= 10) return `${Math.round(n)}`
  return `${trim(n)}`
}
const trim = (n: number) => (Math.abs(n) >= 100 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, ''))

export const eur = (n: number) => `€${compact(n)}`
export const eurExact = (n: number) => `€${Math.round(n).toLocaleString('en-US')}`
export const pct = (n: number, d = 1) => `${(n * 100).toFixed(d)}%`

export const range = (r: Range, f: (n: number) => string = compact) => {
  const a = f(r[0])
  const b = f(r[2])
  return a === b ? a : `${a}–${b}`
}

export function daysAgo(iso: string, now = new Date('2026-09-26T12:00:00Z')) {
  const d = Math.round((now.getTime() - new Date(iso).getTime()) / 86400000)
  return d <= 0 ? 'today' : d === 1 ? '1d ago' : `${d}d ago`
}

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export const pcs = (n: number) => (n < 10 ? n.toFixed(1).replace(/\.0$/, '') : Math.round(n).toString())

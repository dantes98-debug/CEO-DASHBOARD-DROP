'use client'

import { usePrivacy } from '@/lib/privacy-context'

export default function Private({ children }: { children: React.ReactNode }) {
  const { privacy } = usePrivacy()
  if (!privacy) return <>{children}</>
  return <span className="select-none tracking-[0.15em] text-muted">••••••</span>
}

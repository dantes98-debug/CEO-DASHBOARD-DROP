'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { cn } from '@/lib/utils'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i)
  return output
}

export default function PushButton({ collapsed }: { collapsed: boolean }) {
  const [status, setStatus] = useState<'unsupported' | 'default' | 'subscribed' | 'denied'>('unsupported')

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    if (Notification.permission === 'denied') { setStatus('denied'); return }

    navigator.serviceWorker.register('/sw.js').then(async reg => {
      const sub = await reg.pushManager.getSubscription()
      if (sub) { setStatus('subscribed'); return }
      setStatus(Notification.permission === 'granted' ? 'subscribed' : 'default')
    }).catch(() => setStatus('unsupported'))
  }, [])

  const handleClick = async () => {
    if (status === 'subscribed') return
    if (status === 'unsupported' || status === 'denied') return

    const perm = await Notification.requestPermission()
    if (perm !== 'granted') { setStatus('denied'); return }

    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
    })
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub),
    })
    setStatus('subscribed')
  }

  if (status === 'unsupported') return null

  const label = status === 'subscribed' ? 'Notificaciones activas' : status === 'denied' ? 'Notificaciones bloqueadas' : 'Activar notificaciones'
  const Icon = status === 'denied' ? BellOff : Bell
  const color = status === 'subscribed' ? 'text-green-400' : status === 'denied' ? 'text-red-400' : 'text-text-secondary hover:text-text-primary hover:bg-card-hover cursor-pointer'

  return (
    <button
      onClick={handleClick}
      disabled={status === 'subscribed' || status === 'denied'}
      title={collapsed ? label : undefined}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium w-full disabled:cursor-default',
        color,
        collapsed && 'justify-center'
      )}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      {!collapsed && <span>{label}</span>}
    </button>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i)
  return output
}

export default function PushButton({ collapsed: _collapsed }: { collapsed: boolean }) {
  const [status, setStatus] = useState<'unsupported' | 'default' | 'subscribed' | 'denied'>('unsupported')

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    if (Notification.permission === 'denied') { setStatus('denied'); return }
    navigator.serviceWorker.register('/sw.js').then(async reg => {
      const sub = await reg.pushManager.getSubscription()
      setStatus(sub || Notification.permission === 'granted' ? 'subscribed' : 'default')
    }).catch(() => {})
  }, [])

  const handleClick = async () => {
    if (status !== 'default') return
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

  const title = status === 'subscribed' ? 'Notificaciones activas' : status === 'denied' ? 'Notificaciones bloqueadas' : 'Activar notificaciones'

  return (
    <button
      onClick={handleClick}
      title={title}
      className="p-1.5 rounded-lg transition-colors"
    >
      {status === 'subscribed'
        ? <Bell className="w-4 h-4 text-green-400" />
        : status === 'denied'
        ? <BellOff className="w-4 h-4 text-red-400" />
        : <Bell className="w-4 h-4 text-muted hover:text-text-primary" />
      }
    </button>
  )
}

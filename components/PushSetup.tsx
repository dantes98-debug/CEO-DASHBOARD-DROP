'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff, X } from 'lucide-react'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i)
  return output
}

async function subscribeToPush(reg: ServiceWorkerRegistration) {
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
  })
  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub),
  })
  return sub
}

export default function PushSetup() {
  const [showBanner, setShowBanner] = useState(false)
  const [status, setStatus] = useState<'idle' | 'subscribed' | 'denied'>('idle')

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    navigator.serviceWorker.register('/sw.js').then(async (reg) => {
      const perm = Notification.permission
      if (perm === 'granted') {
        setStatus('subscribed')
        await subscribeToPush(reg).catch(() => {})
      } else if (perm === 'denied') {
        setStatus('denied')
      } else {
        // Ask after 4 seconds if not dismissed before
        const dismissed = localStorage.getItem('push-banner-dismissed')
        if (!dismissed) {
          setTimeout(() => setShowBanner(true), 4000)
        }
      }
    })
  }, [])

  const handleEnable = async () => {
    setShowBanner(false)
    const perm = await Notification.requestPermission()
    if (perm === 'granted') {
      const reg = await navigator.serviceWorker.ready
      await subscribeToPush(reg)
      setStatus('subscribed')
    } else {
      setStatus('denied')
    }
  }

  const handleDismiss = () => {
    setShowBanner(false)
    localStorage.setItem('push-banner-dismissed', '1')
  }

  if (!showBanner) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm">
      <div className="bg-card border border-border rounded-2xl p-4 shadow-2xl flex items-start gap-3">
        <div className="p-2 bg-accent/10 rounded-xl mt-0.5">
          <Bell className="w-5 h-5 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary">Activar notificaciones</p>
          <p className="text-xs text-muted mt-0.5">Recibí alertas de nuevas ventas y resúmenes diarios.</p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleEnable}
              className="flex-1 bg-accent hover:bg-accent-hover text-white text-xs font-medium py-2 rounded-lg transition-colors"
            >
              Activar
            </button>
            <button
              onClick={handleDismiss}
              className="flex-1 border border-border text-text-secondary hover:text-text-primary text-xs font-medium py-2 rounded-lg transition-colors"
            >
              Ahora no
            </button>
          </div>
        </div>
        <button onClick={handleDismiss} className="text-muted hover:text-text-primary transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// Send to all users (omit userId) or to a specific user
export async function sendPush(payload: { title: string; body: string; url?: string; tag?: string; userId?: string }) {
  try {
    await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {}
}

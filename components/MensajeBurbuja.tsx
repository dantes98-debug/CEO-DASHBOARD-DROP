'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { MessageSquare, X } from 'lucide-react'

interface Burbuja {
  id: string
  de_nombre: string
  texto: string
  ts: string
}

export default function MensajeBurbuja() {
  const [miId, setMiId] = useState<string | null>(null)
  const [burbujas, setBurbujas] = useState<Burbuja[]>([])
  const pathname = usePathname()
  const router = useRouter()
  const timerRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    const supabase = createClient()

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setMiId(user.id)

      // Cargar nombres de perfiles para mostrar en burbuja
      const { data: perfiles } = await supabase
        .from('user_profiles')
        .select('id, nombre')

      const nombresMap = new Map((perfiles || []).map(p => [p.id, p.nombre]))

      const channel = supabase
        .channel('burbuja-mensajes')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'mensajes' },
          (payload) => {
            const msg = payload.new as { id: string; de_id: string; para_id: string; texto: string; created_at: string }

            // Solo mostrar si es para mí y no estoy en la página de mensajes
            if (msg.para_id !== user.id) return
            if (pathname?.startsWith('/dashboard/mensajes')) return

            const burbuja: Burbuja = {
              id: msg.id,
              de_nombre: nombresMap.get(msg.de_id) || 'Alguien',
              texto: msg.texto,
              ts: msg.created_at,
            }

            setBurbujas(prev => [...prev.slice(-2), burbuja]) // máximo 3

            // Auto-dismiss después de 6 segundos
            const timer = setTimeout(() => {
              setBurbujas(prev => prev.filter(b => b.id !== burbuja.id))
              timerRefs.current.delete(burbuja.id)
            }, 6000)
            timerRefs.current.set(burbuja.id, timer)
          }
        )
        .subscribe()

      return () => { supabase.removeChannel(channel) }
    }

    init()

    return () => {
      timerRefs.current.forEach(t => clearTimeout(t))
    }
  }, [])

  // Si el usuario navega a mensajes, limpiar burbujas
  useEffect(() => {
    if (pathname?.startsWith('/dashboard/mensajes')) {
      burbujas.forEach(b => {
        const t = timerRefs.current.get(b.id)
        if (t) clearTimeout(t)
        timerRefs.current.delete(b.id)
      })
      setBurbujas([])
    }
  }, [pathname])

  const dismiss = (id: string) => {
    const t = timerRefs.current.get(id)
    if (t) clearTimeout(t)
    timerRefs.current.delete(id)
    setBurbujas(prev => prev.filter(b => b.id !== id))
  }

  if (burbujas.length === 0) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 items-end pointer-events-none">
      {burbujas.map((b) => (
        <div
          key={b.id}
          className="pointer-events-auto flex items-start gap-3 bg-card border border-border rounded-2xl rounded-br-sm shadow-xl px-4 py-3 max-w-72 animate-in slide-in-from-right-4 fade-in duration-300 cursor-pointer hover:border-accent/50 transition-colors"
          onClick={() => { dismiss(b.id); router.push('/dashboard/mensajes') }}
        >
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center mt-0.5">
            <MessageSquare className="w-4 h-4 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-text-primary">{b.de_nombre}</p>
            <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{b.texto}</p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); dismiss(b.id) }}
            className="flex-shrink-0 text-muted hover:text-text-primary transition-colors mt-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

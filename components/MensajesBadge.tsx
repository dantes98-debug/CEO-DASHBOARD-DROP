'use client'

import { useEffect, useId, useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function MensajesBadge() {
  const [count, setCount] = useState(0)
  const uid = useId()

  useEffect(() => {
    const supabase = createClient()

    const cargar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { count: c } = await supabase
        .from('mensajes')
        .select('id', { count: 'exact', head: true })
        .eq('para_id', user.id)
        .eq('leido', false)
      setCount(c ?? 0)
    }

    cargar()

    const channel = supabase
      .channel(`mensajes-badge-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensajes' }, () => cargar())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [uid])

  if (count === 0) return null
  return (
    <span className="ml-auto bg-accent text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
      {count > 99 ? '99+' : count}
    </span>
  )
}

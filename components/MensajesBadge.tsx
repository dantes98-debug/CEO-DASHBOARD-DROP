'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function MensajesBadge() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const supabase = createClient()
    let userId: string

    const cargar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      userId = user.id

      const { count: c } = await supabase
        .from('mensajes')
        .select('id', { count: 'exact', head: true })
        .eq('para_id', userId)
        .eq('leido', false)

      setCount(c ?? 0)
    }

    cargar()

    const channel = supabase
      .channel('mensajes-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensajes' }, () => {
        cargar()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  if (count === 0) return null
  return (
    <span className="ml-auto bg-accent text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
      {count > 99 ? '99+' : count}
    </span>
  )
}

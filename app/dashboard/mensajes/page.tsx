'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { ArrowLeft, Check, CheckCheck, MessageSquare, Send, User } from 'lucide-react'

interface Perfil {
  id: string
  nombre: string
  role: string
}

interface Mensaje {
  id: string
  de_id: string
  para_id: string
  texto: string
  leido: boolean
  created_at: string
}

function formatHora(ts: string) {
  const d = new Date(ts)
  const hoy = new Date()
  const ayer = new Date(hoy)
  ayer.setDate(hoy.getDate() - 1)
  if (d.toDateString() === hoy.toDateString()) return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === ayer.toDateString()) return 'Ayer'
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

function formatHoraCompleta(ts: string) {
  return new Date(ts).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function MensajesPage() {
  const [miId, setMiId] = useState<string | null>(null)
  const [usuarios, setUsuarios] = useState<Perfil[]>([])
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [seleccionado, setSeleccionado] = useState<Perfil | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [loading, setLoading] = useState(true)
  const [vistaMovil, setVistaMovil] = useState<'lista' | 'chat'>('lista')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const cargarMensajes = useCallback(async (uid: string) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('mensajes')
      .select('*')
      .or(`de_id.eq.${uid},para_id.eq.${uid}`)
      .order('created_at', { ascending: true })
    setMensajes(data || [])
  }, [])

  useEffect(() => {
    const supabase = createClient()

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setMiId(user.id)

      const res = await fetch('/api/usuarios')
      const perfiles: Perfil[] = res.ok ? await res.json() : []
      setUsuarios(perfiles)
      await cargarMensajes(user.id)
      setLoading(false)

      const channel = supabase
        .channel('mensajes-page-realtime')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes' }, () => cargarMensajes(user.id))
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'mensajes' }, () => cargarMensajes(user.id))
        .subscribe()

      return () => { supabase.removeChannel(channel) }
    }

    const cleanup = init()
    return () => { cleanup.then(fn => fn?.()) }
  }, [cargarMensajes])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes, seleccionado])

  const abrirConversacion = async (u: Perfil) => {
    setSeleccionado(u)
    setVistaMovil('chat')
    inputRef.current?.focus()
    if (!miId) return
    const supabase = createClient()
    await supabase
      .from('mensajes')
      .update({ leido: true })
      .eq('de_id', u.id)
      .eq('para_id', miId)
      .eq('leido', false)
    await cargarMensajes(miId)
  }

  const enviar = async () => {
    if (!texto.trim() || !seleccionado || !miId || enviando) return
    setEnviando(true)
    const supabase = createClient()
    await supabase.from('mensajes').insert({
      de_id: miId,
      para_id: seleccionado.id,
      texto: texto.trim(),
    })
    setTexto('')
    await cargarMensajes(miId)
    setEnviando(false)
    inputRef.current?.focus()
  }

  const mensajesConUsuario = seleccionado
    ? mensajes.filter(
        m => (m.de_id === miId && m.para_id === seleccionado.id) ||
             (m.de_id === seleccionado.id && m.para_id === miId)
      )
    : []

  const noLeidosDe = (uid: string) =>
    mensajes.filter(m => m.de_id === uid && m.para_id === miId && !m.leido).length

  const ultimoMensajeCon = (uid: string) =>
    mensajes
      .filter(m => (m.de_id === uid && m.para_id === miId) || (m.de_id === miId && m.para_id === uid))
      .at(-1) ?? null

  const usuariosOrdenados = [...usuarios].sort((a, b) => {
    const ua = ultimoMensajeCon(a.id)
    const ub = ultimoMensajeCon(b.id)
    if (!ua && !ub) return a.nombre.localeCompare(b.nombre)
    if (!ua) return 1
    if (!ub) return -1
    return new Date(ub.created_at).getTime() - new Date(ua.created_at).getTime()
  })

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-text-muted text-sm">Cargando...</div>
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center gap-3 mb-6">
        <MessageSquare className="w-5 h-5 text-accent" />
        <h1 className="text-2xl font-bold text-text-primary">Mensajes</h1>
      </div>

      <div className="flex flex-1 bg-card rounded-xl border border-border overflow-hidden min-h-0">

        {/* Panel izquierdo: lista */}
        <div className={`w-full md:w-72 lg:w-80 flex-shrink-0 border-r border-border flex flex-col ${vistaMovil === 'chat' ? 'hidden md:flex' : 'flex'}`}>
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Conversaciones</p>
          </div>

          {usuariosOrdenados.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-6 text-center">
              <div>
                <User className="w-8 h-8 text-muted mx-auto mb-2" />
                <p className="text-sm text-text-muted">No hay otros usuarios activos</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {usuariosOrdenados.map(u => {
                const ultimo = ultimoMensajeCon(u.id)
                const noLeidos = noLeidosDe(u.id)
                const activo = seleccionado?.id === u.id
                return (
                  <button
                    key={u.id}
                    onClick={() => abrirConversacion(u)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors border-b border-border/50 last:border-0 ${
                      activo ? 'bg-accent/10' : 'hover:bg-card-hover'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${
                      activo ? 'bg-accent text-white' : 'bg-card-hover text-text-secondary border border-border'
                    }`}>
                      {u.nombre.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-sm truncate ${noLeidos > 0 ? 'font-bold text-text-primary' : 'font-medium text-text-primary'}`}>
                          {u.nombre}
                        </p>
                        {ultimo && (
                          <span className="text-[10px] text-text-muted flex-shrink-0">{formatHora(ultimo.created_at)}</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className={`text-xs truncate ${noLeidos > 0 ? 'text-text-secondary' : 'text-text-muted'}`}>
                          {ultimo
                            ? (ultimo.de_id === miId ? `Tú: ${ultimo.texto}` : ultimo.texto)
                            : <span className="italic">Sin mensajes aún</span>
                          }
                        </p>
                        {noLeidos > 0 && (
                          <span className="bg-accent text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 flex-shrink-0">
                            {noLeidos}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Panel derecho: chat */}
        <div className={`flex-1 flex flex-col min-w-0 ${vistaMovil === 'lista' ? 'hidden md:flex' : 'flex'}`}>
          {!seleccionado ? (
            <div className="flex-1 flex items-center justify-center p-8 text-center">
              <div>
                <MessageSquare className="w-12 h-12 text-muted mx-auto mb-3" />
                <p className="text-sm font-medium text-text-secondary mb-1">Seleccioná un usuario</p>
                <p className="text-xs text-text-muted">Elegí una conversación de la lista</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-shrink-0">
                <button
                  onClick={() => { setSeleccionado(null); setVistaMovil('lista') }}
                  className="md:hidden p-1.5 rounded-lg hover:bg-card-hover transition-colors text-text-muted"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-sm font-bold text-accent flex-shrink-0">
                  {seleccionado.nombre.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary">{seleccionado.nombre}</p>
                  <p className="text-xs text-text-muted capitalize">{seleccionado.role === 'admin' ? 'Administrador' : 'Usuario'}</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 min-h-0">
                {mensajesConUsuario.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-center">
                    <div>
                      <p className="text-sm text-text-muted">No hay mensajes aún</p>
                      <p className="text-xs text-text-muted mt-1">Empezá la conversación 👇</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {mensajesConUsuario.map((m, i) => {
                      const esMio = m.de_id === miId
                      const prevM = mensajesConUsuario[i - 1]
                      const mismoRemitente = prevM && prevM.de_id === m.de_id
                      const diff = prevM ? new Date(m.created_at).getTime() - new Date(prevM.created_at).getTime() : Infinity
                      const mostrarDivider = diff > 1000 * 60 * 30
                      return (
                        <div key={m.id}>
                          {mostrarDivider && (
                            <div className="flex items-center gap-3 my-3">
                              <div className="flex-1 border-t border-border/50" />
                              <span className="text-[10px] text-text-muted flex-shrink-0">{formatHoraCompleta(m.created_at)}</span>
                              <div className="flex-1 border-t border-border/50" />
                            </div>
                          )}
                          <div className={`flex ${esMio ? 'justify-end' : 'justify-start'} ${mismoRemitente && !mostrarDivider ? 'mt-0.5' : 'mt-2'}`}>
                            <div className="max-w-[75%] group relative">
                              <div className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
                                esMio
                                  ? 'bg-accent text-white rounded-br-sm'
                                  : 'bg-card-hover text-text-primary border border-border rounded-bl-sm'
                              }`}>
                                {m.texto}
                              </div>
                              <div className={`flex items-center gap-1 mt-0.5 ${esMio ? 'justify-end' : 'justify-start'}`}>
                                <span className="text-[10px] text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
                                  {formatHoraCompleta(m.created_at)}
                                </span>
                                {esMio && (m.leido
                                  ? <CheckCheck className="w-3 h-3 text-accent" />
                                  : <Check className="w-3 h-3 text-text-muted" />
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    <div ref={bottomRef} />
                  </>
                )}
              </div>

              <div className="flex items-end gap-2 px-4 py-3 border-t border-border flex-shrink-0">
                <textarea
                  ref={inputRef}
                  value={texto}
                  onChange={e => setTexto(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      enviar()
                    }
                  }}
                  placeholder={`Mensaje para ${seleccionado.nombre}…`}
                  rows={1}
                  className="flex-1 resize-none px-3.5 py-2.5 text-sm bg-card-hover border border-border rounded-xl text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none leading-relaxed max-h-32 overflow-y-auto"
                  style={{ minHeight: '42px' }}
                />
                <button
                  onClick={enviar}
                  disabled={!texto.trim() || enviando}
                  className="flex-shrink-0 w-10 h-10 rounded-xl bg-accent hover:bg-accent-hover text-white flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

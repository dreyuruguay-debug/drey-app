import { supabase } from './supabaseClient.js'
import { VERSION_TERMINOS } from '../data/versionLegal.js'

// Consentimiento, descarga de datos y pedido de baja (Ley 18.331).
// Las funciones de la base que usa están en supabase/sql/011.

// Guarda que aceptó la versión actual de los términos y la política de
// privacidad (y, si marcó la casilla, el consentimiento para los datos de
// salud). Devuelve el error, o null.
export async function aceptarTerminos(consienteSalud) {
  const { error } = await supabase.rpc('aceptar_terminos', {
    p_version: VERSION_TERMINOS,
    p_salud: Boolean(consienteSalud),
  })
  return error || null
}

export async function solicitarBaja() {
  const { error } = await supabase.rpc('solicitar_baja')
  return error || null
}

// Arma un archivo con TODOS los datos del usuario (derecho de acceso) y
// lo descarga en el celular o la compu. Devuelve el error, o null.
export async function descargarMisDatos(usuario) {
  const [perfil, sesiones, rutinas, resumenes, pagos] = await Promise.all([
    supabase.from('perfiles').select('*').eq('id', usuario.id).single(),
    supabase.from('sesiones').select('*').eq('cliente_id', usuario.id).order('fecha'),
    supabase.from('rutinas').select('*, rutina_ejercicios(*)').eq('cliente_id', usuario.id),
    supabase.from('resumenes_progreso').select('*').eq('cliente_id', usuario.id),
    supabase.from('pagos').select('*').eq('cliente_id', usuario.id),
  ])
  const error = [perfil, sesiones, rutinas, resumenes].find((respuesta) => respuesta.error)?.error
  if (error) return error

  const contenido = {
    generado: new Date().toISOString(),
    email: usuario.email,
    perfil: perfil.data,
    entrenamientos: sesiones.data,
    rutinas: rutinas.data,
    resumenes_de_avance: resumenes.data,
    // "pagos" puede no existir todavía (SQL 014 sin instalar).
    pagos: pagos.error ? [] : pagos.data,
  }
  const archivo = new Blob([JSON.stringify(contenido, null, 2)], { type: 'application/json' })
  const enlace = document.createElement('a')
  enlace.href = URL.createObjectURL(archivo)
  enlace.download = `mis-datos-drey-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  setTimeout(() => URL.revokeObjectURL(enlace.href), 5000)
  return null
}

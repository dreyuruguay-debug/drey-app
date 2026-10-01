import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient.js'
import { aplicarPaginaInicio, escucharPaginaInicio, paginaInicio } from '../data/paginaInicio.js'
import { comprimirImagen } from '../utils/imagenes.js'

// Trae de la base la página de inicio (tabla "pagina_inicio",
// supabase/sql/027) y la deja en data/paginaInicio.js, de donde la leen
// la portada y el formulario del Admin. Y guarda los cambios que hace el
// Admin desde Ajustes → Portada (la base no deja que nadie más los haga).
//
// Si no hay señal o la base todavía no tiene el SQL 027, la portada se
// muestra igual con lo último conocido o con los textos originales.

const BUCKET = 'pagina-inicio'
const MARCA_BUCKET = `/storage/v1/object/public/${BUCKET}/`

// Archivos que sube el Admin: columna de la tabla y qué se acepta.
export const ARCHIVOS_PORTADA = Object.freeze({
  foto_fundador: {
    columna: 'foto_fundador_url',
    tipos: ['image/jpeg', 'image/png', 'image/webp'],
    maximoMb: 10,
    nombre: 'La foto',
  },
  video_celular: {
    columna: 'video_celular_url',
    tipos: ['video/mp4', 'video/webm'],
    maximoMb: 30,
    nombre: 'El video',
  },
  video_compu: {
    columna: 'video_compu_url',
    tipos: ['video/mp4', 'video/webm'],
    maximoMb: 30,
    nombre: 'El video',
  },
})

function desdeFila(fila) {
  return {
    textos: fila.textos || {},
    secciones: fila.secciones || {},
    fotoFundadorUrl: fila.foto_fundador_url || '',
    videoCelularUrl: fila.video_celular_url || '',
    videoCompuUrl: fila.video_compu_url || '',
  }
}

let pedidoEnCurso = null

// Pide la página a la base (si ya hay un pedido andando, espera ese).
// Devuelve { pagina, error }: la página vigente (o null si nunca se pudo
// traer) y el error, si hubo.
export function cargarPaginaInicio() {
  if (!pedidoEnCurso) {
    pedidoEnCurso = pedirPaginaInicio().finally(() => {
      pedidoEnCurso = null
    })
  }
  return pedidoEnCurso
}

async function pedirPaginaInicio() {
  try {
    const { data, error } = await supabase
      .from('pagina_inicio')
      .select('textos, secciones, foto_fundador_url, video_celular_url, video_compu_url')
      .eq('id', 1)
      .maybeSingle()
    if (!error && data) aplicarPaginaInicio(desdeFila(data))
    return { pagina: paginaInicio(), error }
  } catch (error) {
    // Sin señal: queda lo último conocido.
    return { pagina: paginaInicio(), error }
  }
}

// Para las pantallas: devuelve la página (null mientras no se sepa nada)
// y la pide a la base una vez al abrir la pantalla.
export function usePaginaInicio() {
  const [pagina, setPagina] = useState(paginaInicio)
  useEffect(() => {
    const dejarDeEscuchar = escucharPaginaInicio(setPagina)
    cargarPaginaInicio()
    return dejarDeEscuchar
  }, [])
  return pagina
}

// --- Cambios del Admin -------------------------------------------------------
// Cada función devuelve el error (o null si salió bien).

// textos: { clave: 'texto nuevo' } (null o '' = volver al original).
// secciones: { id: true | false } (mostrar u ocultar).
export async function guardarPaginaInicio({ textos = {}, secciones = {} }) {
  const limpios = {}
  for (const [clave, valor] of Object.entries(textos)) {
    if (Array.isArray(valor)) limpios[clave] = valor
    else limpios[clave] = String(valor ?? '').trim() || null
  }
  const { error } = await supabase.rpc('guardar_pagina_inicio', {
    p_textos: limpios,
    p_secciones: secciones,
  })
  if (error) return error
  await cargarPaginaInicio()
  return null
}

// Revisa el archivo antes de subirlo. Devuelve el problema, o ''.
export function revisarArchivoPortada(tipo, archivo) {
  const regla = ARCHIVOS_PORTADA[tipo]
  if (!regla || !archivo) return 'Elegí un archivo.'
  if (!regla.tipos.includes(archivo.type)) {
    return tipo === 'foto_fundador'
      ? 'Elegí una foto (JPG, PNG o WEBP).'
      : 'Elegí un video MP4 (o WEBM). Los .MOV del iPhone hay que pasarlos a MP4 primero.'
  }
  if (archivo.size > regla.maximoMb * 1024 * 1024) {
    return `${regla.nombre} pesa más de ${regla.maximoMb} MB. Probá con uno más liviano.`
  }
  return ''
}

// Sube la foto o el video, lo deja puesto en la página y borra el que
// había antes. Devuelve el error, o null.
export async function subirArchivoPortada(tipo, archivo) {
  const problema = revisarArchivoPortada(tipo, archivo)
  if (problema) return { message: problema, propio: true }

  const regla = ARCHIVOS_PORTADA[tipo]
  const liviano = tipo === 'foto_fundador' ? await comprimirImagen(archivo, 1200, 0.85) : archivo
  const extension = extensionDe(liviano)
  const ruta = `${tipo}-${Date.now()}.${extension}`
  const { error: errorSubida } = await supabase.storage
    .from(BUCKET)
    .upload(ruta, liviano, { contentType: liviano.type, cacheControl: '31536000' })
  if (errorSubida) return errorSubida

  const nuevaUrl = supabase.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl
  return reemplazarArchivo(regla.columna, nuevaUrl, ruta)
}

// Saca la foto o el video propio: vuelve el que viene con la app (o, en
// el caso de la foto, la sección queda sin foto).
export async function quitarArchivoPortada(tipo) {
  return reemplazarArchivo(ARCHIVOS_PORTADA[tipo].columna, null, null)
}

async function reemplazarArchivo(columna, nuevaUrl, rutaNueva) {
  const anterior = paginaInicio()?.[columnaAPropiedad(columna)] || ''
  const { data, error } = await supabase
    .from('pagina_inicio')
    .update({ [columna]: nuevaUrl })
    .eq('id', 1)
    .select('id')
  if (error || !data?.length) {
    // No quedó puesto: se borra lo recién subido para no dejar basura.
    if (rutaNueva) await supabase.storage.from(BUCKET).remove([rutaNueva])
    return error || { message: 'Sin permiso' }
  }
  const rutaAnterior = rutaEnBucket(anterior)
  if (rutaAnterior) await supabase.storage.from(BUCKET).remove([rutaAnterior])
  await cargarPaginaInicio()
  return null
}

function columnaAPropiedad(columna) {
  return {
    foto_fundador_url: 'fotoFundadorUrl',
    video_celular_url: 'videoCelularUrl',
    video_compu_url: 'videoCompuUrl',
  }[columna]
}

function rutaEnBucket(url) {
  if (typeof url !== 'string') return null
  const posicion = url.indexOf(MARCA_BUCKET)
  if (posicion === -1) return null
  return url.slice(posicion + MARCA_BUCKET.length).split(/[?#]/)[0] || null
}

function extensionDe(archivo) {
  const porTipo = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
  }
  return porTipo[archivo.type] || 'bin'
}

// Texto para el Admin según lo que respondió la base.
export function textoDeErrorPortada(error) {
  if (!error) return ''
  if (error.propio) return error.message
  const mensaje = error.message || ''
  if (
    /pagina_inicio|guardar_pagina_inicio|does not exist|schema cache|bucket not found/i.test(
      mensaje,
    )
  ) {
    return 'Falta instalar la actualización de la base (SQL 027)'
  }
  if (/payload too large|exceeded the maximum allowed size|entity too large/i.test(mensaje)) {
    return 'El archivo es demasiado pesado. Probá con uno más liviano.'
  }
  if (/sin permiso|solo el admin|row-level security|violates/i.test(mensaje)) {
    return 'Solo la cuenta Admin puede cambiar la página de inicio.'
  }
  return 'No pudimos guardar. Probá de nuevo.'
}

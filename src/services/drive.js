import { supabase } from './supabaseClient.js'

// Guardar las evaluaciones en Google Drive, en la carpeta de cada alumno.
//
// Cómo funciona: en la cuenta de Google dueña de la carpeta "Clientes
// evaluaciones" hay un pequeño programa de Google (Apps Script, archivo
// herramientas/drive-evaluaciones.gs) que recibe el PDF, busca la carpeta
// del alumno (o la crea) y lo guarda ahí. DREY le manda el PDF a su link
// junto con una clave, para que nadie más pueda guardar cosas.
//
// El link y la clave los carga el Admin en Ajustes → Drive (tabla
// ajustes_drive, SQL 031). Solo los leen el Admin y los profes.

const SIN_CONFIGURAR = { urlScript: '', clave: '', carpetaUrl: '' }

export async function cargarAjustesDrive() {
  const { data, error } = await supabase
    .from('ajustes_drive')
    .select('url_script, clave, carpeta_url')
    .eq('id', 1)
    .maybeSingle()
  if (error || !data) return { ...SIN_CONFIGURAR, error: error || null }
  return {
    urlScript: data.url_script || '',
    clave: data.clave || '',
    carpetaUrl: data.carpeta_url || '',
    error: null,
  }
}

export function driveConfigurado(ajustes) {
  return Boolean(ajustes?.urlScript && ajustes?.clave)
}

export async function guardarAjustesDrive({ urlScript, clave, carpetaUrl }) {
  const { data, error } = await supabase
    .from('ajustes_drive')
    .update({
      url_script: urlScript.trim() || null,
      clave: clave.trim() || null,
      carpeta_url: carpetaUrl.trim() || null,
    })
    .eq('id', 1)
    .select('id')
  if (error) return error
  if (!data?.length) return { message: 'Sin permiso' }
  return null
}

// El link que da Google al publicar el programa termina en "/exec".
export function esLinkDeScript(texto) {
  return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec\/?$/i.test(String(texto).trim())
}

// Le habla al programa de Google. Devuelve lo que respondió ({ ok, ... })
// o { ok: false, error } con un texto para mostrar.
async function hablarConDrive(urlScript, pedido) {
  let respuesta
  try {
    // "text/plain" para que el navegador lo mande directo (Google no
    // acepta la consulta previa que haría con "application/json").
    respuesta = await fetch(urlScript.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(pedido),
    })
  } catch {
    return { ok: false, error: 'No pudimos conectar con Google Drive. Revisá la señal.' }
  }
  let datos = null
  try {
    datos = await respuesta.json()
  } catch {
    return {
      ok: false,
      error:
        'Google no respondió bien. Revisá que el programa esté publicado con acceso "Cualquier usuario".',
    }
  }
  if (datos?.ok) return datos
  return { ok: false, error: mensajeDeError(datos?.error) }
}

function mensajeDeError(codigo) {
  if (codigo === 'clave') return 'La clave no coincide con la del programa de Google.'
  if (codigo === 'carpeta')
    return 'El programa de Google no encuentra la carpeta "Clientes evaluaciones".'
  return codigo ? `Google Drive respondió: ${codigo}` : 'No pudimos guardar en Google Drive.'
}

// Prueba la conexión (Ajustes → Drive). Devuelve { ok, carpeta, carpetaUrl } o { ok: false, error }.
export function probarDrive({ urlScript, clave }) {
  return hablarConDrive(urlScript, { accion: 'probar', clave: clave.trim() })
}

// Guarda el PDF en la carpeta del alumno (la crea si no existe; si ya
// había un PDF con el mismo nombre, lo reemplaza).
// Devuelve { ok, archivoUrl, carpetaUrl } o { ok: false, error }.
export async function guardarPdfEnDrive({ ajustes, blob, nombreArchivo, alumnoId, nombreAlumno }) {
  if (!driveConfigurado(ajustes)) {
    return { ok: false, error: 'Falta conectar Google Drive (Admin → Ajustes → Drive).' }
  }
  return hablarConDrive(ajustes.urlScript, {
    accion: 'guardar',
    clave: ajustes.clave,
    alumnoId,
    carpeta: nombreAlumno,
    archivo: nombreArchivo,
    pdf: await aBase64(blob),
  })
}

function aBase64(blob) {
  return new Promise((listo, fallo) => {
    const lector = new FileReader()
    lector.onload = () => listo(String(lector.result).split(',')[1] || '')
    lector.onerror = () => fallo(lector.error)
    lector.readAsDataURL(blob)
  })
}

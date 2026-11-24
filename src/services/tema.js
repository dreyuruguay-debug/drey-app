import { useEffect, useLayoutEffect, useState } from 'react'
import { guardarJSON, leerJSON } from '../utils/almacenLocal.js'

// Modo claro / oscuro y color de la app ("Apariencia" en Perfil del
// alumno, Mi cuenta del profe e Inicio del Admin).
//
// Cada persona elige en SU celular (o compu):
//   · Automático según la hora (viene así de entrada): claro de 8:00 a
//     20:00 y oscuro el resto. Usa la hora del celular y cambia sola,
//     aunque la app esté abierta.
//   · O fijo: siempre claro o siempre oscuro.
//
// Además elige el COLOR de botones y textos destacados (ver COLORES más
// abajo). De entrada es el verde de DREY.
//
// Se guarda en el celular (localStorage, clave "drey-tema") como
// { automatico: true/false, fijo: 'claro' | 'oscuro', color: 'verde' | ... }.
// El modo queda marcado en <html data-tema="claro|oscuro">, el color en
// <html data-color="verde|rosa|..."> y los colores salen de las variables
// de styles/globals.css (bloque "COLORES A ELECCIÓN").
//
// IMPORTANTE: index.html tiene una copia chiquita de esta misma regla
// para pintar el modo y el color correctos antes de que cargue la app (sin
// parpadeo). Si se cambia el horario, la clave o la lista de colores,
// cambiarlo también ahí.

export const CLAVE_TEMA = 'drey-tema'
export const HORA_CLARO_DESDE = 8 // 08:00
export const HORA_CLARO_HASTA = 20 // 20:00

// Color de la barra del navegador / del celular en cada modo.
const COLOR_BARRA = { claro: '#f3f4f2', oscuro: '#0d0d0d' }
const REVISAR_CADA_MS = 60 * 1000
const DURACION_TRANSICION_MS = 400

// Colores a elección. "muestra" es solo el circulito del selector (el tono
// de modo claro y el de modo oscuro); los colores reales de la app están en
// styles/globals.css. Para sumar uno: agregarlo acá, en globals.css (sus
// dos bloques) y en la lista de index.html.
// No hay rojo, naranja ni amarillo a propósito: en DREY ya significan
// errores / "Llegué al fallo", avisos de atención y series de calentamiento.
export const COLOR_POR_DEFECTO = 'verde'
export const COLORES = [
  { id: 'verde', nombre: 'Verde DREY', muestra: { claro: '#3ddc84', oscuro: '#3ddc84' } },
  { id: 'rosa', nombre: 'Rosa', muestra: { claro: '#d6246e', oscuro: '#f472b6' } },
  { id: 'violeta', nombre: 'Violeta', muestra: { claro: '#7c3aed', oscuro: '#a78bfa' } },
  { id: 'azul', nombre: 'Azul', muestra: { claro: '#2563eb', oscuro: '#60a5fa' } },
  { id: 'turquesa', nombre: 'Turquesa', muestra: { claro: '#0f766e', oscuro: '#2dd4bf' } },
  { id: 'mono', nombre: 'Blanco y negro', muestra: { claro: '#101211', oscuro: '#f2f2f2' } },
]
const IDS_COLORES = new Set(COLORES.map((color) => color.id))

const oyentes = new Set()
let temaForzado = null // la página de inicio (con video) va siempre oscura
let iniciado = false

// ---------- Reglas ----------

export function leerPreferencia() {
  const guardada = leerJSON(CLAVE_TEMA)
  return {
    automatico: typeof guardada?.automatico === 'boolean' ? guardada.automatico : true,
    fijo: guardada?.fijo === 'claro' ? 'claro' : 'oscuro',
    color: limpiarColor(guardada?.color),
  }
}

function limpiarColor(color) {
  return IDS_COLORES.has(color) ? color : COLOR_POR_DEFECTO
}

export function esDeDia(fecha = new Date()) {
  const hora = fecha.getHours()
  return hora >= HORA_CLARO_DESDE && hora < HORA_CLARO_HASTA
}

// El modo que corresponde ahora según la preferencia.
export function temaQueToca(preferencia = leerPreferencia(), fecha = new Date()) {
  if (!preferencia.automatico) return preferencia.fijo
  return esDeDia(fecha) ? 'claro' : 'oscuro'
}

// "20:00" o "8:00": a qué hora cambia solo (para el texto de Apariencia).
export function horaDelProximoCambio(fecha = new Date()) {
  return esDeDia(fecha) ? `${HORA_CLARO_HASTA}:00` : `${HORA_CLARO_DESDE}:00`
}

// ---------- Aplicar en la página ----------

function pintar(tema, color, suave) {
  const raiz = document.documentElement
  if (raiz.dataset.tema === tema && raiz.dataset.color === color) return false
  if (suave) {
    raiz.classList.add('drey-cambiando-tema')
    window.setTimeout(() => raiz.classList.remove('drey-cambiando-tema'), DURACION_TRANSICION_MS)
  }
  raiz.dataset.tema = tema
  raiz.dataset.color = color
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLOR_BARRA[tema])
  return true
}

// Revisa si hay que cambiar de modo (por la hora o porque se cambió la
// preferencia) y avisa a las pantallas abiertas.
function actualizar(suave = true) {
  const preferencia = leerPreferencia()
  const tema = temaForzado || temaQueToca(preferencia)
  pintar(tema, preferencia.color, suave)
  avisar()
}

function avisar() {
  const estado = estadoActual()
  oyentes.forEach((oyente) => oyente(estado))
}

function estadoActual() {
  return { preferencia: leerPreferencia(), tema: temaQueToca() }
}

// Se llama una vez al abrir la app (main.jsx). El primer modo ya lo pintó
// index.html antes de cargar la app; acá solo se lo mantiene al día.
export function iniciarTema() {
  if (iniciado) return
  iniciado = true
  const raiz = document.documentElement
  if (!raiz.dataset.tema || !raiz.dataset.color) actualizar(false)
  // Modo automático: revisa la hora cada minuto y al volver a la app
  // (el celular pudo estar bloqueado justo a las 20:00).
  window.setInterval(() => actualizar(true), REVISAR_CADA_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') actualizar(true)
  })
  // Si se cambia en otra pestaña abierta, se copia acá.
  window.addEventListener('storage', (event) => {
    if (event.key === CLAVE_TEMA) actualizar(true)
  })
}

export function guardarPreferencia(preferencia) {
  guardarJSON(CLAVE_TEMA, {
    automatico: Boolean(preferencia.automatico),
    fijo: preferencia.fijo === 'claro' ? 'claro' : 'oscuro',
    color: limpiarColor(preferencia.color),
  })
  actualizar(true)
}

// ---------- Para las pantallas ----------

// Preferencia (modo y color) y modo actual, y cómo cambiarlos. Se actualiza solo cuando
// cambia la hora (en automático) o la preferencia.
export function useTema() {
  const [estado, setEstado] = useState(estadoActual)

  useEffect(() => {
    oyentes.add(setEstado)
    setEstado(estadoActual())
    return () => oyentes.delete(setEstado)
  }, [])

  function cambiarAutomatico(automatico) {
    // Al apagar el automático queda fijo el modo que se está viendo.
    const fijo = automatico ? estado.preferencia.fijo : estado.tema
    guardarPreferencia({ ...estado.preferencia, automatico, fijo })
  }

  function elegirFijo(fijo) {
    guardarPreferencia({ ...estado.preferencia, automatico: false, fijo })
  }

  function elegirColor(color) {
    guardarPreferencia({ ...estado.preferencia, color })
  }

  return { ...estado, cambiarAutomatico, elegirFijo, elegirColor }
}

// Mientras la pantalla está abierta usa siempre este modo (la página de
// inicio con video va siempre oscura). Al salir vuelve el elegido. Es
// "layout" para que cambie antes de dibujar la pantalla (sin parpadeo).
export function useTemaFijo(tema) {
  useLayoutEffect(() => {
    temaForzado = tema
    pintar(tema, leerPreferencia().color, false)
    return () => {
      temaForzado = null
      actualizar(false)
    }
  }, [tema])
}

import { textoVence } from '../data/vencimiento.js'
import { textoFechaCorta } from './dias.js'
import { guardarJSON, leerJSON } from './almacenLocal.js'

// Avisos del Inicio del alumno (components/inicio/CarruselAvisos.jsx y
// CampanaAvisos.jsx). Antes cada aviso era un cartel aparte y se
// amontonaban arriba de "Hoy te toca"; ahora van todos juntos en un
// carrusel que gira solo y en la campanita de arriba.
//
// armarAvisosInicio devuelve la lista ya ordenada por importancia (lo de
// plata y acceso primero). Cada aviso:
//   id:    nombre fijo (sirve para recordar cuáles cerró el alumno).
//   tono:  'urgente' (naranja), 'atencion' (verde), 'info' (azul).
//   icono: 'pago' | 'reloj' | 'gimnasio' | 'grafico' | 'profe' | 'medida'.
//   texto: lo que se lee.
//   to:    a dónde lleva al tocarlo (null = solo informa).
export function armarAvisosInicio({
  perfil,
  plan,
  cuentaPendiente,
  cuentaDeBaja,
  planBloqueado,
  cartelDelEspacio,
  textoEspacio,
  avanceNuevo,
  tocaMedidas,
  ultimaMedicion,
}) {
  const avisos = []

  if (cuentaPendiente) {
    avisos.push({
      id: 'cuenta-pendiente',
      tono: 'atencion',
      icono: 'pago',
      texto: perfil?.aviso_pago
        ? 'Avisaste tu pago. Tu profe lo está revisando.'
        : 'Tu cuenta está pendiente. Tocá acá para ver cómo pagar y activarla.',
      to: '/suscripcion',
    })
  }

  if (!cuentaDeBaja && !planBloqueado && plan?.tipo === 'gracia') {
    const cuantos =
      plan.dias === 0
        ? 'Hoy es el último día para pagar sin perder el acceso.'
        : `Tenés ${plan.dias} ${plan.dias === 1 ? 'día' : 'días'} para pagar sin perder el acceso.`
    avisos.push({
      id: 'plan-gracia',
      tono: 'urgente',
      icono: 'pago',
      texto: `Tu plan venció el ${textoFechaCorta(perfil?.vencimiento)}. ${cuantos}`,
      to: '/suscripcion',
    })
  }

  if (cartelDelEspacio) {
    avisos.push({
      id: 'espacio',
      tono: 'urgente',
      icono: 'gimnasio',
      texto: textoEspacio,
      to: null,
    })
  }

  if (!cuentaPendiente && !cuentaDeBaja && !planBloqueado && plan?.tipo === 'por-vencer') {
    avisos.push({
      id: 'plan-por-vencer',
      tono: 'atencion',
      icono: 'reloj',
      texto: `Tu plan ${textoVence(plan.dias)}. Tocá acá para renovarlo.`,
      to: '/suscripcion',
    })
  }

  if (avanceNuevo) {
    avisos.push({
      id: 'evaluacion',
      tono: 'atencion',
      icono: 'grafico',
      texto: 'Tu profe publicó tu evaluación del mes. Tocá acá para verla.',
      to: '/progreso#avance',
    })
  }

  if (perfil && !perfil.profe_id) {
    avisos.push({
      id: 'sin-profe',
      tono: 'atencion',
      icono: 'profe',
      texto: 'Todavía no tenés profe asignado. Tocá acá para conocer a los profes y elegir el tuyo.',
      to: '/profes',
    })
  }

  if (tocaMedidas) {
    avisos.push({
      id: 'medidas',
      tono: 'info',
      icono: 'medida',
      texto: ultimaMedicion
        ? 'Pasaron 4 semanas desde tus últimas medidas. Tocá acá para cargar las de hoy.'
        : 'Cargá tus medidas y fotos de hoy: así vas a ver cuánto cambiás.',
      to: '/medidas',
    })
  }

  return avisos
}

// ---------- Cerrar el carrusel por un rato ----------
// La ✕ del carrusel lo esconde HORAS_SILENCIO horas (para entrenar
// tranquilo). Se guarda en el celular qué avisos estaban a la vista: si
// en ese rato aparece uno NUEVO (por ejemplo, la evaluación del mes), el
// carrusel vuelve a salir solo con ese. Pasado el plazo, vuelven todos.
// La campanita los muestra siempre, aunque el carrusel esté cerrado.
export const HORAS_SILENCIO = 12
const HORA_MS = 60 * 60 * 1000

function claveSilencio(usuarioId) {
  return `drey-avisos-cerrados-${usuarioId || 'anonimo'}`
}

export function leerSilencio(usuarioId) {
  return leerJSON(claveSilencio(usuarioId), null)
}

// Devuelve lo guardado, para que la pantalla lo use sin volver a leerlo.
export function silenciarAvisos(usuarioId, ids, ahora = Date.now()) {
  const silencio = { hasta: ahora + HORAS_SILENCIO * HORA_MS, ids: [...ids] }
  guardarJSON(claveSilencio(usuarioId), silencio)
  return silencio
}

// Los avisos que van en el carrusel (los de la campanita son todos).
export function avisosVisibles(avisos, silencio, ahora = Date.now()) {
  if (!silencio || !(silencio.hasta > ahora)) return avisos
  const cerrados = new Set(silencio.ids || [])
  return avisos.filter((aviso) => !cerrados.has(aviso.id))
}

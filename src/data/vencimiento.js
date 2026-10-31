import { diasEntre, sumarDias } from '../utils/dias.js'
import { configuracion } from './configuracion.js'

// Qué pasa cuando vence el plan de un cliente. La misma regla la usan
// el Inicio del alumno, Suscripción, la ficha del cliente y el Inicio
// del profe, así todos dicen lo mismo.
//
//   · Hasta diasAviso() antes del vencimiento: todo normal.
//   · Los últimos diasAviso() días: aviso "Tu plan vence en X días".
//   · Vencido, durante diasDeGracia() días: puede seguir entrenando, con
//     un aviso de que tiene que pagar.
//   · Después: no ve sus rutinas hasta que pague (su historial queda).
//
// Los dos números los elige el Admin en Ajustes (tabla "ajustes",
// supabase/sql/022). La base usa el mismo número de días de gracia
// (función dias_de_gracia()) para bloquear el acceso de verdad.
export function diasDeGracia() {
  return configuracion().diasDeGracia
}

export function diasAviso() {
  return configuracion().diasAviso
}

// Devuelve { tipo, dias, hasta }:
//   tipo: 'pendiente' | 'al-dia' | 'por-vencer' | 'gracia' | 'vencido'
//   dias: días que faltan para vencer (por-vencer) o para que se
//         bloquee (gracia); días desde que se bloqueó (vencido).
//   hasta: fecha en que se bloquea (en gracia).
export function estadoDelPlan(perfil, hoyISO) {
  if (!perfil || perfil.estado === 'pendiente') return { tipo: 'pendiente', dias: null }
  if (!perfil.vencimiento) return { tipo: 'al-dia', dias: null }

  const faltan = diasEntre(hoyISO, perfil.vencimiento)
  if (faltan > diasAviso()) return { tipo: 'al-dia', dias: faltan }
  if (faltan >= 0) return { tipo: 'por-vencer', dias: faltan }

  const bloqueo = sumarDias(perfil.vencimiento, diasDeGracia())
  const quedan = diasEntre(hoyISO, bloqueo)
  if (quedan >= 0) return { tipo: 'gracia', dias: quedan, hasta: bloqueo }
  return { tipo: 'vencido', dias: -quedan }
}

// Texto corto para el aviso del alumno ("vence hoy", "vence mañana",
// "vence en 3 días").
export function textoVence(dias) {
  if (dias === 0) return 'vence hoy'
  if (dias === 1) return 'vence mañana'
  return `vence en ${dias} días`
}

// Estado de la suscripción DREY de un espacio (supabase/sql/032), con la
// misma regla de aviso y gracia que la del alumno:
//   espacio: { estadoReal, sinCosto, pruebaHasta, vencimiento, avisoPago }
// Devuelve { tipo, texto, tono: 'ok' | 'alerta' | 'neutro', dias }.
//   tipo: 'sin-costo' | 'prueba' | 'prueba-terminada' | 'pendiente' |
//         'al-dia' | 'por-vencer' | 'gracia' | 'vencido' | 'pausado'
export function estadoDeEspacio(espacio, hoyISO) {
  if (!espacio) return { tipo: 'pendiente', texto: '', tono: 'neutro', dias: null }
  const real = espacio.estadoReal
  if (real === 'pausado') return { tipo: 'pausado', texto: 'Pausado', tono: 'alerta', dias: null }
  if (real === 'sin_costo' || espacio.sinCosto) {
    return { tipo: 'sin-costo', texto: 'Sin costo', tono: 'ok', dias: null }
  }
  if (real === 'prueba') {
    const dias = espacio.pruebaHasta ? diasEntre(hoyISO, espacio.pruebaHasta) : null
    return {
      tipo: 'prueba',
      texto:
        dias == null
          ? 'Prueba gratis'
          : dias === 0
            ? 'Prueba gratis · termina hoy'
            : `Prueba gratis · ${dias === 1 ? 'queda 1 día' : `quedan ${dias} días`}`,
      tono: dias != null && dias <= diasAviso() ? 'alerta' : 'neutro',
      dias,
    }
  }
  if (real === 'prueba_terminada') {
    return { tipo: 'prueba-terminada', texto: 'Terminó la prueba', tono: 'alerta', dias: null }
  }
  if (real === 'pendiente') {
    return { tipo: 'pendiente', texto: 'Sin plan', tono: 'alerta', dias: null }
  }
  const plan = estadoDelPlan({ estado: 'activo', vencimiento: espacio.vencimiento }, hoyISO)
  const textos = {
    'al-dia': 'Al día',
    'por-vencer': plan.dias != null ? `Al día · ${textoVence(plan.dias)}` : 'Al día',
    gracia: 'Vencido · en gracia',
    vencido: 'Vencido',
  }
  return {
    tipo: plan.tipo,
    texto: textos[plan.tipo] || 'Al día',
    tono: plan.tipo === 'al-dia' ? 'ok' : plan.tipo === 'por-vencer' ? 'neutro' : 'alerta',
    dias: plan.dias,
  }
}

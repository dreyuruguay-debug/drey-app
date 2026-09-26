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

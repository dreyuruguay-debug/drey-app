import { diasEntre, sumarDias } from '../utils/dias.js'

// Qué pasa cuando vence el plan de un cliente. La misma regla la usan
// el Inicio del alumno, Suscripción, la ficha del cliente y el Inicio
// del profe, así todos dicen lo mismo.
//
//   · Hasta DIAS_AVISO antes del vencimiento: todo normal.
//   · Los últimos DIAS_AVISO días: aviso "Tu plan vence en X días".
//   · Vencido, durante DIAS_DE_GRACIA días: puede seguir entrenando, con
//     un aviso de que tiene que pagar.
//   · Después: no ve sus rutinas hasta que pague (su historial queda).
//
// IMPORTANTE: DIAS_DE_GRACIA tiene que ser igual al número de la función
// dias_de_gracia() de supabase/sql/012_vencimiento_y_acceso.sql, que es
// la que de verdad bloquea el acceso en la base de datos.
export const DIAS_DE_GRACIA = 3
export const DIAS_AVISO = 5

// Devuelve { tipo, dias, hasta }:
//   tipo: 'pendiente' | 'al-dia' | 'por-vencer' | 'gracia' | 'vencido'
//   dias: días que faltan para vencer (por-vencer) o para que se
//         bloquee (gracia); días desde que se bloqueó (vencido).
//   hasta: fecha en que se bloquea (en gracia).
export function estadoDelPlan(perfil, hoyISO) {
  if (!perfil || perfil.estado === 'pendiente') return { tipo: 'pendiente', dias: null }
  if (!perfil.vencimiento) return { tipo: 'al-dia', dias: null }

  const faltan = diasEntre(hoyISO, perfil.vencimiento)
  if (faltan > DIAS_AVISO) return { tipo: 'al-dia', dias: faltan }
  if (faltan >= 0) return { tipo: 'por-vencer', dias: faltan }

  const bloqueo = sumarDias(perfil.vencimiento, DIAS_DE_GRACIA)
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

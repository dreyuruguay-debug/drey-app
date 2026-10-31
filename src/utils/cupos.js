// Cupos de alumnos de un espacio (supabase/sql/032). La regla de verdad
// la hace cumplir la base (controlar_cupo): acá solo están los textos y
// las cuentas para mostrar, en un solo lugar.

// { total: número o null (sin tope), usados } → "12 de 25 alumnos"
export function textoCupos({ total, usados }) {
  const cantidad = usados ?? 0
  if (total == null) return `${cantidad} ${cantidad === 1 ? 'alumno' : 'alumnos'} · sin tope`
  return `${cantidad} de ${total} alumnos`
}

// Porcentaje usado (0 a 100), o null si no tiene tope.
export function porcentajeCupos({ total, usados }) {
  if (total == null) return null
  if (total <= 0) return 100
  return Math.min(100, Math.round(((usados ?? 0) / total) * 100))
}

export function cuposLibres({ total, usados }) {
  if (total == null) return null
  return Math.max(0, total - (usados ?? 0))
}

// Qué decir cuando la base no deja habilitar a un alumno. Devuelve
// { texto, motivo } (motivo: 'cupo' | 'permiso' | 'suscripcion' | null),
// o null si el error no es de cupos.
export function problemaDeCupo(error) {
  const mensaje = error?.message || ''
  if (mensaje.includes('Cupo lleno')) {
    const numeros = mensaje.match(/(\d+) de (\d+)/)
    return {
      motivo: 'cupo',
      texto: numeros
        ? `Cupo lleno: ya tenés ${numeros[1]} de ${numeros[2]} alumnos habilitados.`
        : 'Cupo lleno: no quedan lugares para habilitar alumnos.',
    }
  }
  if (mensaje.includes('Sin permiso para habilitar')) {
    return {
      motivo: 'permiso',
      texto: 'En este gimnasio los alumnos los habilita el dueño. Avisale para que lo haga.',
    }
  }
  if (mensaje.includes('Suscripción DREY')) {
    return {
      motivo: 'suscripcion',
      texto: mensaje.includes('prueba_terminada')
        ? 'Terminó la prueba gratis: para habilitar alumnos hay que elegir un plan DREY.'
        : 'La suscripción DREY no está al día: hasta que se pague no se pueden habilitar alumnos.',
    }
  }
  return null
}

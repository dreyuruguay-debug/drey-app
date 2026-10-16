// Textos fijos del administrador de notificaciones (Ajustes →
// Notificaciones, pages/AdminNotificaciones.jsx). Las notificaciones en sí
// (cuáles hay, sus textos, horas, etc.) están en la base: tabla
// "tipos_aviso", supabase/sql/030.

// A quién le llega una notificación de profe ("destino" en la base).
export const DESTINOS = {
  'profe-o-admin': 'Al profe del alumno (si no tiene, al Admin)',
  profe: 'Solo al profe',
  admin: 'Solo al Admin',
  'profe-y-admin': 'Al profe y al Admin',
}

// Cómo se agrupan en la lista.
export const SECCIONES = [
  {
    disparo: 'horario',
    titulo: 'Programadas',
    detalle: 'Salen a una hora fija, cuando se cumple la condición.',
  },
  {
    disparo: 'accion',
    titulo: 'Cuando pasa algo',
    detalle: 'Salen al instante, cuando alguien hace algo en la app.',
  },
  {
    disparo: 'entrenando',
    titulo: 'Durante el entrenamiento',
    detalle: 'Las maneja el alumno desde el entrenamiento.',
  },
]

// Lo que se ve debajo del nombre de cada notificación: cuándo sale.
//   extras: { diasAviso, diasGracia } de Ajustes → Plazos.
export function resumenDeCuando(tipo, extras = {}) {
  if (tipo.disparo !== 'horario') return tipo.descripcion
  const hora = tipo.hora ? `${tipo.hora} h` : ''
  if (tipo.clave === 'hoy')
    return `Los días que tiene rutina · ${hora} (o la hora que elija el alumno)`
  if (tipo.clave === 'vence-antes')
    return `${extras.diasAviso ?? '?'} días antes de vencer · ${hora}`
  if (tipo.clave === 'vence-hoy') return `El día que vence · ${hora}`
  if (tipo.clave === 'gracia')
    return `Último día de gracia (${extras.diasGracia ?? '?'} días) · ${hora}`
  if (tipo.diasEtiqueta) return `A los ${tipo.dias} días sin entrenar · ${hora}`
  return hora
}

// A quién le llega, en pocas palabras (para la lista).
export function resumenDeAQuien(tipo, planes = []) {
  if (tipo.grupo === 'profe') return DESTINOS[tipo.destino] || ''
  if (!tipo.planes?.length) return 'Todos los alumnos'
  const nombres = tipo.planes.map((id) => planes.find((plan) => plan.id === id)?.nombre || id)
  return `Solo ${nombres.join(', ')}`
}

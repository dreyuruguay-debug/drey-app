// Perfil público de cada profe (supabase/sql/026): especialidades que se
// proponen al completarlo (el profe puede escribir otras) y modalidades.
// Los alumnos las ven en la lista de profes ("Elegí tu profe").

export const ESPECIALIDADES_SUGERIDAS = [
  'Hipertrofia',
  'Fuerza',
  'Pérdida de peso',
  'Funcional',
  'Powerlifting',
  'Crossfit',
  'Rehabilitación',
  'Adultos mayores',
  'Deportistas',
  'Running',
  'Movilidad',
  'Principiantes',
]

export const MAXIMO_ESPECIALIDADES = 8
export const MAXIMO_DESCRIPCION_PROFE = 800
export const MAXIMO_MENSAJE_SOLICITUD = 500
export const MAXIMO_RESPUESTA_SOLICITUD = 300

export const MODALIDADES = [
  { id: 'presencial', nombre: 'Presencial' },
  { id: 'online', nombre: 'Online' },
]

export function textoModalidades(modalidades = []) {
  return MODALIDADES.filter((modalidad) => modalidades.includes(modalidad.id))
    .map((modalidad) => modalidad.nombre)
    .join(' y ')
}

// "10 años de experiencia" / "1 año de experiencia" / '' si no lo puso.
export function textoExperiencia(anios) {
  const numero = Number(anios)
  if (anios === null || anios === undefined || anios === '' || !Number.isFinite(numero)) return ''
  if (numero === 0) return 'Recién empieza'
  return `${numero} ${numero === 1 ? 'año' : 'años'} de experiencia`
}

// Link a Instagram a partir de lo que escribió el profe ("@facu",
// "facu" o el link entero).
export function linkInstagram(usuario) {
  const limpio = String(usuario || '')
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '')
  return limpio ? `https://instagram.com/${limpio}` : ''
}

export function iniciales(nombre = '') {
  return (
    nombre
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((parte) => parte[0])
      .join('')
      .toUpperCase() || '·'
  )
}

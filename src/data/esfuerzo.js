// "¿Cómo te sentiste?": el grado de exigencia que el alumno elige al
// guardar un entrenamiento (del 1 al 5). Lo ven el alumno (en sus
// entrenamientos) y su profe (en la ficha del alumno).
export const NIVELES_DE_ESFUERZO = [
  { valor: 1, texto: 'Muy fácil' },
  { valor: 2, texto: 'Fácil' },
  { valor: 3, texto: 'Bien' },
  { valor: 4, texto: 'Duro' },
  { valor: 5, texto: 'Al límite' },
]

export const ESFUERZO_MAXIMO = NIVELES_DE_ESFUERZO.length

// "Exigencia 4/5 · Duro", o '' si no lo marcó.
export function textoDeEsfuerzo(esfuerzo) {
  const nivel = NIVELES_DE_ESFUERZO.find((item) => item.valor === Number(esfuerzo))
  return nivel ? `Exigencia ${nivel.valor}/${ESFUERZO_MAXIMO} · ${nivel.texto}` : ''
}

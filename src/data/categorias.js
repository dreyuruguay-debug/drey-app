// Las 7 categorías de la biblioteca de ejercicios. Un ejercicio puede
// estar en más de una (por ejemplo, un curl de bíceps en Tracción y en
// Brazos). Los músculos de cada categoría son solo la referencia que
// se muestra debajo del nombre.
export const CATEGORIAS = [
  { nombre: 'Empuje', musculos: 'Pecho · Hombros · Tríceps' },
  { nombre: 'Tracción', musculos: 'Espalda · Bíceps' },
  { nombre: 'Multiarticulares', musculos: 'Varios grupos a la vez' },
  {
    nombre: 'Piernas',
    musculos: 'Cuádriceps · Isquios · Glúteos · Aductores · Abductores · Gemelos',
  },
  { nombre: 'Zona media', musculos: 'Abdomen · Core · Lumbar' },
  { nombre: 'Cardiorrespiratorio', musculos: 'Cinta · Bicicleta · Remo · Elíptica' },
  { nombre: 'Brazos', musculos: 'Bíceps · Tríceps · Antebrazo' },
]

export const NOMBRES_CATEGORIAS = CATEGORIAS.map((categoria) => categoria.nombre)

// Categorías de un ejercicio. Si todavía no tiene ninguna asignada,
// usa su grupo muscular (así ningún ejercicio queda "perdido").
export function categoriasDeEjercicio(ejercicio) {
  if (ejercicio?.categorias?.length) return ejercicio.categorias
  return ejercicio?.grupo_muscular ? [ejercicio.grupo_muscular] : []
}
